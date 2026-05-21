import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { repairJson } from "../utils/jsonRepair.js";
import { LlmProvider, type GenerateTextOptions } from "./LlmProvider.js";

type ChatMessageContent =
  | string
  | Array<
      | string
      | {
          type?: string;
          text?: string;
          reasoning?: string;
          [key: string]: unknown;
        }
    >;

type ChatMessageChunk = {
  text?: string;
  content?: ChatMessageContent;
  contentBlocks?: Array<Record<string, unknown>>;
};

type ChatInvokeResult = {
  text?: string;
  content?: ChatMessageContent;
  contentBlocks?: Array<Record<string, unknown>>;
};

type ChatCallOptions = {
  response_format?: { type: "json_object" };
  signal?: AbortSignal;
};

const STREAM_START_TIMEOUT_MS = 15_000;

export class OpenAiProvider extends LlmProvider {
  private defaultModel: string;
  private apiKey: string;
  private baseURL?: string;

  constructor(apiKey: string, defaultModel: string = "gpt-4o", baseURL?: string) {
    super();
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.baseURL = baseURL;
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: GenerateTextOptions
  ): Promise<string> {
    const model = this.createModel(options);
    const effectiveSystemPrompt = options?.jsonSchema
      ? `${systemPrompt}

You must return a JSON object that strictly follows this schema:
${JSON.stringify(options.jsonSchema, null, 2)}`
      : systemPrompt;

    if (options?.onToken || options?.onReasoning) {
      return this.streamText(model, effectiveSystemPrompt, userPrompt, options);
    }

    const response = await model.invoke(
      [
        { role: "system", content: effectiveSystemPrompt },
        { role: "user", content: userPrompt },
      ],
      buildCallOptions(options)
    );
    const text = extractText(response as ChatInvokeResult).trim();

    if (text.length > 0) {
      return text;
    }

    throw new Error(`ChatOpenAI returned empty content (model=${this.defaultModel}).`);
  }

  private createModel(options?: GenerateTextOptions): ChatOpenAI {
    return new ChatOpenAI({
      apiKey: this.apiKey,
      model: this.defaultModel,
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens,
      maxRetries: 0,
      reasoning: {
        effort: options?.reasoningEffort ?? "medium",
      },
      useResponsesApi: false,
      streamUsage: false,
      configuration: this.baseURL ? { baseURL: this.baseURL } : undefined,
    });
  }

  private async streamText(
    model: ChatOpenAI,
    systemPrompt: string,
    userPrompt: string,
    options: GenerateTextOptions
  ): Promise<string> {
    const messages: Array<{ role: "system" | "user"; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
    const abortController = new AbortController();
    const stream = await withTimeout(
      model.stream(messages, { ...buildCallOptions(options), signal: abortController.signal }),
      STREAM_START_TIMEOUT_MS,
      () => abortController.abort()
    );
    const iterator = stream[Symbol.asyncIterator]();

    let full = "";
    let streamDone = false;
    while (!streamDone) {
      const result = await iterator.next();
      if (result.done) {
        streamDone = true;
        continue;
      }
      const chunk = result.value;
      const normalized = chunk as ChatMessageChunk;
      const text = extractText(normalized);
      const reasoning = extractReasoning(normalized);

      if (reasoning) {
        options.onReasoning?.(reasoning);
      }

      if (text) {
        full += text;
        options.onToken?.(text);
      }
    }

    if (full.trim().length === 0) {
      const response = await model.invoke(messages, buildCallOptions(options));
      full = extractText(response as ChatInvokeResult).trim();
      if (full.length > 0) {
        options.onToken?.(full);
        return full;
      }

      throw new Error(`ChatOpenAI streaming returned empty content (model=${this.defaultModel}).`);
    }

    return full;
  }

  override async generateJson<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    options?: Omit<GenerateTextOptions, "jsonSchema">
  ): Promise<T> {
    const jsonSchema = zodToJsonSchema(schema, { name: "response", $refStrategy: "none" });
    const cleanSchema = jsonSchema.definitions?.response ?? jsonSchema;

    const text = await this.generateText(systemPrompt, userPrompt, {
      ...options,
      jsonSchema: cleanSchema as Record<string, unknown>,
    });

    return schema.parse(JSON.parse(repairJson(text)));
  }
}

function buildCallOptions(options?: GenerateTextOptions): ChatCallOptions | undefined {
  if (options?.responseFormat !== "json_object") {
    return undefined;
  }

  return { response_format: { type: "json_object" } };
}

function extractText(message: ChatMessageChunk | ChatInvokeResult): string {
  if (typeof message.text === "string" && message.text.length > 0) {
    return message.text;
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          (part.type === "text" || part.type === "output_text" || part.type === "input_text") &&
          typeof part.text === "string"
        ) return part.text;
        return "";
      })
      .join("");
  }

  if (Array.isArray(message.contentBlocks)) {
    return message.contentBlocks
      .map((block) =>
        (block.type === "text" || block.type === "output_text" || block.type === "input_text") &&
        typeof block.text === "string"
          ? block.text
          : ""
      )
      .join("");
  }

  return "";
}

function extractReasoning(message: ChatMessageChunk | ChatInvokeResult): string {
  if (!Array.isArray(message.contentBlocks)) {
    return "";
  }

  return message.contentBlocks
    .map((block) => {
      if (block.type !== "reasoning") return "";
      if (typeof block.reasoning === "string") return block.reasoning;
      if (typeof block.text === "string") return block.text;
      return "";
    })
    .join("");
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout();
          reject(new Error(`ChatOpenAI stream did not emit within ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
