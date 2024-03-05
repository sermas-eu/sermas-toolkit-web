import { UserCharacterizationDto } from '@sermas/api-client/asyncapi';
import { VideoDetectorConfig } from '../video.dto';
import { type Result } from '@vladmandic/human';

export interface HumanDetectionResult {
  detections: Result;
  characterization: UserCharacterizationDto;
}

export class HumanDetectorConfig extends VideoDetectorConfig {
  scoreThreshold?: number;
}
