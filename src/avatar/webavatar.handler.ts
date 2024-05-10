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
import { VisemeType } from './animations/blendshapes/lib/viseme/index.js';

const logger = new Logger('webavatar.handler');

export class WebAvatarHandler {
  private lastSet: { time: number; emotion: string };

  private audioQueue: AudioQueue[] = [];

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

  startSpeech(chunkId?: string) {
    logger.debug('playing speech started');

    const ev: AvatarAudioPlaybackStatus = { status: 'started', chunkId };
    emitter.emit('avatar.speech', ev);

    this.avatar.getAnimation()?.playGestureTalking();
  }

  stopSpeech(chunkId?: string) {
    logger.debug('playing speech ended');

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
      this.avatar.getAnimation()?.playGesture('gesture_listening');
    } else {
      this.avatar.getAnimation()?.playGesture('gesture_idle');
    }
  }

  onSession(ev: SessionChangedDto) {
    if (ev.operation === 'created') {
      // avatar greeting
      this.avatar.getAnimation()?.playGesture('gesture_waving');
    }
    if (ev.operation === 'updated') {
      if (ev.record.closedAt) {
        // avatar bye bye
        this.avatar.getAnimation()?.playGesture('gesture_waving');
      }
    }
  }

  onSpeech(ev: unknown, raw: MqttMessageEvent) {
    if (!this.lipsync) return;

    const buffer = raw.message.payload as Uint8Array;

    const [, chunkId] = raw.context;

    // already playing, add to queue
    this.audioQueue.push({ chunkId, buffer });

    if (!this.lipsync?.paused) {
      logger.debug(`lypsync is paused`);
      return;
    }

    setTimeout(() => this.playAudio(), 10);
  }

  playAudio() {
    if (this.isPlaying) {
      logger.debug(`already playing`);
      return;
    }
    this.isPlaying = true;

    if (!this.audioQueue.length) return;

    const raw = this.audioQueue
      .sort((a, b) => (a.chunkId > b.chunkId ? 1 : -1))
      .splice(0, 1)[0];

    logger.debug(`play speech chunk chunkId=${raw.chunkId}`);
    this.lipsync?.startFromAudioFile(raw.buffer as Uint8Array);
  }

  onDialogueMessage(ev: DialogueMessageDto) {
    if (ev.actor === 'user') return;
    if (!ev.text) {
      // empty text comes when the user speech is not recognizable
      this.stopSpeech();
      return;
    }
  }

  setFace(blendingShapes: AvatarFaceBlendShape[]) {
    // this.avatarModel?.showBlendShapeGui()
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

    this.lipsync.on('start', () => {
      this.startSpeech();
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
