import type { AudioClassifier } from '@mediapipe/tasks-audio';
import type { MicVAD } from '@ricky0123/vad-web/dist/real-time-vad';
import EventEmitter2 from 'eventemitter2';
import { getChunkId } from '../utils.js';
import { emitter } from '../events.js';
import {
  AUDIO_CLASSIFICATION_TOPIC,
  AudioClassificationEventDto,
  DialogueMessageDto,
  SermasToolkit,
} from '../index.js';
import { Logger } from '../logger.js';
import { AudioClassificationValue } from './audio/audio.detection.dto.js';
import { createAudioClassifier } from './audio/mediapipe/audio.classifier.js';
import classes from './audio/mediapipe/classes.json' assert { type: 'json' };

const VAD_SAMPLE_RATE = 16000;
const SPEECH_CLASSIFIER_THRESHOLD = 0.5;

const AUDIO_CLASSIFICATION_SAMPLE_SEC = 1;
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
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder.ondataavailable = () => {};
      this.mediaRecorder = undefined;
    }

    if (this.vad) {
      this.vad.pause();
      // await this.vad.destroy();
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
    const tracks = this.stream?.getTracks() || [];
    tracks.forEach((t) => (t.enabled = false));
  }

  /**
   * Restore the microphone audio stream
   */
  restore() {
    const tracks = this.stream?.getTracks() || [];
    tracks.forEach((t) => (t.enabled = true));
  }

  async start(stream?: MediaStream): Promise<boolean> {
    if (!this.hasMediaSupport()) {
      return false;
    }

    // sample rate from
    await this.startClassifier();
    const ok = await this.startVAD(stream);
    // start media recorder to detect audio classes
    // if (this.vad) {
    //     await this.startMediaRecorder(this.vad.audioContext.createMediaStreamDestination().stream)
    // }

    return ok;
  }

  async startVAD(stream?: MediaStream) {
    this.logger.debug(`Loading VAD`);

    const vadModuleLoader = await import('@ricky0123/vad-web/dist/index');
    const vadModule = vadModuleLoader.default || vadModuleLoader;

    try {
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
        this.speechDetected(ev);
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
    } catch (e: any) {
      this.logger.error(`Failed to start VAD ${e.stack}`);
      this.emit('error', e);
      return false;
    }

    return true;
  }

  async startMediaRecorder(stream: MediaStream) {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder.ondataavailable = () => {};
    }

    const sample = AUDIO_CLASSIFICATION_SAMPLE_SEC * 1000;

    this.mediaRecorder = new MediaRecorder(stream, {});
    this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
      (async () => {
        try {
          const arrayBuffer = await e.data.arrayBuffer();
          const arr = this.convertBlock(arrayBuffer);
          // const sampleRate = this.getSampleRate()
          this.classify(arr);
        } catch {}
      })();
    };
    this.mediaRecorder.start(sample);
  }

  convertBlock(buffer: ArrayBuffer) {
    const incomingData = new Uint8Array(buffer);
    const l = incomingData.length;
    const outputData = new Float32Array(incomingData.length);
    for (let i = 0; i < l; i++) {
      outputData[i] = (incomingData[i] - 128) / 128.0;
    }
    return outputData;
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
    if (this.classifier) {
      this.classifier.close();
    }
    this.classifier = await createAudioClassifier();
    if (sampleRate) this.classifier.setDefaultSampleRate(sampleRate);
  }

  protected hasMediaSupport(): boolean {
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

  async createMicrophoneStream(
    constraints?: AudioConstraints,
  ): Promise<MediaStream | undefined> {
    this.logger.log('start mic');

    if (this.stream) {
      this.logger.debug('mic is already started');
      return this.stream;
    }

    if (!this.hasMediaSupport()) {
      this.logger.error('mic not supported');
      this.emit('error', new Error('Microphone not supported'));
      return undefined;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(constraints || {}),
          sampleRate: { exact: VAD_SAMPLE_RATE },
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
        },
      });
    } catch (e: any) {
      this.logger.error(`Failed to get mic stream: ${e.stack}`);
      this.stream = undefined;
      this.emit('error', e);
    }

    return this.stream;
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

  speechDetected(ev) {
    if (!this.toolkit) return;
    if (ev.wav) {
      this.sendSpeechAudio('wav', ev.wav);
    } else if (ev.audio) {
      const sampleRate = this.getSampleRate() || 16000;
      this.sendSpeechAudio('raw', ev.audio, sampleRate);
    }
  }

  async sendSpeechAudio(
    type: 'wav' | 'raw',
    audio: Uint32Array | ArrayBuffer,
    sampleRate?: number,
  ) {
    if (!this.toolkit) return;

    if (!this.toolkit.getSessionId()) {
      this.toolkit.emit('detection.intent', {
        status: 'started',
        source: 'speak',
        trigger: '',
      });
      return;
    }

    this.pause();

    this.logger.log(`Sending speech chunk type=${type}`);

    const ev: DialogueMessageDto = {
      appId: this.toolkit.getAppId(),
      gender: await this.toolkit.getAvatarGender(),
      avatar: (await this.toolkit.getAvatarConfig())?.id,
      actor: 'user',
      language: this.toolkit.getAppLanguage(),
      chunkId: getChunkId(),
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
