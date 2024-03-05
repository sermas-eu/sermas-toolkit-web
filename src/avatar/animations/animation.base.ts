import { AvatarModel } from '../webavatar';

export abstract class AnimationBase {
  protected readonly filterMeshRegExp: RegExp | string | undefined = undefined;

  constructor(protected readonly avatar: AvatarModel) {
    // filter mesh and animations matching by name
    const config = avatar.getConfig();
    if (
      config.animations?.filterMesh !== undefined &&
      config.animations?.filterMesh
    ) {
      this.filterMeshRegExp = config.animations?.filterMesh;
    }
  }

  abstract init(): Promise<void> | void;
  abstract destroy(): Promise<void> | void;
  abstract animate(delta: number): void;

  getConfig() {
    return this.avatar.getConfig();
  }

  getModel() {
    return this.avatar.getModel();
  }

  getScene() {
    return this.avatar.getScene();
  }

  isStopped() {
    return this.avatar.isStopped();
  }
}
