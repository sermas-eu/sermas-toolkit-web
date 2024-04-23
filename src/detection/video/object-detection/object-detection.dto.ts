import { VideoDetectorConfig } from '../video.dto.js';

export interface ObjectDetectionResult {
  detections: any;
}

export class ObjectDetectorConfig extends VideoDetectorConfig {
  scoreThreshold?: number;
}
