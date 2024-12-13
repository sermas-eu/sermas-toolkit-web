import {
  Emotion,
  MqttMessageEvent,
  UserCharacterizationEventSource,
} from '../dto.js';
import { emitter } from '../events.js';

import { HolisticV1Results } from '../detection/index.js';
import { Logger } from '../utils.js';

import {
  AudioQueue,
  AvatarAudioPlaybackStatus,
  AvatarFaceBlendShape,
  AvatarModel,
  LipSync,
} from './index.js';

import {
  DialogueMessageDto,
  SessionChangedDto,
  UserCharacterizationEventDto,
} from '@sermas/api-client';
import { ListenerFn } from 'eventemitter2';
import { EmotionBlendShape } from './animations/blendshapes/lib/index.js';
import { VisemeType } from './animations/blendshapes/lib/viseme/index.js';

const logger = new Logger('webavatar.handler');

export class WebAvatarHandler {
  private lastSet: { time: number; emotion: string };

  private sessionStarted = false;

  private audioQueue: AudioQueue[] = [];
  private processedQueue = 0;
  private processedQueueTimer: NodeJS.Timeout;

  private lipsync?: LipSync;
  private isPlaying = false;

  // register callbacks to init/destroy. Bind `this` as function context
  callbacks: Record<string, ListenerFn> = {
    'detection.characterization': this.onDetection,
    'dialogue.speech': this.onSpeech,
    'dialogue.messages': this.onDialogueMessage,
    'session.session': this.onSession,
    'avatar.face': this.setFace,
    'avatar.speech.stop': this.onForceStop,
    'dialogue.stop': this.onForceStop,
    'detection.pose': this.setPose,
    'detection.audio': this.setListening,
  };

  constructor(private readonly avatar: AvatarModel) {
    //
  }

  toggleAudio(enabled?: boolean) {
    this.lipsync?.toggleAudio(enabled);
  }

  onForceStop(chunkId?: string) {
    if (!chunkId) {
      this.audioQueue = !chunkId
        ? []
        : this.audioQueue.filter((q) => q.chunkId > chunkId);
    }

    this.lipsync?.stopAudio();
  }

  startSpeech(chunkId: string) {
    logger.debug('playing speech started');

    const ev: AvatarAudioPlaybackStatus = { status: 'started', chunkId };
    emitter.emit('avatar.speech', ev);

    this.avatar.getAnimation()?.playGestureTalking();
  }

  async pauseSpeech() {
    await this.lipsync?.pause();
  }

  async resumeSpeech() {
    await this.lipsync?.resume();
  }

  stopSpeech(chunkId?: string) {
    logger.debug('playing speech stopped');

    const ev: AvatarAudioPlaybackStatus = { status: 'ended', chunkId };
    emitter.emit('avatar.speech', ev);

    this.avatar.getAnimation()?.playGestureIdle();
  }

  // onPlaybackChange(ev: AvatarAudioPlaybackStatus) {
  //   this.avatarModel.setSpeaking(ev.status !== "ended")
  // }

  onDetection(ev: UserCharacterizationEventDto) {
    if (ev.source !== UserCharacterizationEventSource.emotion_tracker) return;

    // console.warn("EV", ev)

    if (!this.avatar) return;

    if (!ev.detections || !ev.detections.length) return;
    const { emotion } = ev.detections[0];

    const emotionValue = emotion.value as Emotion;

    if (
      this.lastSet &&
      (Date.now() - this.lastSet.time < 1000 ||
        this.lastSet.emotion === emotionValue)
    )
      return;

    // logger.log(emotion.value, emotion.probability);
    this.lastSet = {
      time: Date.now(),
      emotion: emotionValue,
    };
    // sendStatus(`set face ${emotion.value}`);

    // this.avatarModel.play('gesture', emotion.value);
    logger.debug(`Set emotion ${emotionValue}`);
    this.avatar.getBlendShapes()?.setEmotion(emotionValue);
  }

  setListening(op: 'started' | 'stopped') {
    if (op === 'started') {
      this.stopSpeech();
      // move only if the session has started
      if (this.sessionStarted) {
        this.avatar.getAnimation()?.playGesture('gesture_listening');
      }
    } else {
      this.avatar.getAnimation()?.playGesture('gesture_idle');
    }
  }

  onSession(ev: SessionChangedDto) {
    if (ev.operation === 'created') {
      this.sessionStarted = true;
      // avatar greeting
      this.avatar.getAnimation()?.playGesture('gesture_waving');
    }
    if (ev.operation === 'updated') {
      if (ev.record.closedAt) {
        this.sessionStarted = false;
        // avatar bye bye
        this.avatar.getAnimation()?.playGesture('gesture_waving');
      }
    }
  }

