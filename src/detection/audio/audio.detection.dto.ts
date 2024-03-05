export type SpeechDetectionEventType = 'started' | 'stopped';

export class SpeechDetectionEvent {
  op: SpeechDetectionEventType;
  audio?: Uint32Array;
  wav?: Buffer;
  sampleRate?: number;
}

export class AudioClassificationValue {
  probability: number;
  value: string;
}
