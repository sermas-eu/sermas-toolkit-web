import type { AudioClassifier } from '@mediapipe/tasks-audio';
import {
  ONNXRuntimeAPI,
  SpeechProbabilities,
} from '@ricky0123/vad-web/dist/models.js';
import type {
  MicVAD,
  RealTimeVADOptions,
} from '@ricky0123/vad-web/dist/real-time-vad';
import axios from 'axios';
import { Buffer } from 'buffer';
import EventEmitter2 from 'eventemitter2';
import { emitter } from '../events.js';
import {
  AUDIO_CLASSIFICATION_TOPIC,
  AudioClassificationEventDto,
  DialogueMessageDto,
  SermasToolkit,
} from '../index.js';
import { Logger } from '../logger.js';
import { getChunkId, getMessageId } from '../utils.js';
import {
  AudioClassificationValue,
  SpeechSampleResult,
} from './audio/audio.detection.dto.js';
import { createAudioClassifier } from './audio/mediapipe/audio.classifier.js';
import classes from './audio/mediapipe/classes.json' assert { type: 'json' };
import { SpeechStreamer } from './audio/speech-streamer.js';
import { float32ToInt16Buffer } from './audio/util.js';

// use broker or HTTP api to send audio buffer
const SEND_VIA_BROKER = true;
// stream response as frames
const STREAM_SPEECH = true;

const VAD_SAMPLE_RATE = 16000;
const SPEECH_CLASSIFIER_THRESHOLD = 0.5;

const AUDIO_CLASSIFICATION_THRESHOLD = 0.3;
const AUDIO_CLASSIFICATION_SKIP_CLASSES = ['Static', 'Silence', 'White noise'];

// number of samples to collect to evaluate proability of speaking while users is actively speaking
const MIN_SPEECH_SAMPLING = 10;
// minimum length of speech before providing feedback on speech probability
const MIN_SPEECH_LENGTH = 800;
// maximum length of speech before resetting the detection
const MAX_SPEECH_LENGTH = 20 * 1000;
// minimum probability an ongoing input is actual user speech
const MIN_SPEECH_SAMPLE_PROBABILITY = 0.6;

const vadDefaultParams = {
  // positiveSpeechThreshold: 0.85,
  // minSpeechFrames: 2,
  // preSpeechPadFrames: 13,

  // positiveSpeechThreshold:
  // number - determines the threshold over which a probability is considered to indicate the presence of speech. default: 0.5
  positiveSpeechThreshold: 0.5,
  // negativeSpeechThreshold:
  // number - determines the threshold under which a probability is considered to indicate the absence of speech. default: 0.35
  negativeSpeechThreshold: 0.35,
  // redemptionFrames:
  // number - number of speech-negative frames to wait before ending a speech segment. default: 8
  redemptionFrames: 8,
  // frameSamples:
  // number - the size of a frame in samples. For the older (default) Silero model, this should probably be 1536.
  // For the new, Silero version 5 model, it should be 512. default: 1536
  // frameSamples: 1536,
  // preSpeechPadFrames:
  // number - number of audio frames to prepend to a speech segment. default: 1
  preSpeechPadFrames: 3,
  // minSpeechFrames:
  // number - minimum number of speech-positive frames for a speech segment. default: 3
  minSpeechFrames: 3,
};

type AudioConstraints = Omit<
  MediaTrackConstraints,
  'channelCount' | 'echoCancellation' | 'autoGainControl' | 'noiseSuppression'
>;

type SpeechSampling = {
  speechLength: number;
  speechDetectionSamples: boolean[];
  probability: number;
  start: Date;
  started: boolean;
};

const defaultSpeechSamples = (started = false): SpeechSampling => ({
  probability: 0,
  speechDetectionSamples: [],
  speechLength: 0,
  start: new Date(),
  started,
});

export class AudioDetection extends EventEmitter2 {
  private readonly logger = new Logger(AudioDetection.name);

  private speechSamples: SpeechSampling = defaultSpeechSamples();

  private vad?: MicVAD;
  private vadParams: Partial<RealTimeVADOptions> = {};

  private stream?: MediaStream;

  private classifier?: AudioClassifier;
  private mediaRecorder?: MediaRecorder;

  private chunkId?: string;

  private readonly speechStreamer: SpeechStreamer = new SpeechStreamer();

  // from vad.utils.encodeWAV
  private encodeWAV: (
    samples: Float32Array,
    format?: number,
    sampleRate?: number,
    numChannels?: number,
    bitDepth?: number,
  ) => ArrayBuffer;

  constructor(private readonly toolkit?: SermasToolkit) {
    super();
  }

  resetChunkId() {
    this.chunkId = undefined;
    return this.getChunkId();
  }

  getChunkId() {
    if (!this.chunkId) {
      this.chunkId = getChunkId();
    }
    return this.chunkId;
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

    this.chunkId = undefined;

    this.logger.log('Audio detection stopped');
  }

  isStreamEnabled() {
    return SEND_VIA_BROKER && STREAM_SPEECH;
  }

