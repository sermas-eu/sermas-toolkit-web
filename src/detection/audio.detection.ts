import type { AudioClassifier } from '@mediapipe/tasks-audio';
import type { MicVAD } from '@ricky0123/vad-web/dist/real-time-vad';
import EventEmitter2 from 'eventemitter2';
import { emitter } from '../events.js';
import {
  AUDIO_CLASSIFICATION_TOPIC,
  AudioClassificationEventDto,
  DialogueMessageDto,
  SermasToolkit,
} from '../index.js';
import { Logger } from '../logger.js';
import { getChunkId } from '../utils.js';
import { AudioClassificationValue } from './audio/audio.detection.dto.js';
import { createAudioClassifier } from './audio/mediapipe/audio.classifier.js';
import classes from './audio/mediapipe/classes.json' assert { type: 'json' };

const VAD_SAMPLE_RATE = 16000;
const SPEECH_CLASSIFIER_THRESHOLD = 0.5;

const AUDIO_CLASSIFICATION_THRESHOLD = 0.3;
const AUDIO_CLASSIFICATION_SKIP_CLASSES = ['Static', 'Silence', 'White noise'];

type AudioConstraints = Omit<
  MediaTrackConstraints,
  'channelCount' | 'echoCancellation' | 'autoGainControl' | 'noiseSuppression'
>;

export class AudioDetection extends EventEmitter2 {
  private readonly logger = new Logger(AudioDetection.name);

  private stream?: MediaStream;
  private vad?: MicVAD;
  private classifier?: AudioClassifier;
  private mediaRecorder?: MediaRecorder;

  constructor(private readonly toolkit?: SermasToolkit) {
    super();
  }

  async stop() {
    this.logger.debug(`Stop microphone detection`);
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder.ondataavailable = () => {};
      this.mediaRecorder = undefined;
    }

    if (this.vad) {
      this.vad.pause();
    }

    if (this.stream) {
      this.pause();
    }

