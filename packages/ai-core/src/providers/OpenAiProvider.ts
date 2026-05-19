import OpenAI from "openai";
import { LlmProvider } from "./LlmProvider.js";

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
      onToken?: (token: string) => void;
    }
  ): Promise<string> {
    if (options?.onToken) {
      try {
        const stream = await this.client.chat.completions.create({
          model: this.defaultModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens,
          ...(options?.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
          stream: true,
        });

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

    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      ...(options?.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
    });

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
}
