import { Logger } from '../../../logger.js';
import * as THREE from 'three';
import type { HolisticV1Results } from '../../../detection/video/mediapipe/v1/holistic/holistic.dto.js';
import { DetectionPosition } from '../../webavatar.dto.js';

export class Animator {
  private logger = new Logger('Animator');

  private scene: THREE.Scene;
  private camera: THREE.Camera;

  private skeleton: THREE.Skeleton;

  private bones: Record<string, any> = {};

  private morphTargets: any;
  private morphDict: any;

  private isRPM: boolean;

  constructor(
    model: THREE.Group,
    scene: THREE.Scene,
    camera: THREE.Camera,
    isRPM: boolean,
  ) {
    this.isRPM = isRPM;
    this.scene = scene;
    this.camera = camera;
    this.init(model);
  }

  init(model: THREE.Group) {
    model.traverse((child: any) => {
      if (child.morphTargetInfluences) {
        if (child.name == 'Wolf3D_Head') {
          this.morphTargets = child.morphTargetInfluences;
          this.morphDict = child.morphTargetDictionary;
          // console.log(child.name, this.morphTargets, this.morphDict)
        }
      }
    });
    const skeletonHelper = new THREE.SkeletonHelper(model);
    this.skeleton = new THREE.Skeleton(skeletonHelper.bones);
    this.loadBones();
    // setInterval(() => {
    //   this.lookAt(this.cameraTarget());
    // }, 100);
  }

  getBone(name: string): THREE.Bone {
    const bone = this.skeleton.getBoneByName(`${name}`);
    if (!bone) {
      this.logger.error(`${name} bone not found`);
      return new THREE.Bone();
    }
    return bone;
  }

  loadBones() {
    const prefix = this.isRPM ? '' : 'mixamorig';

    this.bones.neck = this.getBone(`${prefix}Head`);

    this.bones.leftEye = this.getBone(`${prefix}LeftEye`);
    this.bones.rightEye = this.getBone(`${prefix}RightEye`);
  }

  pixelToPerc(val: number, isHeight = false) {
    if (isHeight) {
      return val / window.innerHeight;
    }
    return val / window.innerWidth;
  }

  lookAt(target: THREE.Vector3) {
    const t = new THREE.Vector3(target.x, target.y, target.z * 5);
    this.bones.leftEye.lookAt(t);
    this.bones.rightEye.lookAt(t);
  }

  cameraTarget(): THREE.Vector3 {
    return new THREE.Vector3(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
    );
  }

  setEyesTarget(x: number, y: number) {
    const down = y; //-(this.pixelToPerc(y, true) - 0.5);
    const left = x - 0.2; //this.pixelToPerc(x) - 0.5;

    // TODO: variable Z target position
    const center_x = 200;
    const center_y = 200;
    let dist = Math.sqrt(Math.pow(center_x - x, 2) + Math.pow(center_y - y, 2));
    dist = 10; //this.pixelToPerc(dist);

    const scale = 3;
    const target: THREE.Vector3 = new THREE.Vector3(
      left * scale,
      down * scale,
      dist,
    );
    this.lookAt(target);
  }

  animate(results: HolisticV1Results) {
    //
  }

  moveEyes(position: DetectionPosition) {
    this.setEyesTarget(position.x, position.y);
  }
}
