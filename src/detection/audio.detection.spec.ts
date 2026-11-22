import { emitter } from '../events.js';
import { AudioDetection } from './audio.detection.js';

const FRAME = new Float32Array(512); // 32 ms at 16 kHz

const fakeToolkit = () => {
  const published: { topic: string; size: number }[] = [];
  const handler = {
    duckSpeech: vi.fn(),
    unduckSpeech: vi.fn(),
  };
  const toolkit = {
    getSessionId: () => 'session-1',
    getAppId: () => 'app-1',
    getSettings: () => ({ get: () => ({ interactionStart: 'touch' }) }),
    getBroker: () => ({
      publish: (topic: string, data: Uint8Array) =>
        published.push({ topic, size: data.length }),
    }),
    getAvatar: () => ({ getHandler: () => handler }),
  };
  return { toolkit, published, handler };
};

const detection = () => {
  const fake = fakeToolkit();
  const d = new AudioDetection(fake.toolkit as any) as any;
  d.encodeWAV = (s: Float32Array) => new ArrayBuffer(44 + s.length * 2);
  return { d, ...fake };
};

// drives the VAD callbacks the way vad-web 0.0.31 orders them: FrameProcessed
// precedes SpeechStart on the first speech frame
const speak = async (d: any, probability: number, n: number) => {
  d.onFrameProcessed({ isSpeech: probability, notSpeech: 0 }, FRAME);
  d.onSpeechStart();
  for (let i = 1; i < n; i++)
    d.onFrameProcessed({ isSpeech: probability, notSpeech: 0 }, FRAME);
  await d.onSpeechEnd(new Float32Array(512 * n));
};

describe('AudioDetection turns', () => {
  afterEach(() => {
    vi.useRealTimers();
    emitter.removeAllListeners('ui.avatar.speaking');
  });

  it('sends each turn once, as one clip, under the id given at speech start', async () => {
    const { d, published } = detection();
    await speak(d, 0.9, 20);
    const first = d.chunkId;
    await speak(d, 0.9, 20);

    expect(published).toHaveLength(2);
    expect(published[0].topic).toBe(`dialogue/user-speech/session-1/${first}`);
    expect(published[1].topic).not.toBe(published[0].topic);
    expect(published.every((p) => !p.topic.includes('/stream/'))).toBe(true);
  });

  it('discards a short segment while the avatar speaks', async () => {
    const { d, published, handler } = detection();
    d.setAgentSpeaking(true);
    await speak(d, 0.95, 10);
    expect(published).toHaveLength(0);
    expect(handler.duckSpeech).not.toHaveBeenCalled();
  });

  it('a barge-in ducks the avatar, sends the turn, and restores it on timeout', async () => {
    vi.useFakeTimers();
    const { d, published, handler } = detection();
    d.setAgentSpeaking(true);
    await speak(d, 0.9, 40);

    expect(handler.duckSpeech).toHaveBeenCalledTimes(1);
    expect(published).toHaveLength(1);
    expect(handler.unduckSpeech).not.toHaveBeenCalled();

    vi.advanceTimersByTime(6000);
    expect(handler.unduckSpeech).toHaveBeenCalledTimes(1);
  });

  it('follows the avatar speaking state from the toolkit events', async () => {
    const { d, published } = detection();
    // wired as startVAD does
    emitter.on('ui.avatar.speaking', d.onAgentSpeaking);
    emitter.emit('ui.avatar.speaking', true);
    await speak(d, 0.95, 10);
    expect(published).toHaveLength(0);
  });

  it('lets a clip through when the speech classifier is unavailable', async () => {
    const { d } = detection();
    expect(d.classifier).toBeUndefined();
    expect(await d.classify(new Float32Array(512))).toBe(true);
  });
});
