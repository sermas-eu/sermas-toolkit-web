/// <reference lib="webworker" />

import { WorkerMessage, WorkerMessageType } from './detection.dto.js';
import { VideoDetectorConfig } from './video/video.dto.js';

export abstract class DetectorWorker {
  abstract init(config: VideoDetectorConfig): Promise<void>;
  abstract isReady(): boolean | Promise<boolean>;
  abstract toggleRender(
    show: boolean,
    canvas?: OffscreenCanvas,
  ): void | Promise<void>;
  abstract process(frame: ImageBitmap): Promise<void>;
  abstract destroy(): Promise<void>;
}

export abstract class BaseDetectorWorker extends DetectorWorker {
  protected ready = false;

  protected config: Partial<VideoDetectorConfig> = {};
  protected canvas?: OffscreenCanvas;

  toggleRender(
    render: boolean,
    canvas?: OffscreenCanvas | undefined,
  ): void | Promise<void> {
    this.config.render = render;
    this.canvas = canvas;
  }

  isReady(set?: boolean) {
    if (set !== undefined) this.ready = set ? true : false;
    return this.ready;
  }

  postMessage(
    type: WorkerMessageType,
    data: any,
    opts?: StructuredSerializeOptions,
  ) {
    const ev: WorkerMessage = { type, data };
    postMessage(ev, opts);
  }
}

export const messageHandler = (initializer: () => DetectorWorker) => {
  let worker: DetectorWorker;

  return async (ev: MessageEvent<WorkerMessage>) => {
    if (!worker) worker = initializer();

    switch (ev.data.type) {
      case 'init':
        worker.init(ev.data.data);
        break;
      case 'process':
        if (!worker || !worker.isReady()) return;
        if (!ev.data) return;
        worker.process(ev.data.data);
        break;
      case 'render':
        if (!worker) return;
        worker.toggleRender(ev.data.render, ev.data.data);
        break;
    }
  };
};
