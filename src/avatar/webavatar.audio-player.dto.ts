export type PlaybackStatus =
  | 'started'
  | 'playing'
  | 'paused'
  | 'resumed'
  | 'stopped'
  | 'completed';

export type AudioPlayerStatus = {
  enabled: boolean;
  playback: PlaybackStatus;
  chunkId: string;
  progress: number;
  duration: number;
  initTime: number;
  currentTime: number;
  volume: number;
};
