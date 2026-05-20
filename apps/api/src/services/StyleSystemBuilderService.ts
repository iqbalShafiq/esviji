import { LlmProvider, generateStructuredOutput, buildStyleSystemPrompt } from '@svg-builder/ai-core';
import { StyleSystemSchema, type StyleSystem, type AssetTypeClassification, type CreativeBrief } from '@svg-builder/shared';

export class StyleSystemBuilderService {
  constructor(private llmProvider: LlmProvider) {}

  async build(
    brief: CreativeBrief,
    classification: AssetTypeClassification,
    packPlan?: unknown,
    options?: { onToken?: (token: string) => void; onReasoning?: (token: string) => void; onRetry?: (attempt: number, maxRetries: number, error: Error) => void }
  ): Promise<StyleSystem> {
    const { system, user } = buildStyleSystemPrompt({
      brief,
      classification,
      packPlan,
    });

    const styleSystem = await generateStructuredOutput(
      this.llmProvider,
      system,
      user,
      StyleSystemSchema,
      { maxRetries: 3, onToken: options?.onToken, onReasoning: options?.onReasoning, onRetry: options?.onRetry }
    );

    return styleSystem;
  }
}
