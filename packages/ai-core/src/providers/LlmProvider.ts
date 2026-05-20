import { z } from "zod";

export interface GenerateTextOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object";
  reasoningEffort?: "low" | "medium" | "high";
  onToken?: (token: string) => void;
  onReasoning?: (token: string) => void;
  jsonSchema?: Record<string, unknown>;
}

export abstract class LlmProvider {
  abstract generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: GenerateTextOptions
  ): Promise<string>;

  async generateJson<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodSchema<T>,
    options?: Omit<GenerateTextOptions, "jsonSchema">
  ): Promise<T> {
    const text = await this.generateText(systemPrompt, userPrompt, { ...options, responseFormat: "json_object" });
    const parsed = JSON.parse(text);
    return schema.parse(parsed);
  }
}
