import type { UiStatus } from '../dto/events.dto';
import EventEmitter2, { ListenerFn } from 'eventemitter2';

export const emitter = new EventEmitter2();

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
