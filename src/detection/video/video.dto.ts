// import { DrawingUtils } from "@mediapipe/tasks-vision"

import EventEmitter2 from 'eventemitter2';
import { SermasToolkit } from 'index.js';
import { CameraHandlerConfig } from '../camera.js';

type AtLeast<T, K extends keyof T> = Partial<T> & Pick<T, K>;

/**
 * Add to VideoDetectorType and VideoDetectorImpl new detectors types
 * when detections occurs, it will emit results to "VideoDetectorType"
 * eg. VideoDetection.on('faceApi', (res) => {})
 */

export type VideoDetectorType =
  | 'human'
  | 'holistic_v1'
  | 'faceLandmark'
  | 'qrcode';

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
  detectionThreshold?: number;
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

  getConfig() {
    return this.config;
  }

  async publish?(ev: any, toolkit?: SermasToolkit): Promise<void>;

  abstract getType(): VideoDetectorType;
  abstract getWorker(): Promise<Worker | null>;

  abstract init(canvas?: HTMLCanvasElement): void | Promise<void>;
  abstract destroy(): void | Promise<void>;
  abstract render(canvas: HTMLCanvasElement, result: T): void | Promise<void>;

  abstract process(): void | Promise<void>;
}
