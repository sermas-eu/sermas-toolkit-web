/// <reference lib="webworker" />

import { Logger } from '../../../logger.js';
import { BaseDetectorWorker, messageHandler } from '../../base.worker.js';
import {
  ObjectDetectionResult,
  ObjectDetectorConfig,
} from './object-detection.dto.js';
class ObjectDetectionWorker extends BaseDetectorWorker {
  private readonly logger = new Logger(`${ObjectDetectionWorker.name}.worker`);

  private detect = false;

  async init(userConfig: Partial<ObjectDetectorConfig>) {
    this.logger.debug(`Loading object detector`);

    this.config = { ...this.config, ...userConfig } as ObjectDetectorConfig;
    this.isReady(true);
  }

  triggerDetection() {
    this.detect = true;
  }

  async process(frame: ImageBitmap) {
    if (!this.ready) return;
    if (!this.detect) return;
    this.detect = false;

    try {
      // console.warn('process', new Date())
      const result = await this.human.detect(frame);
      // const result = this.human.next(); // calculate next interpolated frame from last known result

      if (!result) return;
      if (!result.face.length) return;
      if (!result.persons.length) return;

      // canvas cannot be sent as serialized
      result.canvas = undefined;
      result.persons.forEach((person) => {
        // console.log(JSON.stringify(person))
        const characterization = this.mapResults(person.face);
        this.postMessage('process', {
          characterization,
          detections: result,
        } as ObjectDetectionResult);
      });
    } catch (e: any) {
      this.logger.error(`Error executing inference, ${e.stack}`);
    }
  }

  mapResults(result: FaceResult): UserCharacterizationDto {
    const res: UserCharacterizationDto = {
      age: {
        probability: result.age ? 1.0 : 0,
        value: result.age || 0,
      },
      // emotion: this.getMainExpression(result.emotion),
    };
    return res;
  }

  async destroy() {
    this.ready = false;
  }
}

onmessage = messageHandler(() => new ObjectDetectionWorker());

export {};
