import { SpeechProbabilities } from '@ricky0123/vad-web/dist/models';
import { Logger } from '../../logger.js';

export class SpeechStreamer {
  private readonly PRE_BUFFER_SIZE = 10;
  private readonly START_PROB_THRESHOLD = 0.5;
  private readonly STOP_PROB_THRESHOLD = 0.3;
  private readonly SILENCE_FRAMES_TO_STOP = 5;

  private readonly logger = new Logger('speech-streamer');

  private streaming = false;
  private silenceCounter = 0;

  private frameBuffer: Float32Array[] = [];

  /**
   * Call this per frame. Returns frames to stream.
   * - On start: returns buffered + current.
   * - While streaming: returns current.
   * - Not streaming: returns [].
   */
  public onFrame(
    probs: SpeechProbabilities,
    frame: Float32Array,
  ): Float32Array[] {
    // Buffer every frame in case we start streaming soon
    this.frameBuffer.push(frame);
    if (this.frameBuffer.length > this.PRE_BUFFER_SIZE) {
      this.frameBuffer.shift();
    }

    const isSpeechLikely = probs.isSpeech > this.START_PROB_THRESHOLD;
    const isSilent = probs.isSpeech < this.STOP_PROB_THRESHOLD;

    if (!this.streaming) {
      if (isSpeechLikely) {
        this.streaming = true;
        this.silenceCounter = 0;
        this.logger.debug('Streaming started');
        // Flush buffered frames plus current
        return [...this.frameBuffer];
      }
    } else {
      // If streaming, continue sending frames
      if (isSilent) {
        this.silenceCounter++;
        if (this.silenceCounter >= this.SILENCE_FRAMES_TO_STOP) {
          this.streaming = false;
          this.logger.debug('Streaming stopped');
          this.frameBuffer = [];
          return [];
        }
      } else {
        this.silenceCounter = 0;
      }

      // Return current frame only
      return [frame];
    }

    // Not streaming and no trigger yet
    return [];
  }

  public isStreaming(): boolean {
    return this.streaming;
  }
}
