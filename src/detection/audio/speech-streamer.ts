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
  private firstSpeechDetected: boolean = false; // New flag to track initial speech

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

    // Buffer frames in case speech starts soon
    this.frameBuffer.push(frame);
    if (this.frameBuffer.length > this.PRE_BUFFER_SIZE) {
      this.frameBuffer.shift();
    }

    const avg =
      this.sampleHistory.reduce((sum, val) => sum + val, 0) /
      this.sampleHistory.length;

    // Check if speech has been detected early
    if (!this.streaming && !this.firstSpeechDetected) {
      // If speech is detected even with early frames, begin streaming
      if (probs.isSpeech > this.START_THRESHOLD) {
        this.startStreaming();
        // Immediately flush buffered frames
        return this.frameBuffer.concat([frame]);
      }
    } else if (!this.streaming && avg > this.START_THRESHOLD) {
      // Once speech is detected from moving average, start streaming
      this.startStreaming();
      return this.frameBuffer.concat([frame]);
    }

    // If streaming, just send the current frame
    if (this.streaming) {
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

    // No streaming yet, return empty array
    return [];
  }

  private startStreaming(): void {
    this.streaming = true;
    this.firstSpeechDetected = true; // Mark that speech has started
    this.silenceCounter = 0;
    this.logger.debug('streaming started');
  }

  private stopStreaming(): void {
    this.streaming = false;
    this.frameBuffer = []; // Clear buffer to avoid sending stale frames
    this.logger.debug('streaming stopped');
  }

  public isStreaming(): boolean {
    return this.streaming;
  }
}
