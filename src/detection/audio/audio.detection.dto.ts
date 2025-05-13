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

export type SpeechSampleResult = {
  speechLength: number;
  probability: number;
  isSpeaking: boolean;
};
