/// <reference lib="webworker" />

import { Logger } from '../../../logger';
import { type HumanDetectionResult, HumanDetectorConfig } from './human.dto';
import {
  BaseDetectorWorker,
  messageHandler,
} from '../../../detection/base.worker';
import type { FaceResult } from '@vladmandic/human';
import {
  Human,
  type Config as HumanConfig,
  type Emotion as HumanEmotion,
} from '@vladmandic/human';
import type {
  UserCharacterizationDto,
  UserEmotionValue,
} from '@sermas/api-client';
import { Emotion } from 'dto';

// import {setWasmPaths} from '@tensorflow/tfjs-backend-wasm';

// const isDev = process.env.NODE_ENV === 'development'
// const HumanModelPath = isDev ? '/node_modules/@vladmandic/human/models' : '/human/models'
// const HumanWasmPath = isDev ? '/node_modules/@tensorflow/tfjs-backend-wasm/wasm-out/' : '/tfjs-backend-wasm/wasm-out/'

const HumanModelPath = '/human/models';
const HumanWasmPath = '/tfjs-backend-wasm/wasm-out/';

interface HumanExpressionValue {
  score: number;
  emotion: HumanEmotion;
}

class HumanWorker extends BaseDetectorWorker {
  private readonly logger = new Logger(`${HumanWorker.name}.worker`);

  private human: Human | undefined;

  protected config: Partial<HumanDetectorConfig> = {
    scoreThreshold: 0.2,
  };

  async init(userConfig: Partial<HumanDetectorConfig>) {
    this.logger.debug(`Loading human detector`);

    this.config = { ...this.config, ...userConfig } as HumanDetectorConfig;

    // https://github.com/vladmandic/human/blob/main/demo/facedetect/facedetect.js
    const humanConfig: Partial<HumanConfig> = {
      backend: 'wasm',

      wasmPath: HumanWasmPath,
      modelBasePath: HumanModelPath,

      filter: { enabled: true, equalization: false, flip: false },

      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false },
      segmentation: { enabled: false },

      face: {
        detector: {
          enabled: true,
          minConfidence: this.config.scoreThreshold,
        },
        skipTime: 500,
        antispoof: { enabled: false },
        liveness: { enabled: false },
        emotion: { enabled: true },
        iris: { enabled: false },
        mesh: { enabled: false },
        description: { enabled: true },
      },
    };

    this.human = new Human(humanConfig);
    await this.human?.load();
    this.isReady(true);

    this.logger.debug(`Loaded human detector`);
  }

  async process(frame: ImageBitmap) {
    if (!this.ready) return;
    if (!this.human) return;

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
        } as HumanDetectionResult);
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
      emotion: this.getMainExpression(result.emotion),
    };
    return res;
  }

  getMainExpression(expressions?: HumanExpressionValue[]): UserEmotionValue {
    if (!expressions || !expressions.length)
      return { probability: 0, value: 'neutral' };

    // console.log(expressions.map(e => e.emotion + ' ' + e.score))
    const [result] = expressions.sort((a, b) => (a.score < b.score ? 1 : -1));
    // console.log(result)

    const probability = result.score;
    const value = result.emotion as Emotion;

    return { value, probability };
  }

  async destroy() {
    this.ready = false;
    this.human = undefined;
  }
}

onmessage = messageHandler(() => new HumanWorker());

export {};
