import {
  RepositoryAvatarDto,
  RepositoryBackgroundDto,
} from '@sermas/api-client';

export const DEFAULT_AVATAR_LANGUAGE = 'en-GB';

export const XRMARKER_DETECTION = 'xr/marker/detected';
export const QR_DETECTION = 'detection/qr_code';
export const USER_CHARACTERIZATION_TOPIC = 'detection/characterization';
export const AUDIO_CLASSIFICATION_TOPIC = 'detection/audio';
export const UI_INTERACTION_TOPIC = 'ui/interaction';

export const DefaultModel: RepositoryAvatarDto = {
  id: 'default',
  name: 'default',
  modelType: 'readyplayerme',
  gender: 'F',
  path: 'models/default',
  type: 'avatars',
};

export const DefaultBackground: RepositoryBackgroundDto = {
  id: 'default',
  name: 'default',
  path: 'backgrounds/default',
  type: 'backgrounds',
};
