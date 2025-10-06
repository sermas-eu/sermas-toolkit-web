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
  AvatarStopSpeechReference,
  LipSync,
} from './index.js';

import {
  DialogueAvatarSpeechControlDto,
  DialogueMessageDto,
  SessionChangedDto,
  UserCharacterizationEventDto,
} from '@sermas/api-client';
import { ListenerFn } from 'eventemitter2';
import { EmotionBlendShape } from './animations/blendshapes/lib/index.js';
import { AudioPlayerStatus } from './webavatar.audio-player.dto.js';
import { WebAvatarAudioPlayer } from './webavatar.audio-player.js';
import { WebAvatarSubtitles } from './webavatar.subtitles.js';

const logger = new Logger('webavatar.handler');

const sortChunks = (a, b) => (a.chunkId > b.chunkId ? 1 : -1);

export class WebAvatarHandler {
  private lastSet: { time: number; emotion: string };

  private sessionStarted = false;

  private audioQueue: AudioQueue[] = [];
  private currentAudio?: AudioQueue;

  private clearanceQueue: string[] = [];

  private processedQueue = 0;
  private processedQueueTimer: NodeJS.Timeout;

  private player?: WebAvatarAudioPlayer;
  private subtitles?: WebAvatarSubtitles;

  private lipsync?: LipSync;
  private isPlaying = false;

  private progressSync: Record<string, number> = {};

  // register callbacks to init/destroy. Bind `this` as function context
  callbacks: Record<'broker' | 'emitter', Record<string, ListenerFn>> = {
    broker: {
      'dialogue.messages': this.onDialogueMessage,
      'session.session': this.onSession,
      'dialogue.speech': this.onAvatarSpeechMessage,
      'dialogue.continue': this.onAvatarSpeechContinue,
      'dialogue.stop': this.onAvatarSpeechStop,
      'detection.characterization': this.onDetection,
    },
    emitter: {
      'avatar.face': this.setFace,
      'avatar.speech.stop': this.onForceStop,
      'dialogue.stop': this.onForceStop,
      'detection.pose': this.setPose,
      'detection.audio': this.setListening,
    },
  };

  constructor(private readonly avatar: AvatarModel) {
    //
  }

  toggleAudio(enabled?: boolean) {
    this.player?.toggle(enabled);
  }

  startSpeech(chunkId: string, duration: number) {
    logger.debug('playing speech started');

    const ev: AvatarAudioPlaybackStatus = {
      status: 'started',
      chunkId,
      duration,
    };
    emitter.emit('avatar.speech', ev);

    this.avatar.getAnimation()?.playGestureTalking();
  }

  async pauseSpeech() {
    await this.player?.pause();
  }

  async resumeSpeech() {
    await this.player?.resume();
  }

  async stopSpeech(ev?: { chunkId?: string; messageId?: string }) {
    ev = ev || { chunkId: undefined, messageId: undefined };

    if (!ev.chunkId && this.currentAudio) {
      ev.chunkId = this.currentAudio.chunkId;
      ev.messageId = this.currentAudio.messageId;
    }

    logger.debug(
      `Stop avatar speech at chunkId=${ev.chunkId || ''} messageId=${ev.messageId || ''}`,
    );

    this.resetAudioQueue(ev);
    this.player?.stop();

    const playbackStatus: AvatarAudioPlaybackStatus = {
      status: 'ended',
      chunkId: ev.chunkId,
      messageId: ev.messageId,
    };

    emitter.emit('avatar.speech', playbackStatus);

    this.avatar.getAnimation()?.playGestureIdle();
  }

  onForceStop(ev: AvatarStopSpeechReference) {
    this.stopSpeech(ev);
  }

  async onAvatarSpeechContinue(ev: DialogueAvatarSpeechControlDto) {
    if (ev.sessionId !== this.avatar.getToolkit()?.getSessionId()) return;
    logger.debug('Received speech CONTINUE');
    await this.resumeSpeech();
  }

  async onAvatarSpeechStop(ev: DialogueAvatarSpeechControlDto) {
    if (ev.sessionId !== this.avatar.getToolkit()?.getSessionId()) return;
    logger.debug('Received speech STOP');
    await this.stopSpeech({
      chunkId: ev.chunkId,
    });
  }

