import { Logger } from '../../../logger';
import * as THREE from 'three';
import type { HolisticV1Results } from '../../../detection/video/mediapipe/v1/holistic/holistic.dto';
import {
  BOT,
  FLEFT,
  FRIGHT,
  INDEX1,
  LEFTANKLE,
  LEFTELBOW,
  LEFTFOOT,
  LEFTHIP,
  LEFTINDEX,
  LEFTKNEE,
  LEFTPINKY,
  LEFTSHOULDER,
  LEFTWRIST,
  MIDDLE1,
  NASAL,
  NOSE,
  PINKY1,
  RIGHTANKLE,
  RIGHTELBOW,
  RIGHTFOOT,
  RIGHTHIP,
  RIGHTINDEX,
  RIGHTKNEE,
  RIGHTPINKY,
  RIGHTSHOULDER,
  RIGHTWRIST,
  RING1,
  SMOOTHING,
  TOP,
  VISTHRESH,
  WRIST,
} from './constants';

export class Animator {
  private logger = new Logger('Animator');

  private scene: THREE.Scene;

  private skeleton: THREE.Skeleton;

  private bones: Record<string, any> = {};

  private morphTargets: any;
  private morphDict: any;

  private isRPM: boolean;

  constructor(model: THREE.Group, scene: THREE.Scene, isRPM: boolean) {
    this.isRPM = isRPM;
    this.scene = scene;
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

    this.bones.skeleton = this.getBone(`${prefix}Hips`);
    this.bones.spine = this.getBone(`${prefix}Spine`);
    this.bones.neck = this.getBone(`${prefix}Head`);

    this.bones.rightShoulderBone = this.getBone(`${prefix}LeftArm`);
    this.bones.rightElbowBone = this.getBone(`${prefix}LeftForeArm`);
    this.bones.rightWristBone = this.getBone(`${prefix}LeftHand`);
    this.bones.rightHandBones = [
      this.bones.rightWristBone,
      this.getBone(`${prefix}LeftHandThumb1`),
      this.getBone(`${prefix}LeftHandThumb2`),
      this.getBone(`${prefix}LeftHandThumb3`),
      this.getBone(`${prefix}LeftHandThumb4`),
      this.getBone(`${prefix}LeftHandIndex1`),
      this.getBone(`${prefix}LeftHandIndex2`),
      this.getBone(`${prefix}LeftHandIndex3`),
      this.getBone(`${prefix}LeftHandIndex4`),
      this.getBone(`${prefix}LeftHandMiddle1`),
      this.getBone(`${prefix}LeftHandMiddle2`),
      this.getBone(`${prefix}LeftHandMiddle3`),
      this.getBone(`${prefix}LeftHandMiddle4`),
      this.getBone(`${prefix}LeftHandRing1`),
      this.getBone(`${prefix}LeftHandRing2`),
      this.getBone(`${prefix}LeftHandRing3`),
      this.getBone(`${prefix}LeftHandRing4`),
      this.getBone(`${prefix}LeftHandPinky1`),
      this.getBone(`${prefix}LeftHandPinky2`),
      this.getBone(`${prefix}LeftHandPinky3`),
      this.getBone(`${prefix}LeftHandPinky4`),
    ];

    this.bones.leftShoulderBone = this.getBone(`${prefix}RightArm`);
    this.bones.leftElbowBone = this.getBone(`${prefix}RightForeArm`);
    this.bones.leftWristBone = this.getBone(`${prefix}RightHand`);
    this.bones.leftHandBones = [
      this.bones.leftWristBone,
      this.getBone(`${prefix}RightHandThumb1`),
      this.getBone(`${prefix}RightHandThumb2`),
      this.getBone(`${prefix}RightHandThumb3`),
      this.getBone(`${prefix}RightHandThumb4`),
      this.getBone(`${prefix}RightHandIndex1`),
      this.getBone(`${prefix}RightHandIndex2`),
      this.getBone(`${prefix}RightHandIndex3`),
      this.getBone(`${prefix}RightHandIndex4`),
      this.getBone(`${prefix}RightHandMiddle1`),
      this.getBone(`${prefix}RightHandMiddle2`),
      this.getBone(`${prefix}RightHandMiddle3`),
      this.getBone(`${prefix}RightHandMiddle4`),
      this.getBone(`${prefix}RightHandRing1`),
      this.getBone(`${prefix}RightHandRing2`),
      this.getBone(`${prefix}RightHandRing3`),
      this.getBone(`${prefix}RightHandRing4`),
      this.getBone(`${prefix}RightHandPinky1`),
      this.getBone(`${prefix}RightHandPinky2`),
      this.getBone(`${prefix}RightHandPinky3`),
      this.getBone(`${prefix}RightHandPinky4`),
    ];

    this.bones.leftHipBone = this.getBone(`${prefix}RightUpLeg`);
    this.bones.leftKneeBone = this.getBone(`${prefix}RightLeg`);
    this.bones.leftAnkleBone = this.getBone(`${prefix}RightFoot`);
    this.bones.leftFootBone = this.getBone(`${prefix}RightToe_End`);

    this.bones.rightHipBone = this.getBone(`${prefix}LeftUpLeg`);
    this.bones.rightKneeBone = this.getBone(`${prefix}LeftLeg`);
    this.bones.rightAnkleBone = this.getBone(`${prefix}LeftFoot`);
    this.bones.rightFootBone = this.getBone(`${prefix}LeftToe_End`);
  }

