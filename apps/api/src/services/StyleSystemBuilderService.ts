import { LlmProvider, generateStructuredOutput, buildStyleSystemPrompt } from '@svg-builder/ai-core';
import { StyleSystemSchema, type StyleSystem, type AssetTypeClassification, type CreativeBrief } from '@svg-builder/shared';

export class StyleSystemBuilderService {
  constructor(private llmProvider: LlmProvider) {}

  async build(
    brief: CreativeBrief,
    classification: AssetTypeClassification,
    packPlan?: unknown,
    options?: { onToken?: (token: string) => void }
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
      { maxRetries: 2, onToken: options?.onToken }
    );

    return styleSystem;
  }
}
