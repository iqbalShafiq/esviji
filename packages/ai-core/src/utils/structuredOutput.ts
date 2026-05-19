import { z } from "zod";
import { LlmProvider } from "../providers/LlmProvider.js";
import { repairJson } from "./jsonRepair.js";

export async function generateStructuredOutput<T>(
  provider: LlmProvider,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T, any, any>,
  options?: { maxRetries?: number; onToken?: (token: string) => void }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 1;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const parsed = await provider.generateJson(systemPrompt, userPrompt, schema, {
        onToken: options?.onToken,
      });
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        // Optionally, we could augment the prompt with error info on retries
        continue;
      }
    }
  }

  throw new Error(
    `Failed to generate structured output after ${maxRetries + 1} attempt(s): ${lastError?.message}`
  );
}
