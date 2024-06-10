import type { ZBarScanner, ZBarSymbol } from '@undecaf/zbar-wasm';
import {
  XRMARKER_DETECTION,
  XRMarkerDto,
  type SermasToolkit,
  QR_DETECTION,
  QRCodeEventDto,
} from '../../../index.js';
import { BaseDetector } from '../base.detector.js';
import { VideoDetectorType } from '../video.dto.js';
import { QrcodeDetectorConfig, QrcodeDetectorResult } from './qrcode.dto.js';

export class QrcodeDetector extends BaseDetector<
  QrcodeDetectorConfig,
  QrcodeDetectorResult
> {
  protected config: Partial<QrcodeDetectorConfig> = {};
  protected ready = false;
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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (this.loading) return;

    const color = 'darkorange';

    results.forEach((item) => {
      const text = item.decode();

      ctx.font = '12pt sans-serif';
      const textPoint = 1;
      ctx.fillStyle = color;
      ctx.fillText(
        text,
        item.points[textPoint].x + 5,
        item.points[textPoint].y - 24,
      );

      item.points.forEach((point, lastPoint) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        ctx.moveTo(item.points[lastPoint].x, item.points[lastPoint].y);

        let nextPoint = lastPoint + 1;
        if (nextPoint === item.points.length) nextPoint = 0;

        ctx.lineTo(item.points[nextPoint].x, item.points[nextPoint].y);

        ctx.stroke();
      });
    });
  }

  async init(canvas: HTMLCanvasElement) {
    super.init(canvas);
    this.logger.debug(`Loading detector ${this.getType()}`);
    // todo
    const m = await import('@undecaf/zbar-wasm');
    this.scanImageData = m.scanImageData;
    this.ready = true;
    this.logger.debug(`Loaded qrcode detector`);
  }

  async process() {
    if (!this.ready) return;

    try {
      if (!this.canvas) return;

      const imageData = this.canvas
        .getContext('2d')
        ?.getImageData(0, 0, this.canvas.width, this.canvas.height);

      if (!imageData) return;
      const results = await this.scanImageData(imageData);

      if (!results.length) return;
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

  async publish(
    ev: QrcodeDetectorResult,
    toolkit: SermasToolkit,
  ): Promise<void> {
    for (const qrcode of ev) {
      const marker: XRMarkerDto = {
        appId: toolkit.getAppId(),
        payload: qrcode.decode(),
        userId: toolkit.getUserId(),
      };

      this.logger.debug(`Send QRCODE payload=${marker.payload}`);
      toolkit
        .getBroker()
        .publish(XRMARKER_DETECTION.replace(':appId', marker.appId), marker);

      const qr: QRCodeEventDto = {
        appId: toolkit.getAppId(),
        sessionId: toolkit.getSessionId(),
        version: qrcode.type.toString(),
        payload: qrcode.decode(),
      };

      toolkit.getBroker().publish(QR_DETECTION, qr);
    }
  }
}