  smoothRotation(object: THREE.Bone, rotX: number, rotY: number, rotZ: number) {
    // interpolate with current values to prevent jittering
    if (rotX != 0)
      object.rotation.x =
        (1 - SMOOTHING) * object.rotation.x + SMOOTHING * rotX;
    if (rotY != 0)
      object.rotation.y =
        (1 - SMOOTHING) * object.rotation.y + SMOOTHING * rotY;
    if (rotZ != 0)
      object.rotation.z =
        (1 - SMOOTHING) * object.rotation.z + SMOOTHING * rotZ;
  }

  // userJoint (Vector3) - world position of joint
  // userChild (Vector3) - world position of child of joint
  // avatarChild (Vector3) - local position of child Bone of joint
  // basis (Matrix3) - local axes at joint (in world coordinates)
  // returns rotation needed at joing
  rotateBone(
    userJoint: THREE.Vector3,
    userChild: THREE.Vector3,
    avatarChild: THREE.Vector3,
    basis: THREE.Matrix3,
    isArm = false,
  ) {
    // change of basis: world -> local
    const userLimb = userChild
      .clone()
      .sub(userJoint)
      .applyMatrix3(basis.invert())
      .normalize();
    const avatarLimb = avatarChild.clone().normalize();
    const r = new THREE.Quaternion().setFromUnitVectors(avatarLimb, userLimb);
    return r;
  }

  // applies rotation to basis
  updateBasis(
    rotation: THREE.Quaternion,
    xAxis: THREE.Vector3,
    yAxis: THREE.Vector3,
    zAxis: THREE.Vector3,
    basis: THREE.Matrix3,
  ) {
    xAxis.applyQuaternion(rotation);
    yAxis.applyQuaternion(rotation);
    zAxis.applyQuaternion(rotation);
    basis.set(
      xAxis.x,
      yAxis.x,
      zAxis.x,
      xAxis.y,
      yAxis.y,
      zAxis.y,
      xAxis.z,
      yAxis.z,
      zAxis.z,
    );
  }

  // returns linear interpolation of val between min and max
  // (percentage that val is between min and max)
  interpolate(val: number, min: number, max: number) {
    const result = (val - min) / (max - min);

    if (result < 0) return 0;
    else if (result > 1) return 1;
    else return result;
  }

  setMorphTarget(target: string, val: number) {
    // interpolate with previous value to prevent jittering
    this.morphTargets[this.morphDict[target]] =
      (1 - SMOOTHING) * this.morphTargets[this.morphDict[target]] +
      SMOOTHING * val;
  }

