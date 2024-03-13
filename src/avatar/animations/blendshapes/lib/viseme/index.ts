import a from './viseme_A.json' assert { type: 'json' };
import e from './viseme_R.json' assert { type: 'json' };
import i from './viseme_I.json' assert { type: 'json' };
import o from './viseme_O.json' assert { type: 'json' };
import u from './viseme_U.json' assert { type: 'json' };
import neutral from './viseme_NEUTRAL.json' assert { type: 'json' };

export type VisemeType = 'a' | 'e' | 'i' | 'o' | 'u' | 'neutral';

export type Viseme = Record<VisemeType, any>;

const viseme: Viseme = { a, e, i, o, u, neutral };
export default viseme;
