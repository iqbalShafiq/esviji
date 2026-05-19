import { z } from "zod";

export abstract class LlmProvider {
  abstract generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: "json_object";
      onToken?: (token: string) => void;
    }
  ): Promise<string>;

  async generateJson<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodSchema<T>,
    options?: { temperature?: number; maxTokens?: number; onToken?: (token: string) => void }
  ): Promise<T> {
    const text = await this.generateText(systemPrompt, userPrompt, { ...options, responseFormat: "json_object" });
    const parsed = JSON.parse(text);
    return schema.parse(parsed);
  }
}