  setPoseRPM(
    poseLandmarks: any[],
    poseWorldLandmarks: any[],
    width: number,
    height: number,
  ) {
    if (
      !poseWorldLandmarks ||
      !poseWorldLandmarks.length ||
      !poseLandmarks.length
    )
      return;

    const userJoints: THREE.Vector3[] = [];
    poseWorldLandmarks.forEach((landmark) => {
      userJoints.push(
        new THREE.Vector3(landmark.x, landmark.y, landmark.z).negate(),
      );
    });

    const rightShoulderVis = poseWorldLandmarks[RIGHTSHOULDER].visibility || 0;
    const leftShoulderVis = poseWorldLandmarks[LEFTSHOULDER].visibility || 0;
    const rightHipVis = poseWorldLandmarks[RIGHTHIP].visibility || 0;
    const leftHipVis = poseWorldLandmarks[LEFTHIP].visibility || 0;

    if (rightShoulderVis > VISTHRESH && leftShoulderVis > VISTHRESH) {
      // shoulder local coordinate system
      // positive directions: x - leftShoulder -> rightShoulder,
      //                      y - hip -> shoulder,
      //                      z - user -> camera
      const shoulderX = userJoints[RIGHTSHOULDER].clone()
        .sub(userJoints[LEFTSHOULDER])
        .normalize();
      const shoulderY = userJoints[RIGHTSHOULDER].clone()
        .lerp(userJoints[LEFTSHOULDER], 0.5)
        .normalize();
      const shoulderZ = shoulderX.clone().cross(shoulderY).normalize();
      // torso direction
      const thetaX = Math.acos(shoulderZ.x);
      const thetaY = Math.acos(shoulderZ.y);
      const thetaZ = Math.acos(shoulderY.x);
      const rotX = thetaY - (1.2 * Math.PI) / 2;
      const rotY = -thetaX + Math.PI / 2;
      const rotZ = thetaZ - Math.PI / 2;
      this.smoothRotation(this.bones.spine, rotX, rotY, rotZ);

      let basisY = userJoints[LEFTSHOULDER].clone()
        .sub(userJoints[RIGHTSHOULDER])
        .normalize();
      let basisZ = userJoints[RIGHTSHOULDER].clone()
        .lerp(userJoints[LEFTSHOULDER], 0.5)
        .negate()
        .normalize();
      let basisX = basisZ.clone().cross(basisY).normalize();
      let basis = new THREE.Matrix3().set(
        basisX.x,
        basisY.x,
        basisZ.x,
        basisX.y,
        basisY.y,
        basisZ.y,
        basisX.z,
        basisY.z,
        basisZ.z,
      );

      // left arm

      const armrot: THREE.Quaternion = this.rotateBone(
        userJoints[LEFTSHOULDER],
        userJoints[LEFTELBOW],
        this.bones.leftElbowBone.position,
        basis,
      );
      let rot = armrot.clone();
      rot.z = -armrot.z;
      this.bones.leftShoulderBone.quaternion.slerp(rot, SMOOTHING);
      this.updateBasis(
        this.bones.leftShoulderBone.quaternion,
        basisX,
        basisY,
        basisZ,
        basis,
      );

      const lForeArm = this.rotateBone(
        userJoints[LEFTELBOW],
        userJoints[LEFTWRIST],
        this.bones.leftWristBone.position,
        basis,
        true,
      );
      rot = lForeArm.clone();
      rot.x = lForeArm.x;
      rot.y = lForeArm.y;
      rot.z = -lForeArm.z / 2;
      this.bones.leftElbowBone.quaternion.slerp(rot, SMOOTHING);

      // right arm

      basisY = userJoints[RIGHTSHOULDER].clone()
        .sub(userJoints[LEFTSHOULDER])
        .normalize();
      basisZ = userJoints[LEFTSHOULDER].clone()
        .lerp(userJoints[RIGHTSHOULDER], 0.5)
        .negate()
        .normalize();
      basisX = basisZ.clone().cross(basisY).normalize();
      basis = new THREE.Matrix3().set(
        basisX.x,
        basisY.x,
        basisZ.x,
        basisX.y,
        basisY.y,
        basisZ.y,
        basisX.z,
        basisY.z,
        basisZ.z,
      );

      rot = this.rotateBone(
        userJoints[RIGHTSHOULDER],
        userJoints[RIGHTELBOW],
        this.bones.rightElbowBone.position,
        basis,
      );
      rot.z = -rot.z;
      this.bones.rightShoulderBone.quaternion.slerp(rot, SMOOTHING);
      this.updateBasis(
        this.bones.rightShoulderBone.quaternion,
        basisX,
        basisY,
        basisZ,
        basis,
      );

      const rForearm = this.rotateBone(
        userJoints[RIGHTELBOW],
        userJoints[RIGHTWRIST],
        this.bones.rightWristBone.position,
        basis,
      );
      rot.x = rForearm.x;
      rot.y = rForearm.y;
      rot.z = -rForearm.z / 2;
      this.bones.rightElbowBone.quaternion.slerp(rot, SMOOTHING);
      this.updateBasis(
        this.bones.rightElbowBone.quaternion,
        basisX,
        basisY,
        basisZ,
        basis,
      );
    }

    const moveLegs = false;
    if (moveLegs) {
      // REQUIRED: both hips must be visible to track lowerbody
      if (rightHipVis > VISTHRESH && leftHipVis > VISTHRESH) {
        // hip local coordinate system
        // positive directions: x - leftHip -> rightHip,
        //                      y - hip -> shoulder,
        //                      z - user -> camera
        const hipX = userJoints[RIGHTHIP].clone()
          .sub(userJoints[LEFTHIP])
          .normalize();
        const hipY = userJoints[RIGHTSHOULDER].clone()
          .lerp(userJoints[LEFTSHOULDER], 0.5)
          .normalize(); // BUG: using shoulder Y is not accurate, but don't have better way...
        const hipZ = hipX.clone().cross(hipY).normalize();

        // body direction
        const thetaX = Math.acos(hipZ.x);
        const rotY = -thetaX + Math.PI / 2;
        this.smoothRotation(this.bones.skeleton, 0, rotY, 0);
        this.smoothRotation(this.bones.spine, (0.2 * Math.PI) / 2, -rotY, 0);

        // world position
        const LH = new THREE.Vector3(
          poseLandmarks[LEFTHIP].x * width,
          poseLandmarks[LEFTHIP].y * height,
        );
        const RH = new THREE.Vector3(
          poseLandmarks[RIGHTHIP].x * width,
          poseLandmarks[RIGHTHIP].y * height,
        );

        const percentX = LH.lerp(RH, 0.5).x / width - 0.5;
        this.bones.skeleton.position.x =
          (1 - SMOOTHING) * this.bones.skeleton.position.x +
          SMOOTHING * percentX * -1000;

        // TODO: z direction movement
        // const shoulderX = userJoints[RIGHTSHOULDER].clone().sub(userJoints[LEFTSHOULDER]).normalize();
        // let shoulderLen = LH.distanceTo(RH);
        // const angleY = Math.atan2(shoulderX.z, shoulderX.x);
        // shoulderLen /= Math.abs(Math.cos(angleY));  // BUG: division by 0
        // const precentZ = this.interpolate(shoulderLen, 550, 150);
        // this.bones.skeleton.position.z = precentZ * -1000;

        // left leg
        let xAxis = hipX.clone();
        let yAxis = hipY.clone();
        let zAxis = hipZ.clone();
        let basis = new THREE.Matrix3().set(
          xAxis.x,
          yAxis.x,
          zAxis.x,
          xAxis.y,
          yAxis.y,
          zAxis.y,
          xAxis.z,
          yAxis.z,
          zAxis.z,
        );

        let rot = this.rotateBone(
          userJoints[LEFTHIP],
          userJoints[LEFTKNEE],
          this.bones.leftKneeBone.position,
          basis,
        );
        this.bones.leftHipBone.quaternion.slerp(rot, SMOOTHING);
        this.updateBasis(
          this.bones.leftHipBone.quaternion,
          xAxis,
          yAxis,
          zAxis,
          basis,
        );

        rot = this.rotateBone(
          userJoints[LEFTKNEE],
          userJoints[LEFTANKLE],
          this.bones.leftAnkleBone.position,
          basis,
        );
        this.bones.leftKneeBone.quaternion.slerp(rot, SMOOTHING);
        this.updateBasis(
          this.bones.leftKneeBone.quaternion,
          xAxis,
          yAxis,
          zAxis,
          basis,
        );

        rot = this.rotateBone(
          userJoints[LEFTANKLE],
          userJoints[LEFTFOOT],
          this.bones.leftFootBone.position,
          basis,
        );
        this.bones.leftAnkleBone.quaternion.slerp(rot, SMOOTHING);

        // right leg
        xAxis = hipX.clone();
        yAxis = hipY.clone();
        zAxis = hipZ.clone();
        basis = new THREE.Matrix3().set(
          xAxis.x,
          yAxis.x,
          zAxis.x,
          xAxis.y,
          yAxis.y,
          zAxis.y,
          xAxis.z,
          yAxis.z,
          zAxis.z,
        );

        rot = this.rotateBone(
          userJoints[RIGHTHIP],
          userJoints[RIGHTKNEE],
          this.bones.rightKneeBone.position,
          basis,
        );
        this.bones.rightHipBone.quaternion.slerp(rot, SMOOTHING);
        this.updateBasis(
          this.bones.rightHipBone.quaternion,
          xAxis,
          yAxis,
          zAxis,
          basis,
        );

        rot = this.rotateBone(
          userJoints[RIGHTKNEE],
          userJoints[RIGHTANKLE],
          this.bones.rightAnkleBone.position,
          basis,
        );
        this.bones.rightKneeBone.quaternion.slerp(rot, SMOOTHING);
        this.updateBasis(
          this.bones.rightKneeBone.quaternion,
          xAxis,
          yAxis,
          zAxis,
          basis,
        );

        rot = this.rotateBone(
          userJoints[RIGHTANKLE],
          userJoints[RIGHTFOOT],
          this.bones.rightFootBone.position,
          basis,
        );
        this.bones.rightAnkleBone.quaternion.slerp(rot, SMOOTHING);
      } else {
        // reset legs
        this.bones.leftHipBone.quaternion.identity();
        this.bones.leftKneeBone.quaternion.identity();
        this.bones.leftAnkleBone.quaternion.identity();
        this.bones.rightHipBone.quaternion.identity();
        this.bones.rightKneeBone.quaternion.identity();
        this.bones.rightAnkleBone.quaternion.identity();
      }
    }
  }

