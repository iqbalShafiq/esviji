import { LlmProvider, generateStructuredOutput, buildCreativeBriefPrompt } from '@svg-builder/ai-core';
import { CreativeBriefSchema, type CreativeBrief, type AssetTypeClassification } from '@svg-builder/shared';

export class CreativeBriefBuilderService {
  constructor(private llmProvider: LlmProvider) {}

  async build(
    prompt: string,
    classification: AssetTypeClassification,
    options?: {
      style?: string;
      width: number;
      height: number;
      referenceAnalysis?: unknown;
      onToken?: (token: string) => void;
      onReasoning?: (token: string) => void;
      onRetry?: (attempt: number, maxRetries: number, error: Error) => void;
    }
  ): Promise<CreativeBrief> {
    const { system, user } = buildCreativeBriefPrompt({
      prompt,
      classification,
      style: options?.style,
      width: options?.width ?? 512,
      height: options?.height ?? 512,
      referenceAnalysis: options?.referenceAnalysis,
    });

    const brief = await generateStructuredOutput(
      this.llmProvider,
      system,
      user,
      CreativeBriefSchema,
      { maxRetries: 3, onToken: options?.onToken, onReasoning: options?.onReasoning, onRetry: options?.onRetry }
    );

    return brief;
  }
}
