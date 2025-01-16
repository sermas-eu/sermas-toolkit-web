import { RepositoryAvatarDto } from '@sermas/api-client';
import * as THREE from 'three';

export type AvatarStopSpeechReference = {
  messageId?: string;
  chunkId?: string;
};

export type GestureMappingKeys =
  | 'gesture_default'
  | 'gesture_idle'
  | 'gesture_waving'
  | 'gesture_listening'
  | 'gesture_talking'
  | 'gesture_donotknow'
  | 'gesture_walk'
  | 'gesture_show_left'
  | 'gesture_show_right';

// eslint-disable-next-line
type Subset<T extends U, U> = U;

export interface AvatarAudioPlaybackStatus {
  chunkId?: string;
  status: 'started' | 'ended';
  duration?: number; // seconds
}

export interface AvatarFaceBlendShape {
  index: number;
  score: number;
  categoryName: string;
  displayName: string;
}

export type AnimationGroup = 'gesture' | 'face' | 'viseme';
export interface AnimationLabel {
  name: string;
  group: AnimationGroup;
}

export interface AnimationSettings extends Record<string, any> {
  weight?: number;
}

export class AnimationHandler {
  name: string;
  group: AnimationGroup;
  action: THREE.AnimationAction;
  clip: THREE.AnimationClip;
  settings?: AnimationSettings;
}

export interface AvatarBlendShapeConfig extends Record<string, any> {
  name: string | string[];
  mappings?: Record<string, string>;
}

export type AvatarBodyConfig = AvatarBlendShapeConfig;

export interface Vector {
  x: number;
  y: number;
  z: number;
}

export interface CameraConfig {
  position?: Vector;
  rotation?: Vector;
}

export interface AvatarModelConfigDefaults {
  // extends Record<string, any>
  normalizeName?: (name: string) => string;
  filterMesh?: RegExp | string;
  // idle?: string[]
  masks?: Record<Subset<AnimationGroup, any>, string[]>;
  visemes?: string[];
  blendShapes?: AvatarBlendShapeConfig;
  body?: AvatarBodyConfig;
  mappings?: Record<string, any>;
  gesture: {
    mappings: Record<string, string>;
  };
}

export interface AvatarModelConfig extends RepositoryAvatarDto {
  domId?: string;
  animations?: AvatarModelConfigDefaults;
  showGui?: boolean;
  ui?: {
    backgroundColor?: string;
    fogColor?: string;
    hemiLightColor?: {
      sky?: string;
      ground?: string;
    };
  };
}

export interface AudioQueue {
  messageId: string;
  chunkId: string;
  buffer: Uint8Array;
}

export interface DetectionPosition {
  x: number;
  y: number;
}