  setPoseMixamo(
    poseLandmarks: any[],
    poseWorldLandmarks: any[],
    width: number,
    height: number,
  ) {
    if (
      !poseWorldLandmarks ||
      !poseWorldLandmarks.length ||
      !poseLandmarks.length
    )
      return;

    const userJoints: THREE.Vector3[] = [];
    poseWorldLandmarks.forEach((landmark) => {
      userJoints.push(
        new THREE.Vector3(landmark.x, landmark.y, landmark.z).negate(),
      );
    });

    const rightShoulderVis = poseWorldLandmarks[RIGHTSHOULDER].visibility || 0;
    const leftShoulderVis = poseWorldLandmarks[LEFTSHOULDER].visibility || 0;
    const rightHipVis = poseWorldLandmarks[RIGHTHIP].visibility || 0;
    const leftHipVis = poseWorldLandmarks[LEFTHIP].visibility || 0;

    if (rightShoulderVis > VISTHRESH && leftShoulderVis > VISTHRESH) {
      // shoulder local coordinate system
      // positive directions: x - leftShoulder -> rightShoulder,
      //                      y - hip -> shoulder,
      //                      z - user -> camera
      const shoulderX = userJoints[RIGHTSHOULDER].clone()
        .sub(userJoints[LEFTSHOULDER])
        .normalize();
      const shoulderY = userJoints[RIGHTSHOULDER].clone()
        .lerp(userJoints[LEFTSHOULDER], 0.5)
        .normalize();
      const shoulderZ = shoulderX.clone().cross(shoulderY).normalize();
      // torso direction
      const thetaX = Math.acos(shoulderZ.x);
      const thetaY = Math.acos(shoulderZ.y);
      const thetaZ = Math.acos(shoulderY.x);
      const rotX = thetaY - (1.2 * Math.PI) / 2;
      const rotY = -thetaX + Math.PI / 2;
      const rotZ = thetaZ - Math.PI / 2;
      this.smoothRotation(this.bones.spine, rotX, rotY, rotZ);

      // left arm

      let xAxis = shoulderX.clone();
      let yAxis = shoulderY.clone();
      let zAxis = shoulderZ.clone();
      let basis = new THREE.Matrix3().set(
        xAxis.x,
        yAxis.x,
        zAxis.x,
        xAxis.y,
        yAxis.y,
        zAxis.y,
        xAxis.z,
        yAxis.z,
        zAxis.z,
      );

      let rot: THREE.Quaternion = this.rotateBone(
        userJoints[LEFTSHOULDER],
        userJoints[LEFTELBOW],
        this.bones.leftElbowBone.position,
        basis,
      );
      this.bones.leftShoulderBone.quaternion.slerp(rot, SMOOTHING);
      this.updateBasis(
        this.bones.leftShoulderBone.quaternion,
        xAxis,
        yAxis,
        zAxis,
        basis,
      );

      rot = this.rotateBone(
        userJoints[LEFTELBOW],
        userJoints[LEFTWRIST],
        this.bones.leftWristBone.position,
        basis,
      );
      this.bones.leftElbowBone.quaternion.slerp(rot, SMOOTHING);
      this.updateBasis(
        this.bones.leftElbowBone.quaternion,
        xAxis,
        yAxis,
        zAxis,
        basis,
      );

      const leftFingersUser = userJoints[LEFTPINKY].lerp(
        userJoints[LEFTINDEX],
        0.5,
      );
      const leftFingersAvatar = this.bones.leftHandBones[PINKY1].position
        .clone()
        .lerp(this.bones.leftHandBones[INDEX1].position, 0.5);
      rot = this.rotateBone(
        userJoints[LEFTWRIST],
        leftFingersUser,
        leftFingersAvatar,
        basis,
      );
      this.bones.leftWristBone.quaternion.slerp(rot, SMOOTHING);

      // right arm
      xAxis = shoulderX.clone();
      yAxis = shoulderY.clone();
      zAxis = shoulderZ.clone();
      basis = new THREE.Matrix3().set(
        xAxis.x,
        yAxis.x,
        zAxis.x,
        xAxis.y,
        yAxis.y,
        zAxis.y,
        xAxis.z,
        yAxis.z,
        zAxis.z,
      );

      rot = this.rotateBone(
        userJoints[RIGHTSHOULDER],
        userJoints[RIGHTELBOW],
        this.bones.rightElbowBone.position,
        basis,
      );
      this.bones.rightShoulderBone.quaternion.slerp(rot, SMOOTHING);
      this.updateBasis(
        this.bones.rightShoulderBone.quaternion,
        xAxis,
        yAxis,
        zAxis,
        basis,
      );

      rot = this.rotateBone(
        userJoints[RIGHTELBOW],
        userJoints[RIGHTWRIST],
        this.bones.rightWristBone.position,
        basis,
      );
      this.bones.rightElbowBone.quaternion.slerp(rot, SMOOTHING);
      this.updateBasis(
        this.bones.rightElbowBone.quaternion,
        xAxis,
        yAxis,
        zAxis,
        basis,
      );

      const rightFingersUser = userJoints[RIGHTPINKY].lerp(
        userJoints[RIGHTINDEX],
        0.5,
      );
      const rightFingersAvatar = this.bones.rightHandBones[PINKY1].position
        .clone()
        .lerp(this.bones.rightHandBones[INDEX1].position, 0.5);
      rot = this.rotateBone(
        userJoints[RIGHTWRIST],
        rightFingersUser,
        rightFingersAvatar,
        basis,
      );
      this.bones.rightWristBone.quaternion.slerp(rot, SMOOTHING);
    }

    const moveLegs = true;
    if (moveLegs) {
      // REQUIRED: both hips must be visible to track lowerbody
      if (rightHipVis > VISTHRESH && leftHipVis > VISTHRESH) {
        // hip local coordinate system
        // positive directions: x - leftHip -> rightHip,
        //                      y - hip -> shoulder,
        //                      z - user -> camera
        const hipX = userJoints[RIGHTHIP].clone()
          .sub(userJoints[LEFTHIP])
          .normalize();
        const hipY = userJoints[RIGHTSHOULDER].clone()
          .lerp(userJoints[LEFTSHOULDER], 0.5)
          .normalize(); // BUG: using shoulder Y is not accurate, but don't have better way...
        const hipZ = hipX.clone().cross(hipY).normalize();

        // body direction
        const thetaX = Math.acos(hipZ.x);
        const rotY = -thetaX + Math.PI / 2;
        this.smoothRotation(this.bones.skeleton, 0, rotY, 0);
        this.smoothRotation(this.bones.spine, (0.2 * Math.PI) / 2, -rotY, 0);

        // world position
        const LH = new THREE.Vector3(
          poseLandmarks[LEFTHIP].x * width,
          poseLandmarks[LEFTHIP].y * height,
        );
        const RH = new THREE.Vector3(
          poseLandmarks[RIGHTHIP].x * width,
          poseLandmarks[RIGHTHIP].y * height,
        );

        const percentX = LH.lerp(RH, 0.5).x / width - 0.5;
        this.bones.skeleton.position.x =
          (1 - SMOOTHING) * this.bones.skeleton.position.x +
          SMOOTHING * percentX * -1000;

        // TODO: z direction movement
        // const shoulderX = userJoints[RIGHTSHOULDER].clone().sub(userJoints[LEFTSHOULDER]).normalize();
        // let shoulderLen = LH.distanceTo(RH);
        // const angleY = Math.atan2(shoulderX.z, shoulderX.x);
        // shoulderLen /= Math.abs(Math.cos(angleY));  // BUG: division by 0
        // const precentZ = this.interpolate(shoulderLen, 550, 150);
        // this.bones.skeleton.position.z = precentZ * -1000;

        // left leg
        let xAxis = hipX.clone();
        let yAxis = hipY.clone();
        let zAxis = hipZ.clone();
        let basis = new THREE.Matrix3().set(
          xAxis.x,
          yAxis.x,
          zAxis.x,
          xAxis.y,
          yAxis.y,
          zAxis.y,
          xAxis.z,
          yAxis.z,
          zAxis.z,
        );

        let rot = this.rotateBone(
          userJoints[LEFTHIP],
          userJoints[LEFTKNEE],
          this.bones.leftKneeBone.position,
          basis,
        );
        this.bones.leftHipBone.quaternion.slerp(rot, SMOOTHING);
        this.updateBasis(
          this.bones.leftHipBone.quaternion,
          xAxis,
          yAxis,
          zAxis,
          basis,
        );

        rot = this.rotateBone(
          userJoints[LEFTKNEE],
          userJoints[LEFTANKLE],
          this.bones.leftAnkleBone.position,
          basis,
        );
        this.bones.leftKneeBone.quaternion.slerp(rot, SMOOTHING);
        this.updateBasis(
          this.bones.leftKneeBone.quaternion,
          xAxis,
          yAxis,
          zAxis,
          basis,
        );

        rot = this.rotateBone(
          userJoints[LEFTANKLE],
          userJoints[LEFTFOOT],
          this.bones.leftFootBone.position,
          basis,
        );
        this.bones.leftAnkleBone.quaternion.slerp(rot, SMOOTHING);

        // right leg
        xAxis = hipX.clone();
        yAxis = hipY.clone();
        zAxis = hipZ.clone();
        basis = new THREE.Matrix3().set(
          xAxis.x,
          yAxis.x,
          zAxis.x,
          xAxis.y,
          yAxis.y,
          zAxis.y,
          xAxis.z,
          yAxis.z,
          zAxis.z,
        );

        rot = this.rotateBone(
          userJoints[RIGHTHIP],
          userJoints[RIGHTKNEE],
          this.bones.rightKneeBone.position,
          basis,
        );
        this.bones.rightHipBone.quaternion.slerp(rot, SMOOTHING);
        this.updateBasis(
          this.bones.rightHipBone.quaternion,
          xAxis,
          yAxis,
          zAxis,
          basis,
        );

        rot = this.rotateBone(
          userJoints[RIGHTKNEE],
          userJoints[RIGHTANKLE],
          this.bones.rightAnkleBone.position,
          basis,
        );
        this.bones.rightKneeBone.quaternion.slerp(rot, SMOOTHING);
        this.updateBasis(
          this.bones.rightKneeBone.quaternion,
          xAxis,
          yAxis,
          zAxis,
          basis,
        );

        rot = this.rotateBone(
          userJoints[RIGHTANKLE],
          userJoints[RIGHTFOOT],
          this.bones.rightFootBone.position,
          basis,
        );
        this.bones.rightAnkleBone.quaternion.slerp(rot, SMOOTHING);
      } else {
        // reset legs
        this.bones.leftHipBone.quaternion.identity();
        this.bones.leftKneeBone.quaternion.identity();
        this.bones.leftAnkleBone.quaternion.identity();
        this.bones.rightHipBone.quaternion.identity();
        this.bones.rightKneeBone.quaternion.identity();
        this.bones.rightAnkleBone.quaternion.identity();
      }
    }
  }

