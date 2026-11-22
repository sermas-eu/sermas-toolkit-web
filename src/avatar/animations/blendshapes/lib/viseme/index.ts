import a from './viseme_A.json' with { type: 'json' };
import e from './viseme_R.json' with { type: 'json' };
import i from './viseme_I.json' with { type: 'json' };
import o from './viseme_O.json' with { type: 'json' };
import u from './viseme_U.json' with { type: 'json' };
import neutral from './viseme_NEUTRAL.json' with { type: 'json' };

export type VisemeType = 'a' | 'e' | 'i' | 'o' | 'u' | 'neutral';

export type Viseme = Record<VisemeType, any>;

const viseme: Viseme = { a, e, i, o, u, neutral };
export default viseme;
