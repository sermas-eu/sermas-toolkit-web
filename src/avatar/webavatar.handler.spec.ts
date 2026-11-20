import EventEmitter2 from 'eventemitter2';
import { emitter } from '../events.js';
import { WebAvatarHandler } from './webavatar.handler.js';

describe('WebAvatarHandler callbacks', () => {
  it('removes every listener it registered, also after re-registering', () => {
    const broker = new EventEmitter2();
    const avatar = { getToolkit: () => ({ getBroker: () => broker }) } as any;
    const handler = new WebAvatarHandler(avatar);

    const before = emitter.listeners().length;
    handler.registerCallbacks();
    handler.registerCallbacks();
    expect(broker.listenerCount('dialogue.speech')).toBe(1);
    expect(emitter.listenerCount('detection.audio')).toBe(1);

    handler.unregisterCallbacks();
    expect(broker.listeners().length).toBe(0);
    expect(emitter.listeners().length).toBe(before);
  });
});
