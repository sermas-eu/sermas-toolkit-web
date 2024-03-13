// credits to https://github.com/webaverse-studios/CharacterCreator/blob/stable/src/library/lipsync.js

import EventEmitter2 from 'eventemitter2';
import { Logger } from '../../logger.js';
import { VisemeType } from '../animations/blendshapes/lib/viseme/index.js';
import { AudioMeter } from './audiometer.js';
import { neutral } from './lipsync.dto.js';

const logger = new Logger('webavatar.lipsync');

const MAX_VISEME_REPEAT = 30;

interface LastViseme {
  viseme: VisemeType;
  count: number;
  index: number;
}

export class LipSync extends EventEmitter2 {
  private audioEnabled = true;
  public paused = true;
  private stopped = false;

  private FFT_SIZE = 2048;
  // private samplingFrequency = 48000;
  // private dataArray: Uint8Array;

  private lastVowelIndex: number = 0;
  private lastDelta: number = 0;

  private vowels: VisemeType[] = ['neutral', 'a', 'e', 'i', 'o', 'u'];

  private calibratedVowels: {
    a: number[];
    e: number[];
    i: number[];
    o: number[];
    u: number[];
  } = {
    // Frequencies vowels
    a: [726.5625, 960.9375],
    e: [164.0625, 398.4375],
    i: [140.625, 375],
    o: [164.0625, 398.4375],
    u: [140.625, 375],
  };

  private detectedVowels: {
    a: number;
    e: number;
    i: number;
    o: number;
    u: number;
  } = {
    a: 0,
    e: 0,
    i: 0,
    o: 0,
    u: 0,
  };

  private audioContext?: AudioContext;
  private mediaStreamSource?: AudioBufferSourceNode;
  private userSpeechAnalyzer?: AnalyserNode;
  private meter?: AudioMeter;

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

  async startFromAudioFile(raw: Uint8Array) {
    if (!this.audioEnabled) return;

    const rawBuffer: ArrayBuffer = raw.buffer.slice(
      raw.byteOffset,
      raw.byteLength + raw.byteOffset,
    );

    this.audioContext = new AudioContext();
    // this.userSpeechAnalyzer = this.audioContext.createAnalyser();

    // const bufferLength = this.userSpeechAnalyzer.frequencyBinCount;
    // this.dataArray = new Uint8Array(bufferLength);

    // this.userSpeechAnalyzer.smoothingTimeConstant = 0.5;
    // this.userSpeechAnalyzer.fftSize = this.FFT_SIZE;

    if (this.mediaStreamSource) {
      this.mediaStreamSource.onended = () => {};
      this.mediaStreamSource.stop();
      this.mediaStreamSource = undefined;
    }

    const buffer = await this.audioContext.decodeAudioData(rawBuffer);

    this.mediaStreamSource = this.audioContext.createBufferSource();
    this.mediaStreamSource.buffer = buffer;
    this.meter = new AudioMeter(this.audioContext);

    this.mediaStreamSource.connect(this.meter.processor);
    this.mediaStreamSource.connect(this.audioContext.destination);

    // connect the output of mediaStreamSource to the input of userSpeechAnalyzer
    // this.mediaStreamSource.connect(this.userSpeechAnalyzer);

    this.mediaStreamSource.onended = () => {
      this.paused = true;
      this.emit('viseme', neutral);
      this.emit('end');
    };

    this.mediaStreamSource.start();

    this.paused = false;
    this.emit('start');
  }

  async destroy() {
    if (this.meter) {
      this.meter.shutdown();
      this.meter = undefined;
    }

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource.stop();
      this.mediaStreamSource.onended = () => {};
      this.mediaStreamSource = undefined;
    }

    if (this.userSpeechAnalyzer) {
      this.userSpeechAnalyzer.disconnect();
      this.userSpeechAnalyzer = undefined;
    }

    if (this.audioContext) {
      try {
        await this.audioContext?.close();
        this.audioContext = undefined;
      } catch {}
    }
  }

  updateExpression(deltaTime: number) {
    // const res = this.process();
    // if (!res) {
    //   // this.emit('viseme', neutral)
    //   return;
    // }

    // const { a, e, i, o, u } = res;

    // const visemes: LipSyncMapping[] = [
    //   { key: 'a', value: a },
    //   { key: 'e', value: e },
    //   { key: 'i', value: i },
    //   { key: 'o', value: o },
    //   { key: 'u', value: u },
    // ];
    // const sorted = visemes.sort((a, b) => (a.value < b.value ? 1 : -1));
    // const current = sorted[0] && sorted[0].value > 0 ? sorted[0] : neutral;

    // const isSameViseme = current.key === this.lastViseme.viseme;
    // if (isSameViseme) {
    //   this.lastViseme.count++;

    //   if (this.lastViseme.count > MAX_VISEME_REPEAT) {

    //     this.emit('viseme', neutral);
    //     this.lastViseme = {
    //       viseme: neutral.key,
    //       count: 0,
    //     };

    //     return;
    //   }
    // }

    if (!this.meter) return;

    const volume = this.meter.volume;

    if (volume < 0.06) {
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
