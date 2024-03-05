import { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { VideoDetectorConfig } from '../../../../video/video.dto';

export interface FaceLandmarkDetectorConfig extends VideoDetectorConfig {}
export interface FaceLandmarkDetectorResult extends FaceLandmarkerResult {}
