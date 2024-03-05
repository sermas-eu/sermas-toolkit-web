import BodyPart from './skeleton/BodyPart';
import Head from './skeleton/primitives/Head.d.ts';

import Memory from './../../../memory/Globals.js';

window.Memory = Memory;

export default class Skeleton {
  private bones: Array<BodyPart> = [];
  private keypoints: object;
  private mapping: object;
  private mesh: object;

  public constructor(keypoints: object) {
    this.keypoints = keypoints;
  }
  public setMapping(mapping: object) {
    this.mapping = mapping;
  }
  public setMesh(mesh: object) {
    this.mesh = mesh;
  }
  public estimate() {
    //first rotate the mesh based off the shoulder angles.

    const keypointLeftShoulder = this.getKeyPoint('leftShoulder');
    const keypointRightShoulder = this.getKeyPoint('rightShoulder');

    const rotation = this.calculateRotationalAngle(
      keypointLeftShoulder.position.y,
      keypointRightShoulder.position.y,
    );

    const whole = this.mesh.parent; //should return a group.

    Memory.retrieve('current-mesh').rotation.set(
      whole.rotation.x,
      whole.rotation.y + rotation,
      whole.rotation.z,
    );

    return;

    //build the skeleton, get the maps and connect.

    const headCoords = this.getKeyPoint('nose').position;
    const head = new Head('head', headCoords.x, headCoords.y);
    const mesh = this.getMeshBoneByName(this.mapping['nose'], this.mesh);
    head.setMeshBone(mesh);

    this.bones.push(head);
    console.log(this);
  }
  private getKeyPoint(boneName) {
    for (let i = 0; i < this.keypoints.length; i++) {
      if (this.keypoints[i].part == boneName) {
        return this.keypoints[i];
      }
    }
    return null;
  }
  private getMeshBoneByName(
    boneName: string,
    parent: object | null,
  ): object | null {
    if (!parent) {
      parent = this.mesh;
    }
    let out = null;
    parent.children.some((child) => {
      if (child.name == boneName) {
        out = child;
        return true;
      }
      const csearch = this.getMeshBoneByName(boneName, child);

      if (csearch) {
        out = csearch;
        return true;
      }
    });
    return out;
  }

  private calculateRotationalAngle(y1: number, y2: number) {
    const dist: number = y2 - y1;

    return dist * (Math.PI / 180) * 1.2;
  }
}
