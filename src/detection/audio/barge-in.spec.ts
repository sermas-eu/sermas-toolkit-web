import { BargeInTracker } from './barge-in.js';

const FRAME_MS = 32;

const frames = (t: BargeInTracker, probability: number, n: number) => {
  let fired = 0;
  for (let i = 0; i < n; i++) if (t.onFrame(probability, FRAME_MS)) fired++;
  return fired;
};

describe('BargeInTracker', () => {
  let now = 0;
  const tracker = () => new BargeInTracker(undefined, () => now);

  beforeEach(() => {
    now = 1_000_000;
  });

  it('a segment with the avatar silent is an ordinary turn', () => {
    const t = tracker();
    t.startSegment();
    frames(t, 0.9, 10);
    expect(t.endSegment()).toBe('turn');
  });

  it('a short burst over the avatar is discarded (echo, noise)', () => {
    const t = tracker();
    t.setAgentSpeaking(true);
    t.startSegment();
    expect(frames(t, 0.95, 10)).toBe(0); // 320 ms
    expect(t.isGuarding()).toBe(true);
    expect(t.endSegment()).toBe('discard');
  });

  it('sustained confident speech over the avatar is a barge-in, signalled once', () => {
    const t = tracker();
    t.setAgentSpeaking(true);
    t.startSegment();
    expect(frames(t, 0.9, 40)).toBe(1); // 1280 ms
    expect(t.isGuarding()).toBe(false);
    expect(t.endSegment()).toBe('barge-in');
  });

  it('a dip below the reset level restarts the count', () => {
    const t = tracker();
    t.setAgentSpeaking(true);
    t.startSegment();
    frames(t, 0.9, 15); // 480 ms
    frames(t, 0.1, 1);
    expect(frames(t, 0.9, 15)).toBe(0);
    expect(t.endSegment()).toBe('discard');
  });

  it('mid-confidence frames neither count nor reset', () => {
    const t = tracker();
    t.setAgentSpeaking(true);
    t.startSegment();
    frames(t, 0.9, 15);
    frames(t, 0.6, 5);
    expect(frames(t, 0.9, 7)).toBe(1); // 15 + 7 frames = 704 ms
  });

  it('the room echo tail after the avatar stops is still guarded', () => {
    const t = tracker();
    t.setAgentSpeaking(true);
    t.setAgentSpeaking(false);
    now += 300;
    t.startSegment();
    frames(t, 0.9, 5);
    expect(t.endSegment()).toBe('discard');

    now += 1000; // past the tail
    t.startSegment();
    frames(t, 0.9, 5);
    expect(t.endSegment()).toBe('turn');
  });

  it('a segment the avatar starts talking into is guarded from then on', () => {
    const t = tracker();
    t.startSegment();
    frames(t, 0.9, 5);
    t.setAgentSpeaking(true);
    frames(t, 0.9, 5);
    expect(t.endSegment()).toBe('discard');
  });
});