  setVADParams(params: Record<string, any> = {}) {
    this.vadParams = params;
  }

  getVADConfig(): RealTimeVADOptions | undefined {
    return this.vad?.options;
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

  private resetSpeechSamples(started = false) {
    this.speechSamples = defaultSpeechSamples(started);
  }

  async start(stream?: MediaStream): Promise<boolean> {
    this.logger.debug(`Start microphone detection`);
    if (this.stream) {
      try {
        await this.stop();
      } catch {}
    }

    if (!this.hasMediaSupport()) {
      this.logger.warn(`missing media support`);
      return false;
    }

    // sample rate from
    try {
      await this.startClassifier();
      this.logger.debug(`Started audio classifier`);
    } catch (e: any) {
      this.logger.warn(`Failed to start classifier: ${e.stack}`);
    }

    if (!stream) {
      this.logger.debug(`Create microphone stream`);
      stream = await this.createMicrophoneStream();
    }

    const ok = await this.startVAD(stream);
    if (!ok) {
      this.logger.warn(`Failed to start VAD module`);
    } else {
      this.logger.debug(`VAD module loaded`);
    }

    // start media recorder to detect audio classes
    // if (this.vad) {
    //     await this.startMediaRecorder(this.vad.audioContext.createMediaStreamDestination().stream)
    // }

    return ok;
  }

  private async onSpeech(op: 'started' | 'stopped', audio?: Float32Array) {
    // notify toolkit
    emitter.emit('detection.audio', op);

    // audio is available only on 'stopped'
    if (!audio) return;

    this.resetSpeechSamples();
    const isSpeech = await this.classify(audio);

    this.logger.debug(`Audio ${isSpeech ? ' ' : 'NOT '}classify as speech`);
    emitter.emit('detection.speech', { speech: isSpeech });

    if (isSpeech) {
      this.logger.debug(`Speech detected`);
      await this.speechDetected(audio);
    } else {
      if (this.isStreamEnabled()) {
        // explicitly release buffer backend side
        await this.sendStreamCompletion(false);
      }
    }
  }

  private onFrameProcessed(probs: SpeechProbabilities, frame: Float32Array) {
    // send stream frame
    if (this.isStreamEnabled()) {
      const frames = this.speechStreamer.onFrame(probs, frame);
      for (const f of frames) {
        this.sendStreamFrame(f);
      }
    }

    // notify toolkit that user speech may be ongoing
    const valid = this.evaluateSpeechProbability(probs);
    if (!valid) return;

    const isSpeaking =
      this.speechSamples.probability > MIN_SPEECH_SAMPLE_PROBABILITY;

    const result: SpeechSampleResult = {
      isSpeaking: isSpeaking,
      probability: this.speechSamples.probability,
      speechLength: this.speechSamples.speechLength,
    };

    this.emit('speaking', result);
  }

  private evaluateSpeechProbability(probs: SpeechProbabilities): boolean {
    if (!this.speechSamples.started) return false;

    // calculate the percentage of positive speech detection and emit a speaking event
    this.speechSamples.speechDetectionSamples.push(
      probs.isSpeech > (this.vadParams.positiveSpeechThreshold || 0.85),
    );

    if (
      this.speechSamples.speechDetectionSamples.length < MIN_SPEECH_SAMPLING
    ) {
      return false;
    }

    // clear queue longer than MIN_SPEECH_SAMPLING
    if (
      this.speechSamples.speechDetectionSamples.length >
      MIN_SPEECH_SAMPLING + 1
    ) {
      this.speechSamples.speechDetectionSamples.splice(
        0,
        this.speechSamples.speechDetectionSamples.length - MIN_SPEECH_SAMPLING,
      );
    }

    this.speechSamples.speechLength =
      Date.now() - this.speechSamples.start.getTime();

    if (this.speechSamples.speechLength < MIN_SPEECH_LENGTH) {
      return false;
    }

    if (this.speechSamples.speechLength > MAX_SPEECH_LENGTH) {
      this.resetSpeechSamples();
      return false;
    }

    const positiveMatches = this.speechSamples.speechDetectionSamples.filter(
      (v) => v,
    ).length;
    this.speechSamples.probability =
      positiveMatches / this.speechSamples.speechDetectionSamples.length;

    // console.warn(
    //   'length',
    //   this.speechSamples.speechDetectionSamples.length,
    //   'probability',
    //   this.speechSamples.probability,
    //   'speechLength',
    //   this.speechSamples.speechLength,
    // );

    if (this.speechSamples.probability < 0.2) return false;

    return true;
  }

  async startVAD(stream?: MediaStream) {
    // await this.enableOnnxRuntimeDebug();
    if (this.vad) return true;

    try {
      this.logger.debug(`Loading VAD`);
      const vadModuleLoader = await import('@ricky0123/vad-web/dist/index');
      const vadModule = vadModuleLoader.default || vadModuleLoader;

      this.encodeWAV = vadModule.utils.encodeWAV;

      this.vadParams = Object.assign({}, vadDefaultParams, this.vadParams);

      this.vad = await vadModule.MicVAD.new({
        ...this.vadParams,
        stream,
        workletURL: '/vad.worklet.bundle.min.js',
        modelURL: '/silero_vad.onnx',
        modelFetcher: async (path: string) => {
          this.logger.debug(`Loading VAD model ${path}`);
          const res = await axios.get(path, {
            responseType: 'arraybuffer',
          });
          return res.data;
        },
        ortConfig: (ort: ONNXRuntimeAPI) => {
          // ort.env.wasm.wasmPaths =
          //   'https://unpkg.com/onnxruntime-web@dev/dist/';
          ort.env.wasm.wasmPaths = '/';
          return ort;
        },

        onSpeechEnd: (audio: Float32Array) => {
          this.resetSpeechSamples();
          this.onSpeech('stopped', audio);
        },
        onSpeechStart: () => {
          this.resetSpeechSamples(true);
          this.resetChunkId();
          this.onSpeech('started');
        },
        onFrameProcessed: (probs: SpeechProbabilities, frame: Float32Array) => {
          this.onFrameProcessed(probs, frame);
        },
        // onVADMisfire: () => {
        // console.warn('MISFIRE');
        // },
      });

      this.stream = stream ? stream : this.vad.options.stream;

      // enable stream track(s)
      const tracks = this.stream?.getTracks() || [];
      tracks.forEach((t) => (t.enabled = true));

      this.vad.start();

      this.emit('started');
      this.logger.debug(
        `VAD started (options=${JSON.stringify(this.vad.options)})`,
      );

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
          if (AUDIO_CLASSIFICATION_SKIP_CLASSES.includes(c.categoryName)) {
            this.logger.debug(`Skip class ${c.categoryName}`);
            return;
          }
          // check if match speech
          if (
            humanClasses[c.index.toString()] &&
            c.score > SPEECH_CLASSIFIER_THRESHOLD
          ) {
            matchSpeech = true;
          }
          this.logger.debug(
            `Match speech: ${matchSpeech ? 'YES' : 'NO'} (${c.index}) ${c.score} > ${SPEECH_CLASSIFIER_THRESHOLD}`,
          );

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

  async speechDetected(audio: Float32Array) {
    if (!this.toolkit) return;

    const wav = this.encodeWAV(audio, 1, 16000, 1, 16);

    const ev = { op: 'stopped', audio, wav };
    this.emit('speech', ev);

    if (this.isStreamEnabled()) {
      await this.sendStreamCompletion(true);
      return;
    }

    await this.sendSpeechAudio('wav', ev.wav);
  }

  async sendSpeechAudio(
    type: 'wav' | 'raw',
    audio: ArrayBuffer,
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

    try {
      if (SEND_VIA_BROKER) {
        this.toolkit
          .getBroker()
          .publish(
            `dialogue/user-speech/${this.toolkit.getSessionId()}/${getChunkId()}`,
            Buffer.from(new Uint8Array(audio)),
            false,
          );
      } else {
        // send over HTTP API
        const ev: DialogueMessageDto = {
          appId: this.toolkit.getAppId(),
          gender: await this.toolkit.getAvatarGender(),
          avatar: (await this.toolkit.getAvatarConfig())?.id,
          actor: 'user',
          language: this.toolkit.getAppLanguage(),
          messageId: getMessageId(),
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

        const settings = this.toolkit.getSettings().get();
        formData.append('ttsEnabled', settings.ttsEnabled ? 'true' : 'false');

        await this.toolkit.getApi().sendAudio(formData, {
          sampleRate,
        });
      }

      this.logger.debug(`Audio clip sent`);
    } catch (err: any) {
      this.logger.error(`Failed to send clip: ${err.stack}`);
    } finally {
      this.restore();
    }
  }

  async sendStreamFrame(frame: Float32Array) {
    if (!this.toolkit) return;

    const sessionId = this.toolkit?.getSessionId();
    if (!sessionId) return;

    const chunkId = this.getChunkId();

    this.logger.verbose(`Send frame chunkId=${chunkId}`);

    const buffer = float32ToInt16Buffer(frame);

    this.sendStream({
      chunkId,
      sessionId,
      frame: buffer,
    });
  }

  async sendStreamCompletion(isSpeech: boolean) {
    if (!this.toolkit) return;

    const sessionId = this.toolkit?.getSessionId();
    if (!sessionId) return;

    const chunkId = this.getChunkId();

    this.logger.verbose(`Send stream completion chunkId=${chunkId}`);

    this.sendStream({
      sessionId,
      chunkId,
      data: {
        isSpeech,
      },
    });
  }

  private sendStream(data: {
    chunkId: string;
    sessionId: string;
    frame?: Buffer;
    data?: { isSpeech: boolean };
  }) {
    if (!this.toolkit) return;

    this.toolkit
      .getBroker()
      .publish(
        `dialogue/user-speech/stream/${data.sessionId}/${data.chunkId}`,
        data.frame ? data.frame : data.data,
        data.frame ? false : true,
        2,
      );
  }
}
