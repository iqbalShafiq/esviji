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

type ChatMessageInput = { role: "system" | "user"; content: string };

type ChatCallOptions = {
  response_format?:
    | { type: "json_object" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          strict: true;
          schema: Record<string, unknown>;
        };
      };
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

  async generateStructured<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    options?: GenerateTextOptions & { name?: string }
  ): Promise<T> {
    const model = this.createModel(options);
    const schemaName = options?.name ?? "structured_response";
    const jsonSchema = createOpenAiStrictJsonSchema(schema);
    const messages: ChatMessageInput[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    if (options?.onToken || options?.onReasoning) {
      return this.streamStructured(model, messages, schema, schemaName, jsonSchema, options);
    }

    const structuredModel = model.withStructuredOutput(jsonSchema, {
      name: schemaName,
      method: "jsonSchema",
      strict: true,
      includeRaw: true,
    });

    const response = await structuredModel.invoke(messages);
    return schema.parse(pruneNulls(response.parsed));
  }

  private async streamStructured<T>(
    model: ChatOpenAI,
    messages: ChatMessageInput[],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    schemaName: string,
    jsonSchema: Record<string, unknown>,
    options: GenerateTextOptions
  ): Promise<T> {
    const abortController = new AbortController();
    const stream = await withTimeout(
      model.stream(messages, {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            strict: true,
            schema: jsonSchema,
          },
        },
        signal: abortController.signal,
      }),
      STREAM_START_TIMEOUT_MS,
      () => abortController.abort()
    );

    let full = "";
    for await (const chunk of stream) {
      const normalized = chunk as ChatMessageChunk;
      const reasoning = extractReasoning(normalized);
      const text = extractText(normalized);

      if (reasoning) {
        options.onReasoning?.(reasoning);
      }

      if (text) {
        full += text;
        options.onToken?.(text);
      }
    }

    return schema.parse(pruneNulls(JSON.parse(repairJson(full))));
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
      if (Array.isArray(block.summary)) {
        return block.summary
          .map((entry) => {
            if (!entry || typeof entry !== "object") return "";
            const text = (entry as { text?: unknown }).text;
            return typeof text === "string" ? text : "";
          })
          .join("");
      }
      return "";
    })
    .join("");
}

function createOpenAiStrictJsonSchema(schema: z.ZodType<unknown, z.ZodTypeDef, unknown>): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, { name: "structured_response", $refStrategy: "none" });
  const cleanSchema = jsonSchema.definitions?.structured_response ?? jsonSchema;
  return normalizeStrictJsonSchema(cleanSchema as Record<string, unknown>) as Record<string, unknown>;
}

function normalizeStrictJsonSchema(value: unknown, forceNullable = false): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const schema = { ...(value as Record<string, unknown>) };
  if (schema.type === "object") {
    const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? schema.properties as Record<string, unknown>
      : {};
    const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
    const normalizedProperties: Record<string, unknown> = {};

    for (const [key, propertySchema] of Object.entries(properties)) {
      normalizedProperties[key] = normalizeStrictJsonSchema(propertySchema, !required.has(key));
    }

    schema.properties = normalizedProperties;
    schema.required = Object.keys(properties);
    schema.additionalProperties = false;
  }

  if (schema.type === "array" && schema.items) {
    schema.items = normalizeStrictJsonSchema(schema.items);
  }

  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    if (Array.isArray(schema[key])) {
      schema[key] = (schema[key] as unknown[]).map((entry) => normalizeStrictJsonSchema(entry));
    }
  }

  if (forceNullable) {
    return makeNullable(schema);
  }

  return schema;
}

function makeNullable(schema: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(schema.type)) {
    return schema.type.includes("null") ? schema : { ...schema, type: [...schema.type, "null"] };
  }

  if (typeof schema.type === "string") {
    return schema.type === "null" ? schema : { ...schema, type: [schema.type, "null"] };
  }

  if (Array.isArray(schema.anyOf)) {
    const hasNull = schema.anyOf.some((entry) => isNullSchema(entry));
    return hasNull ? schema : { ...schema, anyOf: [...schema.anyOf, { type: "null" }] };
  }

  return { anyOf: [schema, { type: "null" }] };
}

function isNullSchema(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as { type?: unknown }).type === "null");
}

function pruneNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => pruneNulls(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== null) {
      output[key] = pruneNulls(entry);
    }
  }
  return output;
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
