import EventEmitter2 from 'eventemitter2';
import { Logger } from './logger.js';

export type PerformanceStatus = 'degraded' | 'restored' | 'normal';

export interface PerformanceEvent {
  fps: number;
  status: PerformanceStatus;
}

export const FPS_MIN = 15;
// seconds to match minimum FPS
export const FPS_TTL = 10;

export class FpsMonitor {
  private readonly logger = new Logger(FpsMonitor.name);
  private readonly times: number[] = [];
  private fps: number;

  private stopped = false;
  private intv: NodeJS.Timeout;

  constructor(private readonly emitter: EventEmitter2) {}

  refreshLoop() {
    if (!window) return;
    window.requestAnimationFrame(() => {
      if (this.stopped) return;
      const now = performance.now();
      while (this.times.length > 0 && this.times[0] <= now - 1000) {
        this.times.shift();
      }
      this.times.push(now);
      this.fps = this.times.length;
      this.refreshLoop();
    });
  }

  init() {
    this.refreshLoop();

    let lastMin = 0;
    let status: PerformanceStatus = 'normal';

    const updateStatus = (newStatus: PerformanceStatus) => {
      if (status === newStatus) return;
      status = newStatus;
      this.logger.warn(
        `Performance ${status} for ${FPS_TTL}seconds, current fps:${this.fps}`,
      );
      this.emitter.emit('performance', {
        fps: this.fps,
        status,
      } as PerformanceEvent);
    };

    this.intv = setInterval(() => {
      if (this.fps < FPS_MIN) {
        lastMin++;
        if (lastMin > FPS_TTL) {
          if (status === 'degraded') return;
          updateStatus('degraded');
          return;
        }
      } else {
        lastMin--;
        if (lastMin < 0) lastMin = 0;
        if (lastMin === 0) {
          if (status === 'degraded') {
            updateStatus('restored');
            return;
          }
        }
      }
    }, 1000);
  }

  destroy() {
    this.stopped = true;
    if (this.intv) clearInterval(this.intv);
  }

  getFPS() {
    return this.fps;
  }
}
