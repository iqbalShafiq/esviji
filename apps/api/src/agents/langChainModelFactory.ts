import { ChatOpenAI } from '@langchain/openai';

export interface LangChainModelConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export function createLangChainChatModel(
  config: LangChainModelConfig,
  options?: {
    temperature?: number;
    maxRetries?: number;
    useResponsesApi?: boolean;
    reasoningEffort?: 'low' | 'medium' | 'high';
  }
): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    temperature: options?.temperature ?? 0.2,
    maxRetries: options?.maxRetries ?? 0,
    reasoning: options?.useResponsesApi
      ? { effort: options?.reasoningEffort ?? 'medium', summary: 'auto' }
      : { effort: options?.reasoningEffort ?? 'medium' },
    useResponsesApi: options?.useResponsesApi ?? false,
    streamUsage: false,
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
  });
}
