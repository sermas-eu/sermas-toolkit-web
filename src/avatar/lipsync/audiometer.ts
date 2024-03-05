export class AudioMeter {
  public processor: ScriptProcessorNode;
  public volume: number;

  private clipLevel: number;
  private lastClip: number;
  private averaging: number;
  private clipLag: number;
  private clipping: boolean;

  constructor(audioContext: AudioContext) {
    this.processor = audioContext.createScriptProcessor(512);

    this.clipping = false;
    this.lastClip = 0;
    this.clipLevel = 0.98;
    this.volume = 0;
    this.averaging = 0.95;
    this.clipLag = 750;

    this.processor.onaudioprocess = (event) => {
      const buf = event.inputBuffer.getChannelData(0);
      const bufLength = buf.length;
      let sum = 0;
      let x;

      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < bufLength; i++) {
        x = buf[i];
        if (Math.abs(x) >= this.clipLevel) {
          this.clipping = true;
          this.lastClip = window.performance.now();
        }
        sum += x * x;
      }
      const rms = Math.sqrt(sum / bufLength);
      this.volume = Math.max(rms, this.volume * this.averaging);
    };

    this.processor.connect(audioContext.destination);
  }

  checkClipping() {
    if (!this.clipping) {
      return false;
    }
    if (this.lastClip + this.clipLag < window.performance.now()) {
      this.clipping = false;
    }
    return this.clipping;
  }

  shutdown() {
    this.processor.disconnect();
    this.processor.onaudioprocess = null;
  }
}
