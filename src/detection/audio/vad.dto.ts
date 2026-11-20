/** Per-frame output of the Silero VAD model (@ricky0123/vad-web). */
export interface SpeechProbabilities {
  /** probability of speech, 0 to 1 */
  isSpeech: number;
  /** probability of no speech, 0 to 1 */
  notSpeech: number;
}
