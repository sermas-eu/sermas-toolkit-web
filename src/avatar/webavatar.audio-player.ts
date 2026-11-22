import EventEmitter2 from 'eventemitter2';
import { Logger } from '../logger.js';
import {
  type AudioPlayerStatus,
  type PlaybackStatus,
} from './webavatar.audio-player.dto.js';

const logger = new Logger('webavatar.audio-player');

// time constant of a volume change (duck/unduck), seconds
const GAIN_RAMP_SEC = 0.05;

const defaultStatus = (enabled: boolean): AudioPlayerStatus => ({
  enabled: enabled,
  chunkId: '',
  playback: 'stopped',
  duration: 0,
  progress: 0,
  initTime: 0,
  currentTime: 0,
  volume: 0,
});

/**
 * Plays the avatar's speech one chunk at a time on a single AudioContext, kept for the
 * player's life: no context created and closed at every chunk boundary (gaps, clicks,
 * a context that starts suspended), and a pause that suspends the very context the
 * chunk plays on, so resume carries on where it stopped.
 */
export class WebAvatarAudioPlayer extends EventEmitter2 {
  private status = defaultStatus(true);

  private lastStatus: PlaybackStatus | undefined = undefined;

  private audioContext?: AudioContext;
  private gain?: GainNode;
  private analyzer?: AnalyserNode;
  private source?: AudioBufferSourceNode;

  // bumped by stop(): a play() still decoding when it changes never starts
  private playToken = 0;

  constructor() {
    super();
  }

  isPlaying() {
    return this.status.playback === 'playing';
  }

  isStopped() {
    return this.status.playback === 'stopped';
  }

  isPaused() {
    return this.status.playback === 'paused';
  }

  /** a chunk is loaded: playing or paused */
  isBusy() {
    return this.isPlaying() || this.isPaused();
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

  private setPlaybackStatus(status: PlaybackStatus) {
    this.lastStatus = this.status.playback;
    this.status.playback = status;
  }

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.gain = this.audioContext.createGain();
      this.gain.connect(this.audioContext.destination);
      this.analyzer = this.audioContext.createAnalyser();
      this.analyzer.fftSize = 1024;
    }
    return this.audioContext;
  }

  /** lower the volume (0..1) without stopping, e.g. while the visitor talks over */
  duck(level: number) {
    if (!this.gain || !this.audioContext) return;
    logger.debug(`Player ducked to ${level}`);
    this.gain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, level)),
      this.audioContext.currentTime,
      GAIN_RAMP_SEC,
    );
  }

  unduck() {
    if (!this.gain || !this.audioContext) return;
    logger.debug(`Player volume restored`);
    this.gain.gain.setTargetAtTime(
      1,
      this.audioContext.currentTime,
      GAIN_RAMP_SEC,
    );
  }

  private detachSource() {
    const source = this.source;
    this.source = undefined;
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // not started
    }
    source.disconnect();
  }

  async stop() {
    logger.debug(`Player stopped chunkId=${this.status.chunkId}`);
    this.playToken++;
    this.detachSource();

    // a paused context stays suspended: the next chunk must be audible, at full volume
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume().catch(() => undefined);
    }
    this.unduck();

    this.status = defaultStatus(this.status.enabled);
    this.setPlaybackStatus('stopped');
    this.emitStatus();
  }

  async pause() {
    if (!this.audioContext || !this.isPlaying()) return;
    logger.debug(`Player paused chunkId=${this.status.chunkId}`);
    this.setPlaybackStatus('paused');
    await this.audioContext.suspend();
    this.emitStatus();
  }

  async resume() {
    if (!this.audioContext || !this.isPaused()) return;

    logger.debug(`Player resumed chunkId=${this.status.chunkId}`);
    this.setPlaybackStatus('playing');
    await this.audioContext.resume();
    this.emitStatus({ playback: 'resumed' });
    this.animationFrameCallback();
  }

  async play(raw: Uint8Array, chunkId: string) {
    if (!this.status.enabled) {
      logger.debug('Player disabled. Audio will not be played');
      return;
    }

    const rawBuffer: ArrayBuffer = raw.buffer.slice(
      raw.byteOffset,
      raw.byteLength + raw.byteOffset,
    ) as ArrayBuffer;

    const token = ++this.playToken;
    this.detachSource();

    const context = this.getContext();
    if (context.state === 'suspended') {
      await context.resume().catch(() => undefined);
    }

    let buffer: AudioBuffer;
    try {
      buffer = await context.decodeAudioData(rawBuffer);
    } catch (e: any) {
      logger.warn(`Cannot decode chunkId=${chunkId}: ${e?.message}`);
      if (token === this.playToken) {
        // skip it: the queue carries on with the next chunk
        this.status = defaultStatus(this.status.enabled);
        this.setPlaybackStatus('stopped');
        this.emitStatus({ playback: 'completed', chunkId });
      }
      return;
    }

    // stopped (or replaced) while decoding
    if (token !== this.playToken) return;

    const source = new AudioBufferSourceNode(context, {
      buffer,
      loop: false,
    });
    source.connect(this.analyzer!);
    source.connect(this.gain!);

    source.onended = () => {
      if (this.source !== source) return;
      logger.debug(`Player completed chunkId=${this.status.chunkId}`);
      this.source = undefined;
      source.disconnect();
      this.setPlaybackStatus('stopped');
      this.emitStatus({ playback: 'completed' });
      this.status = defaultStatus(this.status.enabled);
    };

    this.source = source;
    source.start();

    this.status.initTime = context.currentTime;
    this.status.chunkId = chunkId;
    this.status.progress = 0;
    this.status.duration = buffer.duration;

    this.setPlaybackStatus('playing');
    this.emitStatus({ playback: 'started' });
    logger.debug(`Player playing chunkId=${this.status.chunkId}`);

    this.animationFrameCallback();
  }

  animationFrameCallback() {
    if (!this.source || !this.isPlaying()) return;
    this.updatePlaybackStatus();
    requestAnimationFrame(() => this.animationFrameCallback());
  }

  /** release the audio device; the next play() opens a new context */
  async close() {
    await this.stop();
    if (this.analyzer) this.analyzer.disconnect();
    if (this.gain) this.gain.disconnect();
    this.analyzer = undefined;
    this.gain = undefined;
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = undefined;
    }
  }

  private getVolume() {
    if (!this.analyzer) return 0;

    //get the buffer length from the analyser
    const bufferLength = this.analyzer.frequencyBinCount;
    if (!bufferLength) return 0;

    const dataArray = new Uint8Array(bufferLength);
    this.analyzer.getByteFrequencyData(dataArray);

    return dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
  }

  private getProgress() {
    if (this.status.playback !== 'playing') return 0;
    if (!this.audioContext || !this.source) return 0;

    const progress =
      (this.audioContext.currentTime - this.status.initTime) /
      this.source.playbackRate.value /
      this.status.duration;

    return Math.round(progress * 100);
  }

  private updatePlaybackStatus() {
    let hasChanges = false;

    const lastProgress = this.status.progress;
    this.status.progress = this.getProgress();
    if (lastProgress !== this.status.progress) hasChanges = true;

    const lastVolume = this.status.volume;
    this.status.volume = this.getVolume();
    if (lastVolume !== this.status.volume) hasChanges = true;

    if (this.status.playback !== this.lastStatus) {
      this.lastStatus = this.status.playback;
      hasChanges = true;
    }

    if (hasChanges) this.emitStatus();
  }
}
