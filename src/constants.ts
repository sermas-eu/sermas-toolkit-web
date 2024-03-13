import {
  RepositoryAvatarModelDto,
  RepositoryBackgroundModelDto,
} from '@sermas/api-client';

export const DEFAULT_AVATAR_LANGUAGE = 'en-GB';

export const USER_CHARACTERIZATION_TOPIC = 'detection/characterization';

export const AUDIO_CLASSIFICATION_TOPIC = 'detection/audio';

export const UI_INTERACTION_TOPIC = 'ui/interaction';

export const DefaultModel: RepositoryAvatarModelDto = {
  modelType: 'readyplayerme',
  gender: 'F',
  modelPath: 'models/default',
};

export const DefaultBackground: RepositoryBackgroundModelDto = {
  path: 'backgrounds/default',
};
