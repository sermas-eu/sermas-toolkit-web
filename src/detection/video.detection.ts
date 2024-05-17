// import { DrawingUtils } from "@mediapipe/tasks-vision";
import EventEmitter2 from 'eventemitter2';
import { SermasToolkit } from 'index.js';
import { Logger } from '../logger.js';
import { CameraHandler, CameraHandlerConfig } from './camera.js';
import type {
  VideoDetectionConfig,
  VideoDetector,
  VideoDetectorConfig,
  VideoDetectorType,
} from './video/video.dto.js';

type RenderCache = {
  fn: CallableFunction;
  ts: Date;
};

export class VideoDetection extends EventEmitter2 {
  private logger = new Logger(VideoDetection.name);

  private readonly camera = new CameraHandler();

  private renderingInterval: NodeJS.Timeout;
  private config: VideoDetectionConfig;

  private detectors: VideoDetector[] = [];
  private resultCache: Record<string, RenderCache> = {};
  private rendering = false;

  private lastDetection: Record<VideoDetectorType, number> = {
    faceLandmark: performance.now(),
    holistic_v1: performance.now(),
    human: performance.now(),
    qrcode: performance.now(),
  };

  private canvas: HTMLCanvasElement | undefined;
  private dataCanvas: HTMLCanvasElement;

  constructor(private readonly toolkit?: SermasToolkit) {
    super();
  }

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

    this.ensureDataCanvas();
    await instance.init(this.dataCanvas);

    instance.on('process', async (ev: any) => {
      this.emit(`${instance.getType()}`, ev);

      if (instance.publish && this.toolkit) {
        try {
          await instance.publish(ev, this.toolkit);
        } catch {}
      }

      // cache results for rendering
      if (!this.config.render) return;
      this.resultCache[instance.getType()] = {
        fn: () => {
          if (this.config.render && this.canvas)
            instance.render(this.canvas, ev);
        },
        ts: new Date(),
      };
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
        this.resultCache = {};
        this.logger.debug(`Detector rendering disabled`);
        return;
      }

      //render all avail results
      this.clearCanvas();
      Object.values(this.resultCache).forEach((renderer) => renderer.fn());

      Object.entries(this.resultCache).forEach(([key, renderer]) => {
        if (Date.now() - renderer.ts.getTime() < 2000) return;
        delete this.resultCache[key];
      });

      this.rendering = true;
    };

    this.renderingInterval = setInterval(renderLoop, 250);
  }

  checkCanvas() {
    if (!this.config.canvas) return;
    if (this.canvas) return;

    this.canvas = this.config.canvas;
  }

  async init(config: VideoDetectionConfig) {
    this.config = config;

    const cameraEnabled = await this.camera.init(
      config.camera as CameraHandlerConfig,
    );

    if (!cameraEnabled) return;

    if (this.config.render === true && !this.config.canvas) {
      this.logger.warn(
        `render=true but canvas not provided, no rendering will be performed`,
      );
    }

    this.config.camera.onFrame = async (video: HTMLVideoElement) => {
      await this.onFrame(video);
    };

    this.checkCanvas();

    this.emit('init');
  }

  skipDetection(detector: VideoDetector): boolean {
    const detectionThreshold =
      detector.getConfig()?.detectionThreshold ||
      this.config.detectionThreshold;

    if (detectionThreshold === undefined || detectionThreshold === 0) {
      return false;
    }

    const diff = performance.now() - this.lastDetection[detector.getType()];

    if (diff < detectionThreshold) {
      return true;
    }

    this.lastDetection[detector.getType()] = performance.now();
    return false;
  }

  clearCanvas() {
    if (!this.canvas || !this.config.render) return;
    this.canvas
      .getContext('2d')
      ?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  ensureDataCanvas() {
    if (this.dataCanvas) return;
    this.dataCanvas = document.createElement('canvas');
    this.dataCanvas.getContext('2d', { willReadFrequently: true });
    this.dataCanvas.width = this.config.camera.width;
    this.dataCanvas.height = this.config.camera.height;
  }

  private async onFrame(video: HTMLVideoElement) {
    this.checkCanvas();

    // populate the canvas
    this.ensureDataCanvas();
    this.dataCanvas.getContext('2d')?.drawImage(video, 0, 0);

    for (const detector of this.detectors) {
      try {
        if (this.skipDetection(detector)) continue;
        await detector.process();
      } catch (e: any) {
        this.logger.warn(`Failed to process frame: ${e.message} `);
      }
    }

    this.dataCanvas
      .getContext('2d')
      ?.clearRect(0, 0, this.dataCanvas.width, this.dataCanvas.height);
  }

  async destroy() {
    this.emit('destroy');

    await Promise.all(this.detectors.map(async (d) => await d.destroy()));
    this.detectors = [];

    await this.camera?.destroy();

    if (this.renderingInterval) clearInterval(this.renderingInterval);
  }
}
