import { AvatarModel } from 'avatar/webavatar.js';
import { VisemeType } from '../animations/blendshapes/lib/viseme/index.js';

export class LipSync {
  private lastVowelIndex: number = 0;

  private lastDelta: number = 0;

  private vowels: VisemeType[] = ['neutral', 'a', 'e', 'i', 'o', 'u'];

  constructor(private readonly avatar: AvatarModel) {}

  reset() {
    this.setNeutral();
  }

  setViseme(viseme: VisemeType) {
    this.avatar.getBlendShapes()?.setViseme(viseme);
  }

  setNeutral() {
    this.setViseme('neutral');
  }

  updateViseme(volume: number) {
    const deltaTime = performance.now();

    if (volume < 10) {
      this.lastVowelIndex = 0;
      this.lastDelta = deltaTime;
      this.setNeutral();
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

    this.setViseme(this.vowels[this.lastVowelIndex]);
  }
}
