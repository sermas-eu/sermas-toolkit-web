import { Emotion } from 'dto/detection.dto';
import angry from './angry.json';
import disgust from './disgust.json';
import eyesClose from './eyes_close.json';
import eyesOpen from './eyes_open.json';
import fear from './fear.json';
import happy from './happy.json';
import neutral from './neutral.json';
import sad from './sad.json';
import surprise from './surprise.json';
import viseme from './viseme';

export type EmotionBlendShape = Emotion;

export default {
  emotion: {
    angry,
    disgust,
    fear,
    happy,
    neutral,
    sad,
    surprise,
  },
  eyes: {
    closed: eyesClose,
    open: eyesOpen,
  },
  viseme,
};