  onSpeech(ev: unknown, raw: MqttMessageEvent) {
    if (!this.lipsync) return;

    const buffer = raw.message.payload as any as Uint8Array;

    const [, chunkId] = raw.context;

    logger.debug(`Queued speech ${chunkId} size=${buffer.byteLength / 1000}kb`);

    // already playing, add to queue
    this.audioQueue.push({ chunkId, buffer });

    if (this.lipsync?.speaking) {
      logger.debug(`lypsync is speaking`);
      return;
    }

    this.playAudio();
  }

  playAudio(wait = 3) {
    if (this.isPlaying) {
      logger.debug(`already playing`);
      return;
    }

    if (!this.audioQueue.length) return;

    const size = this.audioQueue.reduce(
      (sum, { buffer }) => sum + buffer.byteLength / 1000,
      0,
    );

    // to allow the sentences to be wrapped together,
    // wait to reach a threshold before playing
    // const threshold = 100;
    // if (size < threshold && wait < 2) {
    if (this.processedQueue < 2 && this.audioQueue.length < 3 && wait > 0) {
      const waitFor = 200 / wait;
      logger.debug(
        `Waiting queue threshold to be reached size=${size}kb wait=${wait} length=${this.audioQueue.length} waitFor=${waitFor}`,
      );
      setTimeout(() => this.playAudio(wait - 1), waitFor);
      return;
    }

    this.isPlaying = true;

    const raw = this.audioQueue
      .sort((a, b) => (a.chunkId > b.chunkId ? 1 : -1))
      .splice(0, 1)[0];

    logger.debug(`play queued speech chunkId=${raw.chunkId}`);

    this.lipsync?.startFromAudioFile(raw.buffer as Uint8Array, raw.chunkId);

    this.processedQueue++;
    if (this.processedQueueTimer) clearTimeout(this.processedQueueTimer);
    this.processedQueueTimer = setTimeout(() => {
      logger.debug('processed queue counter cleared');
      this.processedQueue = 0;
    }, 10 * 1000);
  }

  onDialogueMessage(ev: DialogueMessageDto) {
    if (ev.actor === 'user') return;
    if (!ev.text) {
      // empty text comes when the user speech is not recognizable
      this.stopSpeech();
      return;
    }
  }

  setFace(blendingShapes: AvatarFaceBlendShape[], emotion?: EmotionBlendShape) {
    if (emotion) {
      logger.debug(`set face emotion ${emotion}`);
      const emotionBlendingShapes = this.avatar
        ?.getBlendShapes()
        ?.getEmotion(emotion);
      if (!emotionBlendingShapes) {
        logger.warn(`face emotion ${emotion} not found`);
        return;
      }
      blendingShapes = emotionBlendingShapes;
    }

    this.avatar?.getBlendShapes()?.setFaceBlendShapes(blendingShapes);
  }

  setPose(poses: HolisticV1Results) {
    this.avatar?.setPoses(poses);
  }

  async stopLipsync() {
    await this.lipsync?.destroy();
    this.lipsync?.removeAllListeners();
  }

  async startLipsync() {
    this.lipsync = new LipSync();

    let speechStopped = true;

    this.lipsync.on('viseme', (ev: { key: VisemeType; value: number }) => {
      if (speechStopped) return;
      this.avatar.getBlendShapes()?.setViseme(ev.key);
    });

    this.lipsync.on('start', (chunkId: string) => {
      this.startSpeech(chunkId);
      speechStopped = false;
    });

    this.lipsync.on('end', () => {
      this.avatar.getBlendShapes()?.setViseme('neutral');

      this.isPlaying = false;

      if (this.audioQueue.length) {
        this.playAudio();
        return;
      }

      speechStopped = true;
      this.stopSpeech();
    });

    // this.audio = document.createElement('audio') as HTMLAudioElement

    // this.audio.onplay = () => {
    //   this.startSpeech()
    // }
    // this.audio.onended = () => {
    //   if (this.audioQueue.length) {
    //     this.playAudio(this.audioQueue.splice(0, 1)[0])
    //     return
    //   }
    //   this.stopSpeech()
    // }
  }

  async init() {
    Object.keys(this.callbacks).forEach((key) => {
      this.callbacks[key] = this.callbacks[key].bind(this);
      emitter.on(key, this.callbacks[key]);
    });

    await this.startLipsync();

    this.avatar.getAnimation()?.playGestureIdle();
  }
  async destroy() {
    Object.keys(this.callbacks).forEach((key) => {
      emitter.off(key, this.callbacks[key]);
    });
    await this.stopLipsync();
  }
}
