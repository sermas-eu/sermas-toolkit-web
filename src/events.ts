import EventEmitter2, {
  event,
  eventNS,
  Listener,
  ListenerFn,
  OnOptions,
} from 'eventemitter2';
import type { UiStatus } from './dto.js';
import { Logger } from './logger.js';

const LOG_EVENTS = true;

class SermasEventEmitter extends EventEmitter2 {
  private readonly logger = new Logger('event-emitter');

  on(
    event: event | eventNS,
    listener: ListenerFn,
    options?: boolean | OnOptions,
  ): this | Listener {
    if (LOG_EVENTS) this.logger.debug(`on '${event.toString()}'`);
    return super.on(event, listener, options);
  }

  emit(event: event | eventNS, ...values: any[]): boolean {
    if (LOG_EVENTS) this.logger.debug(`emit '${event.toString()}'`);
    return super.emit(event, ...values);
  }

  off(event: event | eventNS, listener: ListenerFn): this {
    if (LOG_EVENTS) this.logger.debug(`off '${event.toString()}'`);
    return super.off(event, listener);
  }
}

export const emitter = new SermasEventEmitter();

export const sendStatus = (message: string) => {
  emitter.emit('ui.status', { message } as UiStatus);
};

export class EventListenerTracker {
  private listener: Record<string, ListenerFn[]> = {};

  constructor(private readonly emitter: EventEmitter2) {}

  add(event: string, fn: ListenerFn) {
    this.listener[event] = this.listener[event] || [];
    this.listener[event].push(fn);
  }

  remove(event: string, listeners?: ListenerFn | ListenerFn[]) {
    this.listener[event] = this.listener[event] || [];

    if (listeners === undefined) {
      this.remove(event, this.listener[event]);
      this.listener[event] = [];
      return;
    }

    listeners = listeners instanceof Array ? listeners : [listeners];
    // remove from local cache
    for (const listener of listeners) {
      const i = this.listener[event].indexOf(listener);
      if (i > -1) this.listener[event].splice(i, 1);
    }
    // remove from emitter
    listeners.forEach((listener) =>
      this.emitter.removeListener(event, listener),
    );
  }

  clear() {
    Object.keys(this.listener).forEach((event) => this.remove(event));
    this.listener = {};
  }
}
