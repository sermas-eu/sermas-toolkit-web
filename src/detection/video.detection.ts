// import { DrawingUtils } from "@mediapipe/tasks-vision";
import { Logger } from '../logger.js';
import EventEmitter2 from 'eventemitter2';
import { CameraHandler, CameraHandlerConfig } from './camera.js';
import type {
  VideoDetectionConfig,
  VideoDetector,
  VideoDetectorConfig,
  VideoDetectorType,
} from './video/video.dto.js';

export class VideoDetection extends EventEmitter2 {
  private logger = new Logger(VideoDetection.name);

  private readonly camera = new CameraHandler();

  private config: VideoDetectionConfig;

  private detectors: VideoDetector[] = [];
  private resultCache: Record<string, CallableFunction> = {};
  private rendering = false;

  private lastDetection = performance.now();

  private canvas: HTMLCanvasElement | undefined;

  public toggleRender(render?: boolean) {
    this.config = this.config || {};
    this.config.render = render === undefined ? !this.config.render : render;

    if (this.config.render) this.render();
  }

  async remove(type: VideoDetectorType) {
    await Promise.all(
      this.detectors.map(async (d, i) => {
        if (d.getType() !== type) return;
        this.detectors.splice(i, 1);
        if (this.resultCache[d.getType()]) delete this.resultCache[d.getType()];
        await d.destroy();
      }),
    );
    this.clearCanvas();
  }

  async add(instance: VideoDetector<VideoDetectorConfig>) {
    await this.remove(instance.getType());

    this.detectors.push(instance);

    await instance.init();

    instance.on('process', (ev: any) => {
      this.emit(`${instance.getType()}`, ev);

      // cache results for rendering
      if (this.config.render) {
        this.resultCache[instance.getType()] = () => {
          if (this.config.render && this.canvas)
            instance.render(this.canvas, ev);
        };
      }
    });
  }

  async render() {
    if (this.rendering) {
      return;
    }

    this.logger.debug(`Detector rendering enabled`);

    const renderLoop = () => {
      if (!this.config.render) {
        this.rendering = false;
        this.logger.debug(`Detector rendering disabled`);
        return;
      }

      //render all avail results
      this.clearCanvas();
      Object.values(this.resultCache).forEach((renderer) => renderer());

      this.rendering = true;
      requestAnimationFrame(renderLoop);
    };

    renderLoop();
  }

  checkCanvas() {
    if (!this.config.canvas) return;
    if (this.canvas) return;

    this.canvas = this.config.canvas;
  }

  async init(config: VideoDetectionConfig) {
    this.config = config;

    if (this.config.render === true && !this.config.canvas) {
      this.logger.warn(
        `render=true but canvas not provided, no rendering will be performed`,
      );
    }

    this.config.camera.onFrame = async (video: HTMLVideoElement) => {
      await this.onFrame(video);
    };
    await this.camera.init(config.camera as CameraHandlerConfig);

    this.checkCanvas();

    this.emit('init');
  }

  skipDetection(): boolean {
    if (
      this.config.detectionThreshold === undefined ||
      this.config.detectionThreshold === 0
    ) {
      return false;
    }

    const detectionThreshold = this.config.detectionThreshold;
    const diff = performance.now() - this.lastDetection;

    if (diff < detectionThreshold) {
      return true;
    }

    this.lastDetection = performance.now();
    return false;
  }

  clearCanvas() {
    if (!this.canvas || !this.config.render) return;
    this.canvas
      .getContext('2d')
      ?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private async onFrame(video: HTMLVideoElement) {
    this.checkCanvas();

    if (this.skipDetection()) return;

    let frame: ImageBitmap
    try {
      frame = await createImageBitmap(video);
    } catch(e: any) {
      this.logger.warn(`Failed createImageBitmap: ${e.message}`)
      return
    }

    if (!frame) return;

    this.detectors.forEach(async (detector) => {
      try {
        detector.process(frame);
      } catch (e: any) {
        this.logger.warn(`Failed to process frame: ${e.message} `);
      }
    });
  }

  async destroy() {
    this.emit('destroy');

    await Promise.all(this.detectors.map(async (d) => await d.destroy()));
    this.detectors = [];

    await this.camera?.destroy();
  }
}
