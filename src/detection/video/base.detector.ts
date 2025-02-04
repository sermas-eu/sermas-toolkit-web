import { Logger } from '../../logger.js';
import { type WorkerMessage } from 'dto.js';
import { VideoDetector, VideoDetectorConfig } from './video.dto.js';

export abstract class BaseDetector<
  C extends VideoDetectorConfig,
  T,
> extends VideoDetector<C, T> {
  protected logger = new Logger(BaseDetector.name);

  stopped = false;

  private worker: Worker | undefined;

  protected canvas: HTMLCanvasElement;

  async destroy() {
    this.stopped = true;
    this.postMessage({ type: 'destroy', data: null });
    this.removeAllListeners();
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.terminate();
      this.worker = undefined;
    }
  }

  async init(canvas?: HTMLCanvasElement) {
    await this.loadWorker();
    if (canvas) this.canvas = canvas;
    this.postMessage({ type: 'init', data: this.config });
    this.stopped = false;
  }

  protected postMessage(message: WorkerMessage, transferable?: Transferable[]) {
    if (!this.worker) return;
    try {
      this.worker?.postMessage(message, transferable ? transferable : []);
    } catch (e: any) {
      this.logger.warn(`postMessage failed ${e.stack}`);
    }
  }

  protected async loadWorker(): Promise<boolean> {
    if (this.worker) return true;
    try {
      const worker = await this.getWorker();

      if (worker === null) return false;

      this.worker = worker;
      if (!this.worker) return false;

      this.worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
        if (ev.data.type === 'process') {
          this.emit(ev.data.type, ev.data.data);
        }
      };

      return true;
    } catch (e: any) {
      this.logger.error(`Failed to load webworker: ${e.stack}`);
    }
    return false;
  }

  async createImageBitmap(
    video: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas,
  ) {
    try {
      return await createImageBitmap(video);
    } catch (e: any) {
      this.logger.warn(`Failed createImageBitmap: ${e.message}`);
      return;
    }
  }

  async process() {
    if (this.stopped) return;
    const frame = await this.createImageBitmap(this.canvas);
    if (!frame) return;
    this.postMessage({ type: 'process', data: frame }, [frame]);
  }
}
