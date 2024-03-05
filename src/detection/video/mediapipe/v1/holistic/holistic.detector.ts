import type { Data } from '@mediapipe/drawing_utils';
import { BaseDetector } from '../../../base.detector';
import type { HolisticDetectorConfig, HolisticV1Results } from './holistic.dto';

import type { Holistic, Results } from '@mediapipe/holistic';
import pkg from '@mediapipe/holistic';
import type { VideoDetectorType } from '../../../video.dto';

const {
  FACEMESH_FACE_OVAL,
  FACEMESH_LEFT_EYE,
  FACEMESH_LEFT_EYEBROW,
  FACEMESH_LIPS,
  FACEMESH_RIGHT_EYE,
  FACEMESH_RIGHT_EYEBROW,
  FACEMESH_TESSELATION,
  HAND_CONNECTIONS,
  POSE_CONNECTIONS,
  POSE_LANDMARKS_LEFT,
  POSE_LANDMARKS_RIGHT,
} = pkg;

export class HolisticDetector extends BaseDetector<
  HolisticDetectorConfig,
  HolisticV1Results
> {
  protected config: Partial<HolisticDetectorConfig> = {};
  protected holistic: Holistic | undefined;
  protected ready = false;

  protected canvas: HTMLCanvasElement;

  protected loading = false;
  protected drawingUtils: any;

  constructor(config?: Partial<HolisticDetectorConfig>) {
    super(config);
  }

  public getType(): VideoDetectorType {
    return 'holistic_v1';
  }

  async getWorker() {
    return null;
  }

  async render(canvas: HTMLCanvasElement, results: HolisticV1Results) {
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;
    if (this.loading) return;

    if (!this.drawingUtils) {
      this.loading = true;
      const pkg = await import('@mediapipe/drawing_utils');
      this.drawingUtils = pkg.default;
      this.loading = false;
    }

    const drawingUtils = this.drawingUtils;

    // Pose...
    drawingUtils.drawConnectors(
      canvasCtx,
      results.poseLandmarks,
      POSE_CONNECTIONS,
      { color: 'white' },
    );
    drawingUtils.drawLandmarks(
      canvasCtx,
      Object.values(POSE_LANDMARKS_LEFT).map(
        (index) => results.poseLandmarks[index],
      ),
      { visibilityMin: 0.65, color: 'white', fillColor: 'rgb(255,138,0)' },
    );
    drawingUtils.drawLandmarks(
      canvasCtx,
      Object.values(POSE_LANDMARKS_RIGHT).map(
        (index) => results.poseLandmarks[index],
      ),
      { visibilityMin: 0.65, color: 'white', fillColor: 'rgb(0,217,231)' },
    );

    // Hands...
    drawingUtils.drawConnectors(
      canvasCtx,
      results.rightHandLandmarks,
      HAND_CONNECTIONS,
      { color: 'white' },
    );
    drawingUtils.drawLandmarks(canvasCtx, results.rightHandLandmarks, {
      color: 'white',
      fillColor: 'rgb(0,217,231)',
      lineWidth: 2,
      radius: (data: Data) => {
        return drawingUtils.lerp(data.from!.z!, -0.15, 0.1, 10, 1);
      },
    });
    drawingUtils.drawConnectors(
      canvasCtx,
      results.leftHandLandmarks,
      HAND_CONNECTIONS,
      { color: 'white' },
    );
    drawingUtils.drawLandmarks(canvasCtx, results.leftHandLandmarks, {
      color: 'white',
      fillColor: 'rgb(255,138,0)',
      lineWidth: 2,
      radius: (data: Data) => {
        return drawingUtils.lerp(data.from!.z!, -0.15, 0.1, 10, 1);
      },
    });

    // Face...
    drawingUtils.drawConnectors(
      canvasCtx,
      results.faceLandmarks,
      FACEMESH_TESSELATION,
      { color: '#C0C0C070', lineWidth: 1 },
    );
    drawingUtils.drawConnectors(
      canvasCtx,
      results.faceLandmarks,
      FACEMESH_RIGHT_EYE,
      { color: 'rgb(0,217,231)' },
    );
    drawingUtils.drawConnectors(
      canvasCtx,
      results.faceLandmarks,
      FACEMESH_RIGHT_EYEBROW,
      { color: 'rgb(0,217,231)' },
    );
    drawingUtils.drawConnectors(
      canvasCtx,
      results.faceLandmarks,
      FACEMESH_LEFT_EYE,
      { color: 'rgb(255,138,0)' },
    );
    drawingUtils.drawConnectors(
      canvasCtx,
      results.faceLandmarks,
      FACEMESH_LEFT_EYEBROW,
      { color: 'rgb(255,138,0)' },
    );
    drawingUtils.drawConnectors(
      canvasCtx,
      results.faceLandmarks,
      FACEMESH_FACE_OVAL,
      { color: '#E0E0E0', lineWidth: 5 },
    );
    drawingUtils.drawConnectors(
      canvasCtx,
      results.faceLandmarks,
      FACEMESH_LIPS,
      { color: '#E0E0E0', lineWidth: 5 },
    );

    canvasCtx.restore();
  }

  async init() {
    this.logger.debug(`Loading detector`);

    const holistic: Holistic = new pkg.Holistic({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
      },
    });

    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    holistic.onResults((results: Results) => {
      this.emit('process', {
        ...results,
        width: 640,
        height: 480,
      } as HolisticV1Results);
    });

    await holistic.initialize();

    this.holistic = holistic;
    this.ready = true;

    this.logger.debug(`Loaded detector`);
  }

  getCanvas(frame: ImageBitmap): HTMLCanvasElement {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = frame.width;
      this.canvas.height = frame.height;
    }

    this.canvas.getContext('bitmaprenderer')?.transferFromImageBitmap(frame);

    return this.canvas;
  }

  async process(frame: ImageBitmap) {
    if (!this.ready) return;
    if (!this.holistic) return;

    try {
      this.holistic.send({
        image: this.getCanvas(frame),
      });
    } catch (e: any) {
      this.logger.error(`Error executing inference, ${e.stack}`);
    }
  }

  async destroy() {
    this.ready = false;
    await this.holistic?.close();
    await super.destroy();
  }
}
