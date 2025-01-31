import EventEmitter2 from 'eventemitter2';
import { Logger } from '../logger.js';
import { AudioPlayerStatus } from './webavatar.audio-player.dto.js';

const logger = new Logger('webavatar.player');

const defaultStatus = (): AudioPlayerStatus => ({
  enabled: true,
  chunkId: '',
  playback: 'stopped',
  duration: 0,
  progress: 0,
  initTime: 0,
  currentTime: 0,
  volume: 0,
});

export class WebAvatarAudioPlayer extends EventEmitter2 {
  private status = defaultStatus();

  private audioContext?: AudioContext;
  private source?: AudioBufferSourceNode;
  private analyzer?: AnalyserNode;

  constructor() {
    super();
  }

  isPlaying() {
    return (
      this.status.playback === 'started' ||
      this.status.playback === 'resumed' ||
      this.status.playback === 'playing'
    );
  }

  toggle(enabled?: boolean) {
    this.status.enabled =
      enabled === undefined ? !this.status.enabled : enabled;
    logger.debug(`Set audio ${this.status.enabled ? 'on' : 'off'}`);
  }

  emitStatus(ev: Partial<AudioPlayerStatus> = {}) {
    const state: AudioPlayerStatus = { ...this.status, ...ev };
    this.emit('status', state);
  }

  async stop() {
    logger.debug(`Player stopped chunkId=${this.status.chunkId}`);
    this.source?.stop();
    this.status = defaultStatus();
    this.status.playback = 'stopped';
    this.emitStatus();
  }

  async pause() {
    if (!this.audioContext) return;
    logger.debug(`Player paused chunkId=${this.status.chunkId}`);
    this.status.playback = 'paused';
    await this.audioContext.suspend();
    this.emitStatus();
  }

  async resume() {
    if (!this.audioContext) return;
    logger.debug(`Player resumed chunkId=${this.status.chunkId}`);
    this.status.playback = 'playing';
    await this.audioContext.resume();
    this.emitStatus({ playback: 'resumed' });
  }

  async play(raw: Uint8Array, chunkId: string) {
    if (!this.status.enabled) return;

    const rawBuffer: ArrayBuffer = raw.buffer.slice(
      raw.byteOffset,
      raw.byteLength + raw.byteOffset,
    ) as ArrayBuffer;

    if (this.audioContext) await this.destroy();

    this.audioContext = new AudioContext();
    const buffer = await this.audioContext.decodeAudioData(rawBuffer);

    this.source = new AudioBufferSourceNode(this.audioContext, {
      buffer,
      loop: false,
    });

    this.analyzer = this.audioContext.createAnalyser();
    this.analyzer.fftSize = 1024;
    this.source.connect(this.analyzer);

    this.source.connect(this.audioContext.destination);

    this.source.onended = () => {
      logger.debug(`Player completed chunkId=${this.status.chunkId}`);
      this.emitStatus({ playback: 'completed' });
      this.status = defaultStatus();
    };

    this.source.start();
    this.status.initTime = this.source.context.currentTime;

    this.status.chunkId = chunkId;
    this.status.progress = 0;
    this.status.duration = buffer.duration;

    this.status.playback = 'started';

    this.animationFrameCallback();

    this.emitStatus();
    logger.debug(`Player playing chunkId=${this.status.chunkId}`);
  }

  animationFrameCallback() {
    this.updatePlaybackStatus();
    if (this.isPlaying())
      requestAnimationFrame(() => this.animationFrameCallback());
  }

  private async destroy() {
    if (this.source) {
      this.source.disconnect();
      this.source.stop();
      this.source.onended = () => {};
      this.source = undefined;
    }

    if (this.analyzer) {
      this.analyzer.disconnect();
      this.analyzer = undefined;
    }

    if (this.audioContext) {
      try {
        await this.audioContext?.close();
        this.audioContext = undefined;
      } catch {}
    }
  }

  private getVolume() {
    if (!this.analyzer) return 0;

    //get the buffer length from the analyser
    const bufferLength = this.analyzer.frequencyBinCount;
    if (!bufferLength) return 0;

    //create a uint8 array
    const dataArray = new Uint8Array(bufferLength);
    //call this to get the current frequency  and put it     into dataArray
    this.analyzer?.getByteFrequencyData(dataArray);

    const volume =
      dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;

    return volume;
  }

  private getProgress() {
    if (this.status.playback !== 'playing') return 0;
    if (!this.audioContext || !this.source) return 0;

    let progress =
      (this.audioContext?.currentTime - this.status.initTime) /
      this.source?.playbackRate.value /
      this.status.duration;

    progress = Math.round(progress * 100);

    return progress;
  }

  private updatePlaybackStatus() {
    let hasChanges = false;

    const lastProgress = this.status.progress;
    this.status.progress = this.getProgress();
    if (lastProgress !== this.status.progress) hasChanges = true;

    const lastVolume = this.status.volume;
    this.status.volume = this.getVolume();
    if (lastVolume !== this.status.volume) hasChanges = true;

    if (hasChanges) this.emitStatus();
  }
}
