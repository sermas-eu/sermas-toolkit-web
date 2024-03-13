
import {Human} from '@vladmandic/human';
import { BaseDetector } from '../base.detector.js';
import { type VideoDetectorType } from '../video.dto.js';
import { type HumanDetectionResult, HumanDetectorConfig } from './human.dto.js';

export class HumanDetector extends BaseDetector<
  HumanDetectorConfig,
  HumanDetectionResult
> {
  private loading = false;
  private human: Human;

  public getType(): VideoDetectorType {
    return 'human';
  }

  async getWorker() {
    if (!this.workerLoader) {
      this.logger.error(`Missing workerLoader() function`);
      return null;
    }

    const p = this.workerLoader()
    const isPromise = typeof p === 'object' && typeof (p as any).then === 'function'

    if (!isPromise) return p as Worker

    const Module = await p;
    if (!Module) {
      this.logger.error(`Module is not set from workerLoader() function`);
      return null;
    }
    return new Module.default() as Worker
  }

  async init(): Promise<void> {
    super.init();
  }

  async render(canvas: HTMLCanvasElement, result: HumanDetectionResult) {
    if (!this.human && !this.loading) {
      this.loading = true;
      const pkg = await import('@vladmandic/human');
      this.human = new pkg.Human({
        warmup: 'none',
      });
      this.loading = false;
    }
    if (!this.human) return;

    this.human.draw.all(canvas, result.detections, { roundRect: 0 });
  }
}
