import a from './viseme_A.json';
import e from './viseme_R.json';
import i from './viseme_I.json';
import o from './viseme_O.json';
import u from './viseme_U.json';
import neutral from './viseme_NEUTRAL.json';

export type VisemeType = 'a' | 'e' | 'i' | 'o' | 'u' | 'neutral';

export type Viseme = Record<VisemeType, any>;

const viseme: Viseme = { a, e, i, o, u, neutral };
export default viseme;
