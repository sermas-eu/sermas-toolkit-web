import { WebAvatarAudioPlayer } from './webavatar.audio-player.js';

// a minimal Web Audio stand-in: decode resolves when the test says so
class FakeSource {
  onended: (() => void) | null = null;
  playbackRate = { value: 1 };
  started = false;
  stopped = false;
  constructor(
    public ctx: FakeContext,
    public opts: any,
  ) {
    ctx.sources.push(this);
  }
  connect() {}
  disconnect() {}
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  end() {
    this.onended?.();
  }
}

class FakeContext {
  static instances: FakeContext[] = [];
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0;
  destination = {};
  sources: FakeSource[] = [];
  gainValue = 1;
  decodes: { resolve: (b: any) => void; reject: (e: any) => void }[] = [];
  constructor() {
    FakeContext.instances.push(this);
  }
  createGain() {
    return {
      connect() {},
      disconnect() {},
      gain: {
        setTargetAtTime: (v: number) => (this.gainValue = v),
      },
    };
  }
  createAnalyser() {
    return {
      fftSize: 0,
      frequencyBinCount: 0,
      connect() {},
      disconnect() {},
      getByteFrequencyData() {},
    };
  }
  decodeAudioData() {
    return new Promise((resolve, reject) =>
      this.decodes.push({ resolve, reject }),
    );
  }
  async suspend() {
    this.state = 'suspended';
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
}

const chunk = () => new Uint8Array([1, 2, 3]);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('WebAvatarAudioPlayer', () => {
  beforeEach(() => {
    FakeContext.instances = [];
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal(
      'AudioBufferSourceNode',
      function (ctx: FakeContext, opts: any) {
        return new FakeSource(ctx, opts);
      },
    );
    vi.stubGlobal('requestAnimationFrame', () => 0);
  });
  afterEach(() => vi.unstubAllGlobals());

  const decoded = async (ctx: FakeContext, i = ctx.decodes.length - 1) => {
    await flush();
    ctx.decodes[i].resolve({ duration: 1 });
    await flush();
  };

  it('plays every chunk on one context', async () => {
    const player = new WebAvatarAudioPlayer();
    const p1 = player.play(chunk(), 'c1');
    await decoded(FakeContext.instances[0]);
    await p1;
    FakeContext.instances[0].sources[0].end();
    const p2 = player.play(chunk(), 'c2');
    await decoded(FakeContext.instances[0]);
    await p2;
    expect(FakeContext.instances).toHaveLength(1);
    expect(FakeContext.instances[0].sources.map((s) => s.started)).toEqual([
      true,
      true,
    ]);
  });

  it('a stop while decoding keeps the chunk from starting', async () => {
    const player = new WebAvatarAudioPlayer();
    const p = player.play(chunk(), 'c1');
    await flush();
    await player.stop();
    await decoded(FakeContext.instances[0]);
    await p;
    expect(FakeContext.instances[0].sources).toHaveLength(0);
    expect(player.isStopped()).toBe(true);
  });

  it('paused counts as busy; resume continues the same chunk', async () => {
    const player = new WebAvatarAudioPlayer();
    const p = player.play(chunk(), 'c1');
    await decoded(FakeContext.instances[0]);
    await p;
    await player.pause();
    expect(player.isBusy()).toBe(true);
    expect(FakeContext.instances[0].state).toBe('suspended');
    await player.resume();
    expect(player.isPlaying()).toBe(true);
    expect(FakeContext.instances[0].sources[0].stopped).toBe(false);
  });

  it('a stop resumes a paused context and restores the volume', async () => {
    const player = new WebAvatarAudioPlayer();
    const p = player.play(chunk(), 'c1');
    await decoded(FakeContext.instances[0]);
    await p;
    player.duck(0.2);
    await player.pause();
    await player.stop();
    const ctx = FakeContext.instances[0];
    expect(ctx.state).toBe('running');
    expect(ctx.gainValue).toBe(1);
  });

  it('a chunk that cannot be decoded is skipped as completed', async () => {
    const player = new WebAvatarAudioPlayer();
    const statuses: string[] = [];
    player.on('status', (s) => statuses.push(s.playback));
    const p = player.play(chunk(), 'c1');
    await flush();
    FakeContext.instances[0].decodes[0].reject(new Error('bad mp3'));
    await p;
    expect(statuses).toContain('completed');
    expect(player.isStopped()).toBe(true);
  });
});
