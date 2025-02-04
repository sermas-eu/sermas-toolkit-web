export enum InteractionType {
  start = 'start',
  stop = 'stop',
}

export const EmotionTypes = [
  'neutral',
  'angry',
  'disgust',
  'fear',
  'happy',
  'sad',
  'surprise',
] as const;

export type Emotion = (typeof EmotionTypes)[number];

export enum UserCharacterizationEventSource {
  deepface = 'deepface',
  sentiment_analysis = 'sentiment_analysis',
  emotion_tracker = 'emotion_tracker',
  speechbrain = 'speechbrain',
}
