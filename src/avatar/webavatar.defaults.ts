import { AvatarModelConfig } from './webavatar.dto.js';

export const DefaultAvatarConfig: AvatarModelConfig = {
  path: 'default/model',
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
  path: '',
  domId: 'web-avatar',
  modelType: 'readyplayerme',
};
