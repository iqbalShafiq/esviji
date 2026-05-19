import OpenAI from "openai";
import { LlmProvider } from "./LlmProvider.js";

type ReasoningEffort = "low" | "medium" | "high";

export class OpenAiProvider extends LlmProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "gpt-4o", baseURL?: string) {
    super();
    this.client = new OpenAI({ apiKey, baseURL });
    this.defaultModel = defaultModel;
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: "json_object";
      reasoningEffort?: ReasoningEffort;
      onToken?: (token: string) => void;
    }
  ): Promise<string> {
    const reasoningEffort = options?.reasoningEffort ?? "medium";

    if (options?.onToken) {
      try {
        const stream = await this.createChatCompletionStream(
          systemPrompt,
          userPrompt,
          options,
          reasoningEffort,
          true
        );

        let full = "";
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            full += delta;
            options.onToken(delta);
          }
        }

        if (full.trim().length > 0) {
          return full;
        }
      } catch {
        // Some providers/models (especially via OpenRouter) may not support
        // streaming with response_format or specific chat-completions options.
        // Fall back to non-streaming request below.
      }
    }

    const response = await this.createChatCompletion(
      systemPrompt,
      userPrompt,
      options,
      reasoningEffort,
      true
    );

    const choice = response.choices[0];
    const message = choice?.message as
      | { content?: string | Array<{ type?: string; text?: string }>; refusal?: string | null }
      | undefined;

    const refusal = message?.refusal;
    if (typeof refusal === "string" && refusal.trim().length > 0) {
      throw new Error(`Model refusal: ${refusal}`);
    }

    const rawContent = message?.content;
    if (typeof rawContent === "string" && rawContent.trim().length > 0) {
      return rawContent;
    }

    if (Array.isArray(rawContent)) {
      const merged = rawContent
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
        .trim();
      if (merged.length > 0) {
        return merged;
      }
    }

    const finishReason = choice?.finish_reason ?? "unknown";
    throw new Error(
      `OpenAI returned empty content (model=${this.defaultModel}, finish_reason=${finishReason}). ` +
      `The selected model may be incompatible with chat completions for this prompt.`
    );
  }

  private async createChatCompletion(
    systemPrompt: string,
    userPrompt: string,
    options: Parameters<OpenAiProvider["generateText"]>[2],
    reasoningEffort: ReasoningEffort,
    includeReasoningEffort: boolean
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    try {
      return await this.client.chat.completions.create({
        ...this.createChatCompletionParams(systemPrompt, userPrompt, options, reasoningEffort, includeReasoningEffort),
        stream: false,
      });
    } catch (error) {
      if (includeReasoningEffort && this.isUnsupportedReasoningEffortError(error)) {
        return this.createChatCompletion(systemPrompt, userPrompt, options, reasoningEffort, false);
      }
      throw error;
    }
  }

  private async createChatCompletionStream(
    systemPrompt: string,
    userPrompt: string,
    options: Parameters<OpenAiProvider["generateText"]>[2],
    reasoningEffort: ReasoningEffort,
    includeReasoningEffort: boolean
  ): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    try {
      return await this.client.chat.completions.create({
        ...this.createChatCompletionParams(systemPrompt, userPrompt, options, reasoningEffort, includeReasoningEffort),
        stream: true,
      });
    } catch (error) {
      if (includeReasoningEffort && this.isUnsupportedReasoningEffortError(error)) {
        return this.createChatCompletionStream(systemPrompt, userPrompt, options, reasoningEffort, false);
      }
      throw error;
    }
  }

  private createChatCompletionParams(
    systemPrompt: string,
    userPrompt: string,
    options: Parameters<OpenAiProvider["generateText"]>[2],
    reasoningEffort: ReasoningEffort,
    includeReasoningEffort: boolean
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    return {
      model: this.defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      ...(options?.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
      ...(includeReasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
  }

  private isUnsupportedReasoningEffortError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /reasoning[_ ]?effort|unsupported parameter|unrecognized request argument|unknown parameter/i.test(message);
  }
}