  setFingers(
    handLandmarks: any[],
    isRight: boolean,
    width: number,
    height: number,
  ) {
    if (!handLandmarks || !handLandmarks.length) return;
    const avatarBones = isRight
      ? this.bones.rightHandBones
      : this.bones.leftHandBones;

    return; // TODO fix finger movement

    // hand landmark positions
    const userJoints: THREE.Vector3[] = [];
    handLandmarks.forEach((landmark) => {
      userJoints.push(
        new THREE.Vector3(
          landmark.x * width,
          -landmark.y * height,
          -landmark.z * width,
        ),
      );
    });

    // hand local coordinate system
    // positive directions: x - fingers -> wrist,
    //                      y - back of hand -> world
    //                      z - pinky -> thumb
    const handX = userJoints[WRIST].clone()
      .sub(userJoints[MIDDLE1])
      .normalize();
    if (isRight) handX.negate();
    const handZ = userJoints[INDEX1].clone().sub(userJoints[RING1]).normalize();
    const handY = handX.clone().cross(handZ).normalize();
    if (!isRight) handY.negate();

    const handBasis = new THREE.Matrix3().set(
      handX.x,
      handY.x,
      handZ.x,
      handX.y,
      handY.y,
      handZ.y,
      handX.z,
      handY.z,
      handZ.z,
    );

    // thumb
    let xAxis = handX.clone();
    let yAxis = handY.clone();
    let zAxis = handZ.clone();
    let basis = handBasis.clone();

    // iterate thumb joints
    for (let i = 1; i < 4; i++) {
      const rot = this.rotateBone(
        userJoints[i],
        userJoints[i + 1],
        avatarBones[i + 1].position,
        basis,
      );
      const angles = new THREE.Euler().setFromQuaternion(rot.normalize());

      // constrain finger rotation to x-axis, range [0, 90] degrees
      let angleX = angles.x; //angles.toVector3().length();
      angleX = Math.max(0, angleX);
      angleX = Math.min(Math.PI / 2, angleX);

      if (isRight)
        this.smoothRotation(avatarBones[i], angleX - 0.2 * Math.PI, 0, 0);
      else this.smoothRotation(avatarBones[i], angleX, 0, 0);

      this.updateBasis(avatarBones[i].quaternion, xAxis, yAxis, zAxis, basis);
    }

    // iterate fingers
    for (let i = 5; i <= 17; i += 4) {
      xAxis = handX.clone();
      yAxis = handY.clone();
      zAxis = handZ.clone();
      basis = handBasis.clone();

      // iterate finger joints
      for (let j = i; j < i + 3; j++) {
        const rot = this.rotateBone(
          userJoints[j],
          userJoints[j + 1],
          avatarBones[j + 1].position,
          basis,
        );

        // constrain finger rotation to z-axis, range [0, 90] degrees
        let angleZ = new THREE.Euler().setFromQuaternion(rot.normalize()).z;
        angleZ = Math.max(0, angleZ);
        angleZ = Math.min(Math.PI / 2, angleZ);

        if (isRight) this.smoothRotation(avatarBones[j], 0, 0, -angleZ);
        else this.smoothRotation(avatarBones[j], 0, 0, angleZ);

        this.updateBasis(avatarBones[j].quaternion, xAxis, yAxis, zAxis, basis);
      }
    }
  }

