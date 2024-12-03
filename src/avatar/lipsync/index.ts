import EventEmitter2 from 'eventemitter2';
import { Logger } from '../../logger.js';
import { VisemeType } from '../animations/blendshapes/lib/viseme/index.js';
import { neutral } from './lipsync.dto.js';

const logger = new Logger('webavatar.lipsync');

export class LipSync extends EventEmitter2 {
  private audioEnabled = true;
  public paused = true;
  private stopped = false;

  private lastVowelIndex: number = 0;
  private lastDelta: number = 0;

  private vowels: VisemeType[] = ['neutral', 'a', 'e', 'i', 'o', 'u'];

  private audioContext?: AudioContext;
  private source?: AudioBufferSourceNode;
  private analyzer?: AnalyserNode;

  constructor() {
    super();

    const update = (deltaTime = 0) => {
      this.updateExpression(deltaTime);
      if (!this.stopped) requestAnimationFrame(update);
    };

    update();
  }

  toggleAudio(enabled?: boolean) {
    this.audioEnabled = enabled === undefined ? !this.audioEnabled : enabled;
    logger.log(`Set audio enabled=${this.audioEnabled}`);
  }

  async stopAudio() {
    this.source?.stop();
    if (this.source?.onended) this.source?.onended({} as Event);
  }

  async startFromAudioFile(raw: Uint8Array, chunkId: string) {
    if (!this.audioEnabled) return;

    const rawBuffer: ArrayBuffer = raw.buffer.slice(
      raw.byteOffset,
      raw.byteLength + raw.byteOffset,
    );

    if (this.audioContext) await this.destroy();

    this.audioContext = new AudioContext();
    const buffer = await this.audioContext.decodeAudioData(rawBuffer);

    this.source = new AudioBufferSourceNode(this.audioContext, {
      buffer,
      loop: false,
    });

    this.analyzer = this.audioContext.createAnalyser();
    this.analyzer.fftSize = 1024;
    this.source.connect(this.analyzer);

    this.source.connect(this.audioContext.destination);

    this.source.onended = () => {
      this.paused = true;
      this.emit('viseme', neutral);
      this.emit('end');
    };

    this.source.start();

    this.paused = false;

    this.emit('start', chunkId);
  }

  async destroy() {
    if (this.source) {
      this.source.disconnect();
      this.source.stop();
      this.source.onended = () => {};
      this.source = undefined;
    }

    if (this.analyzer) {
      this.analyzer.disconnect();
      this.analyzer = undefined;
    }

    if (this.audioContext) {
      try {
        await this.audioContext?.close();
        this.audioContext = undefined;
      } catch {}
    }
  }

  getVolume() {
    if (!this.analyzer) return 0;

    //get the buffer length from the analyser
    const bufferLength = this.analyzer.frequencyBinCount;
    if (!bufferLength) return 0;

    //create a uint8 array
    const dataArray = new Uint8Array(bufferLength);
    //call this to get the current frequency  and put it     into dataArray
    this.analyzer?.getByteFrequencyData(dataArray);

    const volume =
      dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;

    return volume;
  }

  updateExpression(deltaTime: number) {
    const volume = this.getVolume();

    if (volume < 10) {
      this.lastVowelIndex = 0;
      this.lastDelta = deltaTime;
      this.emit('viseme', neutral);
      return;
    }

    if (deltaTime - this.lastDelta < 70) {
      return;
    }

    let index = this.lastVowelIndex + 1;
    if (index === this.vowels.length) {
      index = 0;
    }

    this.lastDelta = deltaTime;
    this.lastVowelIndex = index;

    // console.log(this.lastViseme.viseme, this.lastViseme.count, diffTime)
    this.emit('viseme', { key: this.vowels[this.lastVowelIndex], value: 1 });
  }

  // getBinIndex(minFreq: number, maxFreq: number) {
  //   const binWidth = this.samplingFrequency / (this.FFT_SIZE / 2);
  //   const minFreqIndex = Math.floor(minFreq / binWidth);
  //   const maxFreqIndex = Math.floor(maxFreq / binWidth);
  //   return { minFreqIndex, maxFreqIndex };
  // }

  // process() {
  //   if (!this.userSpeechAnalyzer) return;
  //   this.userSpeechAnalyzer?.getByteFrequencyData(this.dataArray);
  //   for (const vowel in this.calibratedVowels) {
  //     const [minFreq, maxFreq] = this.calibratedVowels[vowel];
  //     const { minFreqIndex, maxFreqIndex } = this.getBinIndex(minFreq, maxFreq);
  //     console.log(vowel, minFreqIndex, maxFreqIndex)
  //     const vowelIntensity = this.dataArray
  //       .slice(minFreqIndex, maxFreqIndex + 1)
  //       .reduce((sum, value) => sum + value, 0);

  //     console.log(vowel, this.dataArray.slice(minFreqIndex, maxFreqIndex + 1))

  //     this.detectedVowels[vowel] = vowelIntensity;
  //   }
  //   return { ...this.detectedVowels };
  // }
}
