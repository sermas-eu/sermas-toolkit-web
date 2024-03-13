import { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { VideoDetectorConfig } from '../../../../video/video.dto.js';

export interface FaceLandmarkDetectorConfig extends VideoDetectorConfig {}
export interface FaceLandmarkDetectorResult extends FaceLandmarkerResult {}
