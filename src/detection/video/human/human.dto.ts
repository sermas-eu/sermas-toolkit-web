import { UserCharacterizationDto } from '@sermas/api-client';
import { VideoDetectorConfig } from '../video.dto.js';
import { type Result } from '@vladmandic/human';

export interface HumanDetectionResult {
  detections: Result;
  characterization: UserCharacterizationDto;
}

export class HumanDetectorConfig extends VideoDetectorConfig {
  scoreThreshold?: number;
}
