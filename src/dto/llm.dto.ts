export type SupportedLLM = Record<string, string>;

export const supportedLLM: SupportedLLM = {
  openai: 'OpenAI (GPT-4)',
  groq: 'Mixtral',
  'tuda-llama2': 'SERMAS (LLama2)',
};
