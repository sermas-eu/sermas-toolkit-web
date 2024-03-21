import type { ZBarScanner, ZBarSymbol } from '@undecaf/zbar-wasm';
import { BaseDetector } from '../base.detector.js';
import { VideoDetectorType } from '../video.dto.js';
import { QrcodeDetectorConfig, QrcodeDetectorResult } from './qrcode.dto.js';

export class QrcodeDetector extends BaseDetector<
  QrcodeDetectorConfig,
  QrcodeDetectorResult
> {
  protected config: Partial<QrcodeDetectorConfig> = {};
  protected ready = false;
  protected canvas: HTMLCanvasElement;
  protected loading = false;

  private scanImageData: (
    image: ImageData,
    scanner?: ZBarScanner,
  ) => Promise<ZBarSymbol[]>;

  public getType(): VideoDetectorType {
    return 'qrcode';
  }

  async getWorker() {
    return null;
  }

  async render(canvas: HTMLCanvasElement, results: QrcodeDetectorResult) {
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;
    if (this.loading) return;

    console.log(results);
  }

  async init() {
    this.logger.debug(`Loading detector ${this.getType()}`);
    // todo
    const m = await import('@undecaf/zbar-wasm');
    this.scanImageData = m.scanImageData;
    this.ready = true;
    this.logger.debug(`Loaded detector`);
  }

  getCanvas(frame: ImageBitmap) {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = frame.width;
      this.canvas.height = frame.height;
    }

    this.canvas.getContext('bitmaprenderer')?.transferFromImageBitmap(frame);

    return this.canvas;
  }

  async process(frame: ImageBitmap) {
    if (!this.ready) return;

    try {
      const imageData = this.getCanvas(frame)
        .getContext('2d')
        ?.getImageData(0, 0, frame.width, frame.height);
      if (!imageData) return;
      const results = await this.scanImageData(imageData);
      this.emit('process', results);
    } catch (e: any) {
      this.logger.error(`Error executing inference, ${e.stack}`);
    }
  }

  async destroy() {
    this.ready = false;
    // todo
    await super.destroy();
  }
}
