import { Logger } from '../logger.js';
import { AppSettings, mexQueue, SubtitleMessage } from 'dto.js';
import { AvatarAudioPlaybackStatus } from './webavatar.dto.js';
import { emitter } from '../events.js';
import { DialogueMessageDto, SermasToolkit } from 'index.js';

const logger = new Logger('webavatar.subtitles');

export class WebAvatarSubtitles {
  constructor(private readonly toolkit?: SermasToolkit) {
    this.onNewMessage = this.onNewMessage.bind(this);
    this.onAudioChanged = this.onAudioChanged.bind(this);
    this.onForceStop = this.onForceStop.bind(this);
  }

  private messageQ: mexQueue = {} as mexQueue;
  private settings: AppSettings | undefined;
  private playingChunkId: string | null = null;
  private playingChunkIdList: string[] = [];
  private lastId: number | null;
  private timerRef: NodeJS.Timeout;
  private intervalRef: NodeJS.Timeout;
  private textPace = 0.0776;

  async init() {
    this.settings = this.toolkit?.getSettings().get();
    if (!this.settings?.subtitlesEnabled) return;
    emitter.on('avatar.speech', this.onAudioChanged);
    this.toolkit?.getBroker().on('dialogue.messages', this.onNewMessage);
    emitter.on('dialogue.stop', this.onForceStop);
    emitter.on('avatar.speech.stop', this.onForceStop);
  }

  async destroy() {
    emitter.off('avatar.speech', this.onAudioChanged);
    this.toolkit?.getBroker().off('dialogue.messages', this.onNewMessage);
    emitter.off('dialogue.stop', this.onForceStop);
    emitter.off('avatar.speech.stop', this.onForceStop);
  }

  onNewMessage(ev: DialogueMessageDto) {
    if (ev.actor === 'agent' && ev.chunkId) {
      const mexList = this.splitMexString(ev.text);
      const tmp = ev.text.match(/[a-zA-Z0-9]/g);

      this.messageQ[ev.chunkId] = {
        mex: ev.text,
        mexList,
        id: ev.chunkId,
        duration: (tmp ? tmp.length * this.textPace : 5) * 1000,
      };
      if (!this.settings?.enableAudio) {
        this.playingChunkIdList.push(ev.chunkId);
        this.playSubs();
      }
    }
  }

  onAudioChanged(ev: AvatarAudioPlaybackStatus) {
    if (!ev.chunkId) return;

    if (ev.status == 'started') {
      this.playingChunkId = ev.chunkId;
      if (!this.messageQ[ev.chunkId]) return;
      this.lastId = null;
    } else if (ev.status == 'playing') {
      if (!ev.progress) return;
      if (!this.messageQ[ev.chunkId]) return;
      const id = Math.floor(
        (this.messageQ[ev.chunkId].mexList.length * ev.progress) / 100,
      );

      if (id != this.lastId && id < this.messageQ[ev.chunkId].mexList.length) {
        const newEv = {
          id: `${ev.chunkId}${id}`,
          mex: this.messageQ[ev.chunkId].mexList[id],
        } as SubtitleMessage;
        emitter.emit('avatar.subtitle', newEv);
        this.lastId = id;
      }
    } else if (ev.status == 'ended') {
      delete this.messageQ[ev.chunkId];
      this.lastId = null;
      this.playingChunkId = null;
    }
  }

  onForceStop(ev) {
    if (this.timerRef) clearTimeout(this.timerRef);
    if (this.intervalRef) clearInterval(this.intervalRef);
    this.lastId = null;
    this.playingChunkId = null;
    this.playingChunkIdList = [];
    logger.debug('Subtitle stopped on force stop');
    emitter.emit('avatar.subtitle.clean', true);
  }

  playSubs() {
    if (!this.playingChunkIdList.length || this.playingChunkId != null) return;

    const playId = this.playingChunkIdList.shift();
    if (!playId || !this.messageQ[playId]) return;
    this.playingChunkId = playId;

    if (this.timerRef) clearTimeout(this.timerRef);
    setTimeout(() => this.playSubs(), this.messageQ[playId].duration + 500);

    const start = new Date();
    const end = new Date(start.getTime() + this.messageQ[playId].duration);

    this.intervalRef = setInterval(() => {
      const now = new Date();
      const timeElapsed = end.getTime() - now.getTime();
      const percentage = Math.round(
        (100 * (this.messageQ[playId].duration - timeElapsed)) /
          this.messageQ[playId].duration,
      );

      const id = Math.floor(
        (this.messageQ[playId].mexList.length * percentage) / 100,
      );

      if (id != this.lastId && id < this.messageQ[playId].mexList.length) {
        const newEv = {
          id: `${playId}${id}`,
          mex: this.messageQ[playId].mexList[id],
        } as SubtitleMessage;
        emitter.emit('avatar.subtitle', newEv);
        this.lastId = id;
      }
      if (timeElapsed < 0) {
        this.lastId = null;
        this.playingChunkId = null;
        clearInterval(this.intervalRef);
        return;
      }
    }, 500);
  }

  private splitMexString(text): string[] {
    return text.replace(/([.?!:])\s*(?=[A-Z\n])/g, '$1|').split('|');
  }
}