    if (this.classifier) {
      this.classifier.close();
    }
    this.emit('stopped');
    this.removeAllListeners();
    this.logger.log('Audio detection stopped');
  }

  getSampleRate(): number | undefined {
    return this.vad?.options.frameSamples;
  }

  /**
   * Pause the microphone audio stream
   */
  pause() {
    this.vad?.pause();
  }

  /**
   * Restore the microphone audio stream
   */
  restore() {
    this.vad?.start();
  }

  async start(stream?: MediaStream): Promise<boolean> {
    this.logger.debug(`Start microphone detection`);
    if (this.stream) {
      try {
        await this.stop();
      } catch {}
    }

    if (!this.hasMediaSupport()) {
      return false;
    }

    // sample rate from
    try {
      await this.startClassifier();
    } catch (e: any) {
      this.logger.warn(`Failed to start classifier: ${e.stack}`);
    }

    if (!stream) {
      stream = await this.createMicrophoneStream();
    }

    const ok = await this.startVAD(stream);
    if (!ok) {
      this.logger.warn(`Failed to start VAD module`);
    }
    // start media recorder to detect audio classes
    // if (this.vad) {
    //     await this.startMediaRecorder(this.vad.audioContext.createMediaStreamDestination().stream)
    // }

    return ok;
  }

  async enableOnnxRuntimeDebug() {
    if (typeof localStorage === undefined) return;
    if (localStorage.getItem('ORT_DEBUG') !== '1') return;

    try {
      const ort = await import('onnxruntime-web');

      ort.env.debug = true;
      ort.env.logLevel = 'verbose';

      // ort.env.wasm.wasmPaths = {
      //   'ort-wasm-simd-threaded.wasm': '/ort-wasm-simd-threaded.wasm',
      //   'ort-wasm-simd.wasm': '/ort-wasm-simd.wasm',
      //   'ort-wasm.wasm': '/ort-wasm.wasm',
      //   'ort-wasm-threaded.wasm': '/ort-wasm-threaded.wasm',
      // };
    } catch (e: any) {
      this.logger.error(`Failed to set ORT base paths: ${e.message}`);
    }
  }

  async startVAD(stream?: MediaStream) {
    await this.enableOnnxRuntimeDebug();

    try {
      this.logger.debug(`Loading VAD`);
      const vadModuleLoader = await import('@ricky0123/vad-web/dist/index');
      const vadModule = vadModuleLoader.default || vadModuleLoader;

      const onSpeech = async (
        op: 'started' | 'stopped',
        audio?: Float32Array,
      ) => {
        // notify toolkit
        emitter.emit('detection.audio', op);

        if (!audio) return;
        const isSpeech = await this.classify(audio);
        if (!isSpeech) {
          this.logger.debug(`Audio does not classify as speech`);
          return;
        }
        this.logger.debug(`Speech detected`);
        const wav = vadModule.utils.encodeWAV(audio);
        const ev = { op, audio, wav };
        this.emit('speech', ev);
        await this.speechDetected(ev);
      };

      this.vad = await vadModule.MicVAD.new({
        positiveSpeechThreshold: 0.7,
        minSpeechFrames: 3,
        preSpeechPadFrames: 5,
        stream,
        workletURL: '/vad.worklet.bundle.min.js',
        onSpeechEnd: (audio: Float32Array) => {
          onSpeech('stopped', audio);
        },
        onSpeechStart: () => {
          onSpeech('started');
        },
      });

      this.stream = stream ? stream : this.vad.options.stream;

      // enable stream track(s)
      const tracks = this.stream?.getTracks() || [];
      tracks.forEach((t) => (t.enabled = true));

      this.vad.start();

      this.emit('started');
      this.logger.debug(`VAD started (sampleRate=${this.getSampleRate()})`);

      return true;
    } catch (e: any) {
      this.logger.error(`Failed to start VAD: ${e.message}`);
      this.logger.debug(e);
      // this.emit('error', e);
      return false;
    }
  }

  async classify(audio: Float32Array, sampleRate?: number) {
    if (!audio || !audio.length) return;

    let matchSpeech = false;
    const results =
      this.classifier?.classify(audio, sampleRate || VAD_SAMPLE_RATE) || [];

    const classMatches: string[] = [];
    const classifications: AudioClassificationValue[] = [];

    const classesMaps: Record<string, number> = {};

    results.forEach((r) => {
      r.classifications.forEach((cs) => {
        cs.categories.forEach((c) => {
          const humanClasses: any = classes.human;

          // skip classes
          if (AUDIO_CLASSIFICATION_SKIP_CLASSES.includes(c.categoryName))
            return;

          // check if match speech
          if (
            humanClasses[c.index.toString()] &&
            c.score > SPEECH_CLASSIFIER_THRESHOLD
          ) {
            matchSpeech = true;
          }

          // emit audio classification
          if (
            !humanClasses[c.index.toString()] &&
            c.score > AUDIO_CLASSIFICATION_THRESHOLD
          ) {
            classesMaps[c.categoryName] = classesMaps[c.categoryName] || 0;
            // avoid duplicates
            if (classesMaps[c.categoryName] < c.score) {
              classesMaps[c.categoryName] = c.score;

              const payload: AudioClassificationValue = {
                value: c.categoryName,
                probability: c.score,
              };

              classifications.push(payload);
            }
          }

          classMatches.push(
            `"${c.categoryName}" score=${c.score} id=${c.index}`,
          );
        });
      });
    });

    if (classMatches.length)
      this.logger.debug(`Matches: ${classMatches.join('; ')}`);
    if (classifications.length) {
      this.logger.debug(
        `classification event ${JSON.stringify(classifications)}`,
      );
      this.emit('classification', classifications);
      this.sendAudioClassification(classifications);
    }

    return matchSpeech;
  }

  async startClassifier(sampleRate?: number) {
    try {
      if (this.classifier) {
        this.classifier.close();
      }
      this.classifier = await createAudioClassifier();
      if (sampleRate) this.classifier.setDefaultSampleRate(sampleRate);
    } catch (e: any) {
      this.logger.warn(`Failed to start classifier: ${e.message}`);
      this.logger.debug(e);
    }
  }

  protected hasMediaSupport(): boolean {
    // not a browser env
    if (typeof navigator === 'undefined') return false;
    const _navigator = navigator as any;
    if (!_navigator.getUserMedia) {
      _navigator.getUserMedia =
        _navigator.getUserMedia ||
        _navigator.webkitGetUserMedia ||
        _navigator.mozGetUserMedia ||
        _navigator.msGetUserMedia;
    }
    return _navigator.getUserMedia ? true : false;
  }

  createMicrophoneStream(
    constraints?: AudioConstraints,
  ): Promise<MediaStream | undefined> {
    this.logger.log('start mic');

    if (this.stream) {
      this.logger.debug('mic is already started');
      return Promise.resolve(this.stream);
    }

    if (!this.hasMediaSupport()) {
      this.logger.error('mic not supported');
      this.emit('error', new Error('Microphone not supported'));
      return Promise.resolve(undefined);
    }

    // NOTE async fails to catch PermissionError, using Promise works <3
    return navigator.mediaDevices
      .getUserMedia({
        audio: {
          ...(constraints || {}),
          // sampleRate: { exact: VAD_SAMPLE_RATE },
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
        },
      })
      .then((stream) => {
        this.stream = stream;
        return stream;
      })
      .catch((e) => {
        this.logger.error(`Failed to get mic stream: ${e.message}`);
        this.stream = undefined;
        // this.emit('error', e);
        return Promise.resolve(undefined);
      });
  }

  sendAudioClassification(detections: AudioClassificationValue[]) {
    if (!this.toolkit) return;
    const payload: AudioClassificationEventDto = {
      appId: this.toolkit.getAppId(),
      source: 'avatar',
      sessionId: this.toolkit.getSessionId(),
      ts: new Date().toString(),
      detections,
    };
    this.toolkit.getBroker().publish(AUDIO_CLASSIFICATION_TOPIC, payload);
  }

  async speechDetected(ev) {
    if (!this.toolkit) return;
    if (ev.wav) {
      this.sendSpeechAudio('wav', ev.wav);
    } else if (ev.audio) {
      const sampleRate = this.getSampleRate() || 16000;
      await this.sendSpeechAudio('raw', ev.audio, sampleRate);
    }
  }

  async sendSpeechAudio(
    type: 'wav' | 'raw',
    audio: Uint32Array | ArrayBuffer,
    sampleRate?: number,
  ) {
    if (!this.toolkit) return;

    if (
      this.toolkit.getSettings().get().interactionStart == 'speak' &&
      !this.toolkit.getSessionId()
    ) {
      this.toolkit.triggerInteraction('microphone', 'start');
      return;
    }

    if (!this.toolkit.getSessionId()) {
      return;
    }

    this.pause();

    this.logger.log(`Sending speech chunk type=${type}`);

    const chunkId = getChunkId();
    const ev: DialogueMessageDto = {
      appId: this.toolkit.getAppId(),
      gender: await this.toolkit.getAvatarGender(),
      avatar: (await this.toolkit.getAvatarConfig())?.id,
      actor: 'user',
      language: this.toolkit.getAppLanguage(),
      messageId: chunkId,
      chunkId,
      text: '',
      sessionId: this.toolkit.getSessionId(),
      userId: this.toolkit.getUserId(),
    };

    const formData = new FormData();
    const blob = new Blob([audio], {
      type: type === 'raw' ? 'application/octet-stream' : 'audio/wav',
    });
    formData.append('file', blob, 'audio.wav');
    for (const key in ev) {
      formData.append(key, ev[key]);
    }

    try {
      await this.toolkit.getApi().sendAudio(formData, {
        sampleRate,
      });
      this.logger.debug(`Audio clip sent`);
    } catch (err: any) {
      this.logger.error(`Failed to send clip: ${err.stack}`);
    } finally {
      this.restore();
    }
  }
}
