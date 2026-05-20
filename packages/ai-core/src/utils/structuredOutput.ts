import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LlmProvider } from "../providers/LlmProvider.js";
import { repairJson } from "./jsonRepair.js";

const DEFAULT_MAX_RETRIES = 3;

export function zodSchemaToPrompt(schema: z.ZodType<any, any, any>): string {
  const jsonSchema = zodToJsonSchema(schema, { name: "response", $refStrategy: "none" });
  const cleanSchema = jsonSchema.definitions?.response ?? jsonSchema;
  return JSON.stringify(cleanSchema, null, 2);
}

function buildRetryPrompt(userPrompt: string, errors: Error[]): string {
  if (errors.length === 0) {
    return userPrompt;
  }

  const retryContext = errors
    .map((error, index) => `Attempt ${index + 1} failed: ${error.message}`)
    .join("\n");

  return `${userPrompt}

Previous generation errors:
${retryContext}

Retry instructions:
- Do not repeat the mistakes listed above.
- Return output that satisfies the requested JSON schema exactly.
- Return JSON only, with no markdown fences or explanatory text.`;
}

export async function generateStructuredOutput<T>(
  provider: LlmProvider,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T, any, any>,
  options?: {
    maxRetries?: number;
    onToken?: (token: string) => void;
    onReasoning?: (token: string) => void;
    onRetry?: (attempt: number, maxRetries: number, error: Error) => void;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError: Error | undefined;
  const errors: Error[] = [];

  // Convert Zod schema to JSON Schema for prompt enrichment
  const jsonSchema = zodToJsonSchema(schema, { name: "response", $refStrategy: "none" });
  const cleanSchema = jsonSchema.definitions?.response ?? jsonSchema;
  
  // Add schema to prompt so LLM knows exact structure expected
  const enhancedSystemPrompt = `${systemPrompt}

You must return a JSON object that strictly follows this schema:
${JSON.stringify(cleanSchema, null, 2)}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const text = await provider.generateText(
        enhancedSystemPrompt,
        buildRetryPrompt(userPrompt, errors),
        {
          responseFormat: "json_object",
          reasoningEffort: "medium",
          onToken: options?.onToken,
          onReasoning: options?.onReasoning,
        }
      );
      const parsedJson = JSON.parse(repairJson(text));
      const parsed = schema.parse(parsedJson);
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      errors.push(lastError);
      if (attempt < maxRetries) {
        options?.onRetry?.(attempt + 1, maxRetries, lastError);
      }
    }
  }

  throw new Error(
    `Failed to generate structured output after ${maxRetries + 1} attempt(s): ${lastError?.message}`
  );
}