  updateProgressSpeech(chunkId: string, progress: number) {
    // logger.debug('playing speech progress');
    const ev: AvatarAudioPlaybackStatus = {
      status: 'playing',
      chunkId,
      progress,
    };
    emitter.emit('avatar.speech', ev);
  }

  resetAudioQueue(ev: { messageId?: string; chunkId?: string }) {
    // clear messages older than current messageId
    // track the messageId to drop any upcoming chunk with the same messageId
    const messageId = ev.messageId;
    if (messageId) {
      this.clearanceQueue.push(
        ...new Set([...this.clearanceQueue, messageId].sort(sortChunks)),
      );
      this.audioQueue = this.audioQueue.filter((q) => q.messageId > messageId);
    }

    const chunkId = ev.chunkId;
    this.audioQueue = chunkId
      ? this.audioQueue.filter((q) => q.chunkId > chunkId)
      : [];
  }

  onDetection(ev: UserCharacterizationEventDto) {
    if (ev.source !== UserCharacterizationEventSource.emotion_tracker) return;
    if (!this.avatar) return;

    if (!ev.detections || !ev.detections.length) return;
    const { emotion } = ev.detections[0];

    const emotionValue = emotion.value as Emotion;

    logger.debug(
      `Detected emotion ${emotionValue} (${emotion.probability * 100}) previous ${this.lastSet?.emotion}`,
    );

    if (
      this.lastSet &&
      Date.now() - this.lastSet.time < 1000 &&
      this.lastSet.emotion === emotionValue
    ) {
      logger.debug(`Skip set emotion ${emotionValue}`);
      return;
    }

    this.lastSet = {
      time: Date.now(),
      emotion: emotionValue,
    };

    this.showEmotion(emotionValue);
  }

  getLastEmotion(): Emotion {
    return (this.lastSet?.emotion || 'neutral') as Emotion;
  }

  showEmotion(emotion?: Emotion) {
    if (!emotion) {
      emotion = this.getLastEmotion();
    }
    logger.log(`Show emotion ${emotion}`);
    this.avatar.getBlendShapes()?.setEmotion(emotion);
  }

  onSession(ev: SessionChangedDto) {
    if (ev.operation === 'created') {
      this.sessionStarted = true;
      // avatar greeting
      // this.avatar.getAnimation()?.playGestureWaving();
    }
    if (ev.operation === 'updated') {
      if (ev.record.closedAt) {
        this.sessionStarted = false;
        // avatar bye bye
        // this.avatar.getAnimation()?.playGestureWaving();
      }
    }
  }

  // avatar speech received
  onAvatarSpeechMessage(ev: unknown, raw: MqttMessageEvent) {
    // logger.debug(`Avatar Speech message event: ${JSON.stringify(ev)}`);

    if (!this.lipsync) return;

    const buffer = raw.message.payload as any as Uint8Array;

    const [, messageId, chunkId] = raw.context;

    if (this.clearanceQueue.indexOf(messageId) > -1) {
      logger.debug(
        `Skip message older than stopped queue messageId=${messageId}`,
      );
      return;
    }

    logger.debug(
      `Queued speech messageId=${messageId} chunkId=${chunkId} size=${buffer.byteLength / 1000}kb`,
    );

    // already playing, add to queue
    this.audioQueue.push({ messageId, chunkId, buffer });

    // remove messageId references older than this messageId
    this.clearanceQueue = this.clearanceQueue.filter((q) => q > messageId);

    if (this.player?.isPlaying()) {
      logger.debug(`player: avatar already speaking`);
      return;
    }

    this.playAudio();
  }

  onDialogueMessage(ev: DialogueMessageDto) {
    if (ev.actor === 'user') return;
    if (!ev.text) {
      // empty text comes when the user speech is not recognizable
      this.stopSpeech();
      return;
    }
  }

