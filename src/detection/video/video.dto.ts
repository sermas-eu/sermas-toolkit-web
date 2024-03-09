// import { DrawingUtils } from "@mediapipe/tasks-vision"

import EventEmitter2 from 'eventemitter2';
import { CameraHandlerConfig } from '../camera';

type AtLeast<T, K extends keyof T> = Partial<T> & Pick<T, K>;

/**
 * Add to VideoDetectorType and VideoDetectorImpl new detectors types
 * when detections occurs, it will emit results to "VideoDetectorType"
 * eg. VideoDetection.on('faceApi', (res) => {})
 */

export type VideoDetectorType = 'human' | 'holistic_v1' | 'faceLandmark'; //| 'handLandmark'

export interface VideoDetectionConfig extends Record<string, any> {
  camera: AtLeast<CameraHandlerConfig, 'width' | 'height' | 'video'>;
  canvas?: HTMLCanvasElement;
  render?: boolean;
  detectionThreshold?: number;
}

export interface DetectorRenderer {
  detector: VideoDetector;
  result: any;
}

export class DetectionRenderingContext {
  // utils: DrawingUtils
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
}

export class VideoDetectorConfig implements Record<string, any> {
  render?: boolean;
}

export type WorkerLoader = () => Worker | Promise<any | undefined>;

export abstract class VideoDetector<
  C extends VideoDetectorConfig = VideoDetectorConfig,
  T = any,
> extends EventEmitter2 {
  constructor(
    protected readonly config?: C,
    protected readonly workerLoader?: WorkerLoader,
  ) {
    super();
    this.config = config || ({} as C);
    this.workerLoader = workerLoader;
  }

  abstract getType(): VideoDetectorType;
  abstract getWorker(): Promise<Worker | null>;

  abstract init(): void | Promise<void>;
  abstract destroy(): void | Promise<void>;
  abstract render(canvas: HTMLCanvasElement, result: T): void | Promise<void>;

  abstract process(frame: ImageBitmap): void | Promise<void>;
}
