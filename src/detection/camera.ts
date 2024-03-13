import { Logger } from '../logger.js';

export class CameraHandlerConfig {
  width: number;
  height: number;
  video: HTMLVideoElement;
  onFrame: (video: HTMLVideoElement) => Promise<void>;
}

export class CameraHandler {
  private readonly logger = new Logger(CameraHandler.name);

  private config: CameraHandlerConfig;
  private stream?: MediaStream;
  private canvas?: HTMLCanvasElement;

  private defaultConfig: Partial<CameraHandlerConfig> = {
    width: 320,
    height: 280,
  };

  private stopped = false;

  isSupported() {
    return (
      'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices
    );
  }

  async loadStream() {
    if (this.stream) return this.stream;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      return this.stream;
    } catch (e) {
      this.logger.warn(`Failed to access camera`);
    }
    return undefined;
  }

  createCanvas() {
    if (this.canvas) return this.canvas;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;
    document.body.appendChild(this.canvas);
    return this.canvas;
  }

  async init(config: CameraHandlerConfig) {
    if (!config.video) throw new Error(`video not set`);
    this.config = { ...this.defaultConfig, ...config };

    if (!this.isSupported()) throw new Error('Camera not supported');

    this.stopped = false;

    this.createCanvas();
    if (!this.canvas) {
      throw new Error('Failed to load canvas');
    }

    const mediaStream = await this.loadStream();
    if (!mediaStream) {
      throw new Error(`Failed to load stream`);
    }

    // init
    const video = this.config.video;
    video.srcObject = mediaStream;

    // track frame change
    let lastTime = -1;
    const onAnimationFrame = (currentTime = 0) => {
      if (this.stopped) return;
      if (currentTime !== lastTime) {
        lastTime = currentTime;
        this.config.onFrame(this.config.video);
      }
      // https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
      if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
        this.config.video.requestVideoFrameCallback(onAnimationFrame)
      }
      else {
        requestAnimationFrame(onAnimationFrame);
      }
    };

    onAnimationFrame();
  }

  async destroy() {
    this.stopped = true;
    this.stream?.getVideoTracks().forEach((track) => track.stop());
  }
}