  setListening(op: 'started' | 'stopped') {
    if (op === 'started') {
      // move only if the session has started
      if (this.sessionStarted) {
        this.avatar.getAnimation()?.playGestureListening();
      }
    } else {
      this.avatar.getAnimation()?.playGestureIdle();
    }
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
    // NOTE this should be handle from backend now
    if (this.processedQueue < 2 && this.audioQueue.length < 2 && wait > 0) {
      const waitFor = 300 / wait;
      logger.debug(
        `Waiting queue threshold to be reached size=${size}kb wait=${wait} length=${this.audioQueue.length} waitFor=${waitFor}`,
      );
      setTimeout(() => this.playAudio(wait - 1), waitFor);
      return;
    }

    this.isPlaying = true;

    const raw = this.audioQueue.sort(sortChunks).splice(0, 1)[0];

    logger.debug(`play queued speech chunkId=${raw.chunkId}`);

    this.currentAudio = raw;

    this.player?.play(raw.buffer as Uint8Array, raw.chunkId);

    this.processedQueue++;
    if (this.processedQueueTimer) clearTimeout(this.processedQueueTimer);
    this.processedQueueTimer = setTimeout(() => {
      logger.debug('processed queue counter cleared');
      this.processedQueue = 0;
    }, 10 * 1000);
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

  onAudioPlayerStatus(ev: AudioPlayerStatus) {
    // logger.debug(`Audio player status event: ${JSON.stringify(ev)}`);
    switch (ev.playback) {
      case 'started':
      case 'resumed':
        this.startSpeech(ev.chunkId, ev.duration);
        this.isPlaying = true;
        break;
      case 'playing':
        if (
          ev.chunkId &&
          ev.progress &&
          ((this.progressSync[ev.chunkId] &&
            this.progressSync[ev.chunkId] != ev.progress) ||
            !this.progressSync[ev.chunkId])
        ) {
          this.updateProgressSpeech(ev.chunkId, ev.progress);
          this.progressSync[ev.chunkId] = ev.progress;
        }
        this.lipsync?.updateViseme(ev.volume);
        break;
      case 'paused':
      case 'stopped':
      case 'completed':
        this.lipsync?.reset();

        this.isPlaying = false;
        // this.stopSpeech(ev);

        if (ev.playback === 'completed') {
          if (this.audioQueue.length) {
            this.playAudio();
          } else {
            emitter.emit('avatar.speech.completed');
            this.showEmotion();
          }
        }

        break;
    }
  }

  registerCallbacks() {
    Object.keys(this.callbacks).forEach((src) => {
      Object.keys(this.callbacks[src]).forEach((key) => {
        this.callbacks[src][key] = this.callbacks[src][key].bind(this);
        if (src === 'emitter') {
          emitter.on(key, this.callbacks[src][key]);
        } else {
          this.avatar
            .getToolkit()
            ?.getBroker()
            ?.on(key, this.callbacks[src][key]);
        }
      });
    });
  }

  unregisterCallbacks() {
    Object.keys(this.callbacks).forEach((src) => {
      Object.keys(this.callbacks[src]).forEach((key) => {
        this.callbacks[src][key] = this.callbacks[src][key].bind(this);
        if (src === 'emitter') {
          emitter.off(key, this.callbacks[src][key]);
        } else {
          this.avatar
            .getToolkit()
            ?.getBroker()
            ?.off(key, this.callbacks[src][key]);
        }
      });
    });
  }

  async init() {
    this.registerCallbacks();

    this.lipsync = new LipSync(this.avatar);

    this.player = new WebAvatarAudioPlayer();

    this.subtitles = new WebAvatarSubtitles(this.avatar.getToolkit());
    this.subtitles.init();

    this.onAudioPlayerStatus = this.onAudioPlayerStatus.bind(this);
    this.player.on('status', this.onAudioPlayerStatus);

    this.avatar.getAnimation()?.playGestureIdle();
  }

  async destroy() {
    Object.keys(this.callbacks).forEach((key) => {
      if (!this.callbacks[key]) return;
      try {
        emitter.off(key, this.callbacks[key]);
        delete this.callbacks[key];
      } catch {}
    });
    this.player?.off('status', this.onAudioPlayerStatus);

    this.audioQueue = [];
    this.clearanceQueue = [];

    await this.lipsync?.reset();
    await this.player?.stop();
    await this.subtitles?.destroy();
  }
}
