import { ChatOpenAI } from '@langchain/openai';

export interface LangChainModelConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export function createLangChainChatModel(
  config: LangChainModelConfig,
  options?: { temperature?: number; maxRetries?: number }
): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    temperature: options?.temperature ?? 0.2,
    maxRetries: options?.maxRetries ?? 0,
    reasoning: { effort: 'medium' },
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
  });
}
