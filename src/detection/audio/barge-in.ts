/**
 * Guarded barge-in: while the avatar is audible its own voice (echo) and room noise
 * reach the microphone. A VAD segment that overlaps the avatar counts as the visitor
 * talking over it only after sustained, high-confidence speech; anything less is
 * discarded on the client.
 */
export type BargeInOptions = {
  /** sustained speech needed to count as a barge-in */
  minSpeechMs: number;
  /** speech probability a frame needs to count towards it */
  minProbability: number;
  /** a frame below this probability restarts the count */
  resetProbability: number;
  /** the avatar counts as audible for this long after it stops (room echo) */
  tailMs: number;
};

export const defaultBargeInOptions: BargeInOptions = {
  minSpeechMs: 700,
  minProbability: 0.8,
  resetProbability: 0.35,
  tailMs: 500,
};

export type SegmentVerdict =
  /** no overlap with the avatar: an ordinary turn */
  | 'turn'
  /** overlapped the avatar and reached the bar */
  | 'barge-in'
  /** overlapped the avatar and did not reach the bar: echo or noise */
  | 'discard';

export class BargeInTracker {
  private agentSpeaking = false;
  private agentStoppedAt = -Infinity;

  private inSegment = false;
  private overlapsAgent = false;
  private sustainedMs = 0;
  private bargedIn = false;

  constructor(
    private readonly options: BargeInOptions = defaultBargeInOptions,
    private readonly now: () => number = () => Date.now(),
  ) {}

  setAgentSpeaking(speaking: boolean) {
    if (this.agentSpeaking && !speaking) this.agentStoppedAt = this.now();
    this.agentSpeaking = speaking;
  }

  isAgentAudible() {
    return (
      this.agentSpeaking ||
      this.now() - this.agentStoppedAt < this.options.tailMs
    );
  }

  startSegment() {
    this.inSegment = true;
    this.overlapsAgent = this.isAgentAudible();
    this.sustainedMs = 0;
    this.bargedIn = false;
  }

  /**
   * One VAD frame inside a segment. Returns true once, on the frame that makes the
   * segment a barge-in.
   */
  onFrame(probability: number, frameMs: number): boolean {
    if (!this.inSegment) return false;
    if (this.isAgentAudible()) this.overlapsAgent = true;

    if (probability >= this.options.minProbability) {
      this.sustainedMs += frameMs;
    } else if (probability < this.options.resetProbability) {
      this.sustainedMs = 0;
    }

    if (
      this.overlapsAgent &&
      !this.bargedIn &&
      this.sustainedMs >= this.options.minSpeechMs
    ) {
      this.bargedIn = true;
      return true;
    }
    return false;
  }

  /** inside a segment that overlaps the avatar and is not (yet) a barge-in */
  isGuarding() {
    return this.inSegment && this.overlapsAgent && !this.bargedIn;
  }

  /** the segment ended (or misfired): what to do with its audio */
  endSegment(): SegmentVerdict {
    const verdict: SegmentVerdict = !this.overlapsAgent
      ? 'turn'
      : this.bargedIn
        ? 'barge-in'
        : 'discard';
    this.inSegment = false;
    this.overlapsAgent = false;
    this.sustainedMs = 0;
    this.bargedIn = false;
    return verdict;
  }
}
