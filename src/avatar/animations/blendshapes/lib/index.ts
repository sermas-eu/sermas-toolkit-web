import { Emotion } from '../../../../dto/detection.dto.js';
import angry from './angry.json' with { type: 'json' };
import disgust from './disgust.json' with { type: 'json' };
import eyesClose from './eyes_close.json' with { type: 'json' };
import eyesOpen from './eyes_open.json' with { type: 'json' };
import fear from './fear.json' with { type: 'json' };
import happy from './happy.json' with { type: 'json' };
import neutral from './neutral.json' with { type: 'json' };
import sad from './sad.json' with { type: 'json' };
import surprise from './surprise.json' with { type: 'json' };
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
