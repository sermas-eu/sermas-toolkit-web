export type SupportedLLM = Record<string, string>;

export const supportedLLM: SupportedLLM = {
  chatgpt: 'ChatGPT (Assistant base)',
  'chatgpt-rag': 'ChatGPT (RAG)',
  'tuda-flan': 'SERMAS (flan5)',
  // 'tuda-gpt-2': "tuda-gpt-2",
};
