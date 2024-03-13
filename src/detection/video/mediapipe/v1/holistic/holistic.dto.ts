import type { Results } from '@mediapipe/holistic';
import { VideoDetectorConfig } from '../../../video.dto.js';

export class HolisticDetectorConfig extends VideoDetectorConfig {
  //
}

interface PoseZa {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface HolisticV1Results extends Results {
  za: PoseZa[];
  width: number;
  height: number;
}
