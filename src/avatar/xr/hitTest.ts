import { WebGLRenderer } from 'three';

export class HitTestHandler {
  private hitTestSource?: XRHitTestSource;
  private hitTestSourceRequested = false;

  constructor(private readonly renderer: WebGLRenderer) {}

  public async onFrame(frame?: XRFrame) {
    if (!frame) return undefined;

    const referenceSpace = this.renderer.xr.getReferenceSpace();
    const session = this.renderer.xr.getSession();

    if (!session) return;

    if (this.hitTestSourceRequested === false) {
      const referenceSpace = await session.requestReferenceSpace('viewer');
      if (session.requestHitTestSource === undefined) return;
      this.hitTestSource = await session.requestHitTestSource({
        space: referenceSpace,
      });

      session.addEventListener('end', () => {
        this.hitTestSourceRequested = false;
        this.hitTestSource?.cancel();
        this.hitTestSource = undefined;
      });

      this.hitTestSourceRequested = true;
    }

    if (this.hitTestSource && referenceSpace) {
      const hitTestResults = frame.getHitTestResults(this.hitTestSource);

      if (!hitTestResults.length) return undefined;

      const hit = hitTestResults[0];
      const xrHitPose = hit.getPose(referenceSpace);
      const xrHitPoseMatrix = xrHitPose?.transform.matrix;

      return xrHitPoseMatrix;
    }

    return undefined;
  }
}
