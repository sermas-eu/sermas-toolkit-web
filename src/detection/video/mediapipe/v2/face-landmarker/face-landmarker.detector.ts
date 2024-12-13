import { FilesetResolver } from '@mediapipe/tasks-audio';
import { type DrawingUtils, FaceLandmarker } from '@mediapipe/tasks-vision';
import { BaseDetector } from '../../../base.detector.js';
import { VideoDetectorType } from '../../../video.dto.js';
import {
  FaceLandmarkDetectorConfig,
  FaceLandmarkDetectorResult,
} from './face-landmarker.dto.js';

export class FaceLandmarkDetector extends BaseDetector<
  FaceLandmarkDetectorConfig,
  FaceLandmarkDetectorResult
> {
  protected config: Partial<FaceLandmarkDetectorConfig> = {};

  protected ready = false;

  protected faceLandmarker: FaceLandmarker;

  protected loading = false;
  protected drawingUtils: DrawingUtils;

  public getType(): VideoDetectorType {
    return 'faceLandmark';
  }

  async getWorker() {
    return null;
  }

  async render(canvas: HTMLCanvasElement, results: FaceLandmarkDetectorResult) {
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;
    if (this.loading) return;

    if (!this.drawingUtils) {
      this.loading = true;

      const m = await import('@mediapipe/tasks-vision');
      this.drawingUtils = new m.DrawingUtils(canvasCtx);

      this.loading = false;
    }

    const drawingUtils = this.drawingUtils;

    const lineWidth = 0.5;

    for (const landmarks of results.faceLandmarks) {
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: '#C0C0C070', lineWidth },
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
        { color: '#FF3030' },
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
        { color: '#FF3030' },
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
        { color: '#30FF30' },
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
        { color: '#30FF30' },
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
        { color: '#E0E0E0' },
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LIPS,
        {
          color: '#E0E0E0',
        },
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
        { color: '#FF3030' },
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
        { color: '#30FF30' },
      );
    }
  }

  async init(canvas?: HTMLCanvasElement) {
    super.init(canvas);
    this.logger.debug(`Loading detector ${this.getType()}`);

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
    );
    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: 'GPU',
      },
      outputFaceBlendshapes: true,
      runningMode: 'IMAGE',
      numFaces: 1,
    });

    this.ready = true;
    this.logger.debug(`Loaded detector`);
  }

  async process() {
    if (!this.ready) return;
    if (!this.faceLandmarker) return;

    try {
      const results = this.faceLandmarker.detect(this.canvas);
      this.emit('process', results);
    } catch (e: any) {
      this.logger.error(`Error executing inference, ${e.stack}`);
    }
  }

  async destroy() {
    this.ready = false;
    await this.faceLandmarker?.close();
    await super.destroy();
  }
}
