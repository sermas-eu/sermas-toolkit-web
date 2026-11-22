import { BuiltinAvatar } from '../constants.js';
import { type AvatarModelConfig } from './webavatar.dto.js';

/** The built-in avatar (Pip) as a model config: used when a model fails to load. */
export const BuiltinAvatarConfig: AvatarModelConfig = {
  ...BuiltinAvatar,
  id: 'builtin',
  domId: 'web-avatar',
};

/** A path the loader fetches as given: a URL, or a path on the kiosk's own origin. */
export const isDirectModelPath = (path?: string): boolean =>
  !!path && (/^https?:\/\//.test(path) || path.startsWith('/'));

export const DefaultAvatarConfig: AvatarModelConfig = {
  type: 'avatars',
  id: 'fallback',
  path: BuiltinAvatar.path,

  gender: 'F',
  modelType: 'readyplayerme',

  domId: 'web-avatar',
  camera: {
    position: {
      x: -0.1039700347755792,
      y: 0.7280937522640802,
      z: 1.5018928584731202,
    },
    rotation: {
      x: -0.19938471268290073,
      y: -0.2542801277228938,
      z: -0.050786631884382503,
    },
  },
  cameraMobile: {
    position: {
      x: -0.010965805547590052,
      y: 0.6154045898608999,
      z: 1.4016687340357339,
    },
    rotation: {
      x: -0.13381844098619816,
      y: -0.01929222913574782,
      z: -0.0025970104995767787,
    },
  },
  animations: {
    gesture: {
      mappings: {},
    },
    masks: {
      gesture: [],
    },
    blendShapes: {
      name: 'Wolf3D_Head',
    },
  },
};

export const DefaultReadyPlayerMeAvatarConfig: AvatarModelConfig = {
  id: 'default',
  type: 'avatars',
  path: '',
  gender: 'F',
  domId: 'web-avatar',
  modelType: 'readyplayerme',
};
