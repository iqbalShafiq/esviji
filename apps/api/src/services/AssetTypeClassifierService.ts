import { LlmProvider, generateStructuredOutput, buildAssetTypeClassifierPrompt } from '@svg-builder/ai-core';
import { AssetTypeClassificationSchema, type AssetTypeClassification } from '@svg-builder/shared';

export class AssetTypeClassifierService {
  constructor(private llmProvider: LlmProvider) {}

  async classify(
    prompt: string,
    options?: {
      explicitAssetType?: string;
      quantity?: number;
      width?: number;
      height?: number;
      useCase?: string;
      hasReference?: boolean;
      onToken?: (token: string) => void;
      onReasoning?: (token: string) => void;
      onRetry?: (attempt: number, maxRetries: number, error: Error) => void;
    }
  ): Promise<AssetTypeClassification> {
    const { system, user } = buildAssetTypeClassifierPrompt({
      prompt,
      explicitAssetType: options?.explicitAssetType,
      quantity: options?.quantity ?? 1,
      width: options?.width ?? 512,
      height: options?.height ?? 512,
      useCase: options?.useCase,
      hasReference: options?.hasReference ?? false,
    });

    const classification = await generateStructuredOutput<AssetTypeClassification>(
      this.llmProvider,
      system,
      user,
      AssetTypeClassificationSchema,
      { maxRetries: 3, onToken: options?.onToken, onReasoning: options?.onReasoning, onRetry: options?.onRetry }
    );

    return classification;
  }
}
