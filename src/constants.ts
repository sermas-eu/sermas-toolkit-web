import {
  type RepositoryAvatarDto,
  type RepositoryBackgroundDto,
} from '@sermas/api-client';

export const DEFAULT_AVATAR_LANGUAGE = 'en-GB';

export const XRMARKER_DETECTION = 'xr/marker/detected';
export const QR_DETECTION = 'detection/qr_code';
export const USER_CHARACTERIZATION_TOPIC = 'detection/characterization';
export const AUDIO_CLASSIFICATION_TOPIC = 'detection/audio';
export const UI_INTERACTION_TOPIC = 'ui/interaction';

/**
 * The built-in avatar: Pip, a small robot (Apache-2.0, sermas-eu/sermas-avatar-pip),
 * served by the kiosk at /avatars/pip.glb. A path starting with "/" is loaded from the
 * kiosk's own origin. Its rig answers to the Ready Player Me bone names, hence modelType;
 * the cameras are framed for it. The API's RepositoryAvatarDefault mirrors this entry.
 */
export const BuiltinAvatar: RepositoryAvatarDto = {
  id: 'default',
  type: 'avatars',
  name: 'Pip',
  path: '/avatars/pip.glb',
  gender: 'F',
  modelType: 'readyplayerme',
  camera: {
    position: { x: -0.0001, y: 0.278, z: 1.664 },
    rotation: { x: -0.1235, y: 0, z: 0 },
  },
  cameraMobile: {
    position: { x: -0.0001, y: 0.168, z: 2.464 },
    rotation: { x: -0.1107, y: 0, z: 0 },
  },
};

// the avatar every app gets after its own (kiosk setRepositoryDefaults)
export const DefaultModel: RepositoryAvatarDto = BuiltinAvatar;

export const DefaultBackground: RepositoryBackgroundDto = {
  id: 'default',
  name: 'default',
  path: 'backgrounds/default',
  type: 'backgrounds',
};
