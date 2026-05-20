import { z } from "zod";
import { LlmProvider } from "../providers/LlmProvider.js";
import { repairJson } from "./jsonRepair.js";

const DEFAULT_MAX_RETRIES = 3;

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
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
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

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const text = await provider.generateText(systemPrompt, buildRetryPrompt(userPrompt, errors), {
        responseFormat: "json_object",
        reasoningEffort: "medium",
        onToken: options?.onToken,
        onReasoning: options?.onReasoning,
      });
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
