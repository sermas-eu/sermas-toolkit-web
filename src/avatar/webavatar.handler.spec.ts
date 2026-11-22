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

describe('WebAvatarHandler queue', () => {
  const speech = (messageId: string, chunkId: string) => [
    {},
    {
      context: ['session-1', messageId, chunkId],
      message: { payload: new Uint8Array([1]) },
    },
  ];

  const setup = () => {
    const avatar = {
      getToolkit: () => ({ getBroker: () => new EventEmitter2() }),
      getAnimation: () => undefined,
      getBlendShapes: () => undefined,
    } as any;
    const handler = new WebAvatarHandler(avatar) as any;
    const played: string[] = [];
    let busy = false;
    handler.lipsync = { reset: () => {}, updateViseme: () => {} };
    handler.player = {
      play: (_: Uint8Array, chunkId: string) => {
        played.push(chunkId);
        busy = true;
      },
      isBusy: () => busy,
    };
    return { handler, played, setBusy: (b: boolean) => (busy = b) };
  };

  it('a chunk arriving while the avatar is paused waits for its turn', () => {
    const { handler, played } = setup();
    handler.onAvatarSpeechMessage(...speech('m1', 'c1'));
    handler.onAudioPlayerStatus({ playback: 'started', chunkId: 'c1' });
    handler.onAudioPlayerStatus({ playback: 'paused', chunkId: 'c1' });

    handler.onAvatarSpeechMessage(...speech('m1', 'c2'));
    expect(played).toEqual(['c1']);

    handler.onAudioPlayerStatus({ playback: 'completed', chunkId: 'c1' });
    expect(played).toEqual(['c1', 'c2']);
  });
});
