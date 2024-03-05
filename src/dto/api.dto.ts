export interface SendAudioQueryParamsDto
  extends Record<string, string | number | undefined> {
  language?: string;
  gender?: string;
  llm?: string;
}