  setMorphs(faceLandmarks: any[], width: number, height: number) {
    if (!this.morphTargets || !faceLandmarks || !faceLandmarks.length) return;

    // PROCESS LANDMARKS
    // console.log(faceLandmarks)

    // center of head
    const pL = new THREE.Vector3(
      faceLandmarks[FLEFT].x * width,
      faceLandmarks[FLEFT].y * height,
      faceLandmarks[FLEFT].z * width,
    );
    const pR = new THREE.Vector3(
      faceLandmarks[FRIGHT].x * width,
      faceLandmarks[FRIGHT].y * height,
      faceLandmarks[FRIGHT].z * width,
    );
    const pM = pL.lerp(pR, 0.5);

    // width and height of face
    const pT = new THREE.Vector3(
      faceLandmarks[TOP].x * width,
      faceLandmarks[TOP].y * height,
      faceLandmarks[TOP].z * width,
    );
    const pB = new THREE.Vector3(
      faceLandmarks[BOT].x * width,
      faceLandmarks[BOT].y * height,
      faceLandmarks[BOT].z * width,
    );
    const faceLenX = pR.distanceTo(pL);
    const faceLenY = pB.distanceTo(pT);

    // face plane origin
    const pN = new THREE.Vector3(
      faceLandmarks[NOSE].x * width,
      faceLandmarks[NOSE].y * height,
      faceLandmarks[NOSE].z * width,
    );

    // unit normal, face plane z-axis
    const zAxis = pN.clone().sub(pM);
    zAxis.normalize();

    // project nasal onto face plane
    const pNas = new THREE.Vector3(
      faceLandmarks[NASAL].x * width,
      faceLandmarks[NASAL].y * height,
      faceLandmarks[NASAL].z * width,
    );
    let v = pNas.clone().sub(pN);
    const dist = zAxis.dot(v);
    pNas.sub(zAxis.clone().multiplyScalar(dist));

    // face plane y-axis
    const yAxis = pNas.sub(pN);
    yAxis.normalize();

    // face plane x-axis
    const xAxis = zAxis.clone().cross(yAxis);
    xAxis.normalize();
    xAxis.negate();

    // face plane local coordinates (pX, pY)
    const facePos: number[][] = [];
    for (const landmark of faceLandmarks) {
      const p = new THREE.Vector3(
        landmark.x * width,
        landmark.y * height,
        landmark.z * width,
      );

      // project point onto face plane
      v = p.sub(pN);
      const pX = xAxis.dot(v) / faceLenX;
      const pY = yAxis.dot(v) / faceLenY;
      facePos.push([pX, pY]);
    }

    // gaze direction
    const thetaX = Math.acos(zAxis.x);
    const thetaY = Math.acos(zAxis.y);
    const thetaZ = Math.acos(yAxis.x);
    const rotX = -(thetaY - Math.PI / 2) - 0.1 * Math.PI;
    const rotY = thetaX - Math.PI / 2;
    const rotZ = -(thetaZ - Math.PI / 2);
    this.smoothRotation(this.bones.neck, rotX, rotY, rotZ);

    return; // TODO fix face morphs

    // CALCULATE MORPHS

    // eyes
    const eyeRT = facePos[27];
    const eyeRB = facePos[23];
    const eyeLT = facePos[257];
    const eyeLB = facePos[253];

    let min = 0.1;
    let max = 0.12;
    this.setMorphTarget(
      'eyeWideLeft',
      this.interpolate(eyeRT[1] - eyeRB[1], min, max),
    );
    this.setMorphTarget(
      'eyeWideRight',
      this.interpolate(eyeLT[1] - eyeLB[1], min, max),
    );

    max = 0.095;
    this.setMorphTarget(
      'eyeSquintLeft',
      this.interpolate(eyeRT[1] - eyeRB[1], min, max),
    );
    this.setMorphTarget(
      'eyeSquintRight',
      this.interpolate(eyeLT[1] - eyeLB[1], min, max),
    );

    max = 0.09;
    this.setMorphTarget(
      'eyeBlinkLeft',
      this.interpolate(eyeRT[1] - eyeRB[1], min, max),
    );
    this.setMorphTarget(
      'eyeBlinkRight',
      this.interpolate(eyeLT[1] - eyeLB[1], min, max),
    );

    // eyebrows
    const browR = facePos[66];
    const browL = facePos[296];

    min = 0.35;
    max = 0.4;
    this.setMorphTarget(
      'browOuterUpLeft',
      this.interpolate(browR[1], min, max),
    );
    this.setMorphTarget(
      'browOuterUpRight',
      this.interpolate(browL[1], min, max),
    );

    max = 0.33;
    this.setMorphTarget('browDownLeft', this.interpolate(browR[1], min, max));
    this.setMorphTarget('browDownRight', this.interpolate(browL[1], min, max));

    // mouth
    const mouthT = facePos[13];
    const mouthB = facePos[14];
    const mouthL = facePos[308];
    const mouthR = facePos[78];

    min = 0.01;
    max = 0.15;
    this.setMorphTarget(
      'mouthClose',
      -this.interpolate(mouthT[1] - mouthB[1], min, max),
    );

    min = -0.15;
    max = -0.11;
    this.setMorphTarget('mouthRight', this.interpolate(mouthR[0], min, max));
    this.setMorphTarget('mouthLeft', this.interpolate(mouthL[0], -min, -max));

    min = -0.22;
    max = -0.25;
    this.setMorphTarget('frownLeft', this.interpolate(mouthR[1], min, max));
    this.setMorphTarget('frownRight', this.interpolate(mouthL[1], min, max));

    max = -0.18;
    this.setMorphTarget(
      'mouthSmileLeft',
      this.interpolate(mouthR[1], min, max),
    );
    this.setMorphTarget(
      'mouthSmileRight',
      this.interpolate(mouthL[1], min, max),
    );

    // nose
    const noseR = facePos[129];
    const noseL = facePos[358];

    min = -0.027;
    max = -0.018;
    this.setMorphTarget(
      'noseScrunchLeft',
      this.interpolate(noseR[1], min, max),
    );
    this.setMorphTarget(
      'noseScrunchRight',
      this.interpolate(noseL[1], min, max),
    );
  }

  animate(results: HolisticV1Results) {
    try {
      if (this.isRPM) {
        this.setPoseRPM(
          results.poseLandmarks,
          results.za,
          results.width,
          results.height,
        );
      } else {
        this.setPoseMixamo(
          results.poseLandmarks,
          results.za,
          results.width,
          results.height,
        );
      }
    } catch (e) {
      this.logger.error(`Failed to apply poses: ${e}`, e);
    }
    // try{
    //   this.setFingers(results.leftHandLandmarks, false, results.width, results.height)
    // }catch(e) {
    //   this.logger.error(`Failed to apply left hand poses: ${e}`, e)
    // }
    // try{
    //   this.setFingers(results.rightHandLandmarks, true, results.width, results.height)
    // }catch(e) {
    //   this.logger.error(`Failed to apply right hand poses: ${e}`, e)
    // }
    try {
      this.setMorphs(results.faceLandmarks, results.width, results.height);
    } catch (e) {
      this.logger.error(`Failed to apply morphs: ${e}`, e);
    }
  }
}
