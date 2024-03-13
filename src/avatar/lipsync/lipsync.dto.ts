import { VisemeType } from '../animations/blendshapes/lib/viseme/index.js';

export interface LipSyncMapping {
  key: VisemeType;
  value: number;
}

export const neutral: LipSyncMapping = {
  key: 'neutral',
  value: 1,
};
