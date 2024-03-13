import { Emotion } from 'dto/detection.dto';
import angry from './angry.json' assert { type: 'json' };
import disgust from './disgust.json' assert { type: 'json' };
import eyesClose from './eyes_close.json' assert { type: 'json' };
import eyesOpen from './eyes_open.json' assert { type: 'json' };
import fear from './fear.json' assert { type: 'json' };
import happy from './happy.json' assert { type: 'json' };
import neutral from './neutral.json' assert { type: 'json' };
import sad from './sad.json' assert { type: 'json' };
import surprise from './surprise.json' assert { type: 'json' };
import viseme from './viseme/index.js';

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
