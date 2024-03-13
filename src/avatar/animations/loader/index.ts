import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Logger } from '../../../logger.js';
import { AvatarModelConfig, GestureMappingKeys } from '../../webavatar.dto.js';
import { RpmAnimation } from './contants.js';

export class AnimationsLoader {
  private logger = new Logger('AnimationsLoader');

  private mapping: Record<GestureMappingKeys, RpmAnimation[]> = {
    gesture_default: [],
    gesture_idle: [
      // https://github.com/readyplayerme/animation-library/tree/master/feminine/fbx/idle
      'F_Standing_Idle_001',
      // 'F_Standing_Idle_Variations_001',
      // 'F_Standing_Idle_Variations_008',

      // 'M_Standing_Idle_001',
      // 'M_Standing_Idle_Variations_002',
      //   'M_Standing_Idle_Variations_003',
      //   'M_Standing_Idle_Variations_005',
    ],
    gesture_waving: [
      //
      'M_Standing_Expressions_001',
    ],
    gesture_listening: [
      //
      'F_Talking_Variations_002',
      // 'M_Talking_Variations_001',
    ],
    gesture_talking: [
      // 'F_Talking_Variations_001',
      'F_Talking_Variations_002',
      // 'F_Talking_Variations_005',

      //   'M_Talking_Variations_001',
      //   'M_Talking_Variations_008',
      //   'M_Talking_Variations_009',
    ],
    gesture_donotknow: [
      'F_Talking_Variations_003',
      //   'M_Standing_Expressions_005',
    ],
    gesture_walk: [
      // 'F_Walk_002',
      // 'F_Walk_003'
    ],
    gesture_show_left: [],
    gesture_show_right: [],
  };

  private config: AvatarModelConfig;

  private animations: THREE.AnimationClip[] = [];

  constructor(config: AvatarModelConfig) {
    this.config = config;
  }

  getMapping() {
    return this.mapping;
  }

  getAnimations(): THREE.AnimationClip[] {
    return this.animations;
  }

  private async loadAnimationsFromModel(
    path: string,
    type: 'fbx' | 'glb' | 'glft' = 'fbx',
  ): Promise<THREE.AnimationClip[]> {
    const loader = type === 'fbx' ? new FBXLoader() : new GLTFLoader();

    // if ((type != 'fbx')){
    //   const dracoLoader = new DRACOLoader();
    //   dracoLoader.setDecoderPath( '/tmp' );
    //   loader.setDRACOLoader( dracoLoader );
    // }

    // this.logger.debug(`loading ${type} from ${path}`)
    const model = await loader.loadAsync(path);

    // handle gltf/glb
    const gltf = model as GLTF;
    if (gltf.parser !== undefined && gltf.scene !== undefined) {
      return (gltf as any).animations;
    }

    return model.animations;
  }

  private mapTrackName(n: string) {
    const mappings: Record<string, string> =
      this.config.animations?.gesture?.mappings || {};
    for (const [key, value] of Object.entries(mappings)) {
      if (n.indexOf(key) !== -1) {
        return n.replace(key, value);
      }
    }
    return n;
  }

  private remapAnimation(a: THREE.AnimationClip) {
    a.tracks = a.tracks.map((t: THREE.KeyframeTrack) => {
      t.name = this.mapTrackName(t.name);
      return t;
    });
    return a;
  }

  async loadAnimations() {
    // this.logger.debug('Loading animations')
    const genderPath = this.config.gender == 'M' ? 'masculine' : 'feminine';
    for (const [key, value] of Object.entries(this.mapping)) {
      await Promise.all(
        value.map(async (a, idx) => {
          const ext = 'glb';
          const path = `https://${window.location.hostname}/animations/${genderPath}/${ext}/${a}.${ext}`;

          try {
            this.logger.debug(`Loading animation ${a}`);
            const animations = await this.loadAnimationsFromModel(path, ext);
            animations.forEach((a: THREE.AnimationClip) => {
              a.name = `${key}_${idx}`;
              if (this.config.modelType === 'readyplayerme') {
                this.animations.push(a);
              } else {
                this.animations.push(this.remapAnimation(a));
              }
              // this.logger.debug(`Added ${a.name}`)
            });
          } catch (e: any) {
            this.logger.error(
              `Failed to load animation from ${path}, error: ${e.message}`,
            );
          }
        }),
      );
    }
    this.logger.debug(`loaded ${this.animations.length} animations`);
  }
}
