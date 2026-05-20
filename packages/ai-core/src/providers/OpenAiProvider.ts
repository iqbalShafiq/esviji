import OpenAI from "openai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LlmProvider, type GenerateTextOptions } from "./LlmProvider.js";

type ReasoningEffort = "low" | "medium" | "high";

interface ResponseTextDeltaEvent {
  type: "response.output_text.delta";
  delta: string;
}

interface ResponseReasoningSummaryTextDeltaEvent {
  type: "response.reasoning_summary_text.delta";
  delta: string;
}

interface ResponseReasoningSummaryPartAddedEvent {
  type: "response.reasoning_summary_part.added";
  part: {
    text?: string;
  };
}

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
    options?: GenerateTextOptions
  ): Promise<string> {
    const reasoningEffort = options?.reasoningEffort ?? "medium";

    // If reasoning streaming is requested, use Responses API (supports reasoning streaming)
    if (options?.onReasoning) {
      try {
        return await this.streamWithResponses(systemPrompt, userPrompt, options, reasoningEffort);
      } catch (error) {
        console.warn("Responses API reasoning streaming failed, falling back:", error);
      }
    }

    // If token streaming is requested (without reasoning), use Chat Completions API
    if (options?.onToken) {
      try {
        return await this.streamWithChatCompletions(systemPrompt, userPrompt, options, reasoningEffort);
      } catch (error) {
        console.warn("Chat Completions streaming failed, falling back:", error);
      }
    }

    // Try non-streaming Responses API (supports json_schema enforcement)
    try {
      const response = await this.createResponses(
        systemPrompt,
        userPrompt,
        options,
        reasoningEffort
      );

      if (response.output_text?.trim().length > 0) {
        return response.output_text;
      }

      // Extract text from output items
      const text = this.extractTextFromResponse(response);
      if (text.length > 0) {
        return text;
      }
    } catch (error) {
      console.warn("Responses API failed, falling back to chat completions:", error);
    }

    // Fallback to non-streaming Chat Completions API
    return this.fallbackToChatCompletions(systemPrompt, userPrompt, options, reasoningEffort);
  }

  private async streamWithResponses(
    systemPrompt: string,
    userPrompt: string,
    options: GenerateTextOptions | undefined,
    reasoningEffort: ReasoningEffort
  ): Promise<string> {
    const stream = await this.createResponsesStream(systemPrompt, userPrompt, options, reasoningEffort);

    let full = "";
    for await (const event of stream) {
      // Handle text output
      if (event.type === "response.output_text.delta") {
        const textEvent = event as unknown as ResponseTextDeltaEvent;
        if (textEvent.delta && options?.onToken) {
          full += textEvent.delta;
          options.onToken(textEvent.delta);
        }
      }
      
      // Handle reasoning summary text
      if (event.type === "response.reasoning_summary_text.delta") {
        const reasoningEvent = event as unknown as ResponseReasoningSummaryTextDeltaEvent;
        if (reasoningEvent.delta && options?.onReasoning) {
          options.onReasoning(reasoningEvent.delta);
        }
      }
      
      // Handle reasoning summary part added
      if (event.type === "response.reasoning_summary_part.added") {
        const partEvent = event as unknown as ResponseReasoningSummaryPartAddedEvent;
        if (partEvent.part?.text && options?.onReasoning) {
          options.onReasoning(partEvent.part.text);
        }
      }
    }

    if (full.trim().length === 0) {
      throw new Error("Responses API streaming returned empty content");
    }

    return full;
  }

  private async streamWithChatCompletions(
    systemPrompt: string,
    userPrompt: string,
    options: GenerateTextOptions | undefined,
    reasoningEffort: ReasoningEffort
  ): Promise<string> {
    const stream = await this.client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      ...(options?.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
      reasoning_effort: reasoningEffort,
      stream: true,
    });

    let full = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        full += content;
        options?.onToken?.(content);
      }
    }

    if (full.trim().length === 0) {
      throw new Error("Chat Completions streaming returned empty content");
    }

    return full;
  }

  private async createResponses(
    systemPrompt: string,
    userPrompt: string,
    options: GenerateTextOptions | undefined,
    reasoningEffort: ReasoningEffort
  ): Promise<OpenAI.Responses.Response> {
    const params = this.buildResponsesParams(systemPrompt, userPrompt, options, reasoningEffort);
    
    try {
      return await this.client.responses.create({ ...params, stream: false });
    } catch (error) {
      if (this.isUnsupportedReasoningEffortError(error)) {
        const paramsWithoutReasoning = { ...params };
        delete (paramsWithoutReasoning as { reasoning?: unknown }).reasoning;
        return await this.client.responses.create({ ...paramsWithoutReasoning, stream: false });
      }
      throw error;
    }
  }

  private async createResponsesStream(
    systemPrompt: string,
    userPrompt: string,
    options: GenerateTextOptions | undefined,
    reasoningEffort: ReasoningEffort
  ): Promise<AsyncIterable<OpenAI.Responses.ResponseStreamEvent>> {
    const params = this.buildResponsesParams(systemPrompt, userPrompt, options, reasoningEffort);
    
    try {
      const stream = await this.client.responses.create({ ...params, stream: true });
      return stream;
    } catch (error) {
      if (this.isUnsupportedReasoningEffortError(error)) {
        const paramsWithoutReasoning = { ...params };
        delete (paramsWithoutReasoning as { reasoning?: unknown }).reasoning;
        const stream = await this.client.responses.create({ ...paramsWithoutReasoning, stream: true });
        return stream;
      }
      throw error;
    }
  }

  private buildResponsesParams(
    systemPrompt: string,
    userPrompt: string,
    options: GenerateTextOptions | undefined,
    reasoningEffort: ReasoningEffort
  ): OpenAI.Responses.ResponseCreateParamsNonStreaming {
    const input: OpenAI.Responses.ResponseInput = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const params: {
      model: string;
      input: OpenAI.Responses.ResponseInput;
      temperature: number;
      max_output_tokens?: number;
      reasoning?: { effort: ReasoningEffort; summary: string };
      text?: { format: unknown };
    } = {
      model: this.defaultModel,
      input,
      temperature: options?.temperature ?? 0.7,
      ...(options?.maxTokens ? { max_output_tokens: options.maxTokens } : {}),
      reasoning: {
        effort: reasoningEffort,
        summary: "auto",
      },
    };

    // Handle response format
    if (options?.jsonSchema) {
      params.text = {
        format: {
          type: "json_schema",
          schema: options.jsonSchema,
          name: "response",
          strict: true,
        },
      };
    } else if (options?.responseFormat === "json_object") {
      params.text = {
        format: {
          type: "json_object",
        },
      };
    }

    return params as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming;
  }

  private extractTextFromResponse(response: OpenAI.Responses.Response): string {
    const texts: string[] = [];
    
    for (const item of response.output) {
      if (item.type === "message") {
        const message = item as OpenAI.Responses.ResponseOutputMessage;
        for (const part of message.content) {
          if (part.type === "output_text") {
            texts.push(part.text);
          }
        }
      }
    }
    
    return texts.join("").trim();
  }

  private async fallbackToChatCompletions(
    systemPrompt: string,
    userPrompt: string,
    options: GenerateTextOptions | undefined,
    reasoningEffort: ReasoningEffort
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      ...(options?.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
      reasoning_effort: reasoningEffort,
    });

    const content = response.choices[0]?.message?.content;
    if (typeof content === "string" && content.trim().length > 0) {
      return content;
    }

    throw new Error(
      `OpenAI returned empty content (model=${this.defaultModel}). ` +
      `Both Responses API and Chat Completions failed.`
    );
  }

  private isUnsupportedReasoningEffortError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /reasoning[_ ]?effort|unsupported parameter|unrecognized request argument|unknown parameter/i.test(message);
  }

  override async generateJson<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T, any, any>,
    options?: Omit<GenerateTextOptions, "jsonSchema">
  ): Promise<T> {
    const jsonSchema = zodToJsonSchema(schema, { name: "response", $refStrategy: "none" });
    // Remove the $schema and name wrapper that zod-to-json-schema adds
    const cleanSchema = jsonSchema.definitions?.response ?? jsonSchema;
    
    const text = await this.generateText(systemPrompt, userPrompt, {
      ...options,
      jsonSchema: cleanSchema as Record<string, unknown>,
    });
    
    const parsed = JSON.parse(text);
    return schema.parse(parsed);
  }
}
