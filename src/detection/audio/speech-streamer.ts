import { SpeechProbabilities } from '@ricky0123/vad-web/dist/models';
import { Logger } from '../../logger.js';

export class SpeechStreamer {
  private readonly SAMPLE_HISTORY_SIZE = 10;
  private readonly PRE_BUFFER_SIZE = 5;
  private readonly START_THRESHOLD = 0.5;
  private readonly STOP_THRESHOLD = 0.3;
  private readonly SILENCE_FRAMES_TO_STOP = 5;

  private readonly logger = new Logger('speech-streamer');

  private sampleHistory: number[] = [];
  private silenceCounter: number = 0;
  private streaming: boolean = false;

  private frameBuffer: Float32Array[] = [];

  /**
   * Returns the list of frames to stream.
   * - If streaming is ongoing: returns [current frame].
   * - If streaming just started: returns buffered + current frame.
   * - If not streaming: returns [].
   */
  public onFrame(
    probs: SpeechProbabilities,
    frame: Float32Array,
  ): Float32Array[] {
    const weightedSample =
      probs.isSpeech > 0 ? probs.isSpeech : -probs.notSpeech;
    this.sampleHistory.push(weightedSample);

    if (this.sampleHistory.length > this.SAMPLE_HISTORY_SIZE) {
      this.sampleHistory.splice(
        0,
        this.sampleHistory.length - this.SAMPLE_HISTORY_SIZE,
      );
    }

    // Always keep a short buffer of frames just in case we start streaming
    this.frameBuffer.push(frame);
    if (this.frameBuffer.length > this.PRE_BUFFER_SIZE) {
      this.frameBuffer.shift();
    }

    const avg =
      this.sampleHistory.reduce((sum, val) => sum + val, 0) /
      this.sampleHistory.length;

    if (!this.streaming) {
      if (avg > this.START_THRESHOLD) {
        this.startStreaming();
        // Return buffered frames + current
        return [...this.frameBuffer];
      }
    } else {
      if (avg < this.STOP_THRESHOLD) {
        this.silenceCounter++;
        if (this.silenceCounter >= this.SILENCE_FRAMES_TO_STOP) {
          this.stopStreaming();
        }
      } else {
        this.silenceCounter = 0;
      }
      return [frame];
    }

    // Not streaming yet, return nothing
    return [];
  }

  private startStreaming(): void {
    this.streaming = true;
    this.silenceCounter = 0;
    this.logger.debug('streaming started');
  }

  private stopStreaming(): void {
    this.streaming = false;
    this.frameBuffer = []; // Clear buffer to avoid stale frames
    this.logger.debug('streaming stopped');
  }

  public isStreaming(): boolean {
    return this.streaming;
  }
}
