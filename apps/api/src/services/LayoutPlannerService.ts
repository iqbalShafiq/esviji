import { LlmProvider, generateStructuredOutput, buildLayoutPlannerPrompt } from '@svg-builder/ai-core';
import { LayoutBlueprintSchema, type LayoutBlueprint, type CreativeBrief, type StyleSystem, type AssetTypeClassification } from '@svg-builder/shared';
import { normalizedToPixel } from '@svg-builder/svg-core';

export class LayoutPlannerService {
  constructor(private llmProvider: LlmProvider) {}

  async plan(
    brief: CreativeBrief,
    styleSystem: StyleSystem,
    classification: AssetTypeClassification,
    width: number,
    height: number,
    referenceAnalysis?: unknown,
    options?: { onToken?: (token: string) => void; onReasoning?: (token: string) => void; onRetry?: (attempt: number, maxRetries: number, error: Error) => void }
  ): Promise<LayoutBlueprint> {
    const { system, user } = buildLayoutPlannerPrompt({
      brief,
      styleSystem,
      classification,
      width,
      height,
      referenceAnalysis,
    });

    const layout = await generateStructuredOutput(
      this.llmProvider,
      system,
      user,
      LayoutBlueprintSchema,
      { maxRetries: 3, onToken: options?.onToken, onReasoning: options?.onReasoning, onRetry: options?.onRetry }
    );

    // Keep the coordinate contract honest: only normalize when the layout says it is normalized.
    // Previously pixel-based layouts were multiplied by canvas size, polluting later revision prompts.
    const layersWithPixelBounds = layout.layers.map((layer) => {
      const pixelBounds = layout.normalizedCoordinateSystem
        ? normalizedToPixel(layer.bounds, width, height)
        : layer.bounds;
      return {
        ...layer,
        pixelBounds,
      };
    });

    return {
      ...layout,
      layers: layersWithPixelBounds,
    };
  }
}
