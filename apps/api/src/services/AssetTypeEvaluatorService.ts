import { LlmProvider, generateStructuredOutput, buildEvaluatorPrompt } from '@svg-builder/ai-core';
import { EvaluationResultSchema, type EvaluationResult, type AssetTypeClassification, type CreativeBrief, type StyleSystem, type LayoutBlueprint } from '@svg-builder/shared';
import { QUALITY_THRESHOLDS } from '@svg-builder/shared';
import { readFile } from 'fs/promises';

export class AssetTypeEvaluatorService {
  constructor(private llmProvider: LlmProvider) {}

  async evaluate(
    classification: AssetTypeClassification,
    brief: CreativeBrief,
    styleSystem: StyleSystem,
    layout: LayoutBlueprint,
    _pngPreviewPath: string,
    referenceAnalysis?: unknown,
    options?: {
      onToken?: (token: string) => void;
      svgSource?: string;
      validationSummary?: { valid: boolean; errors: string[]; warnings: string[] };
    }
  ): Promise<EvaluationResult> {
    let renderedPreviewBase64: string | undefined;
    try {
      const png = await readFile(_pngPreviewPath);
      renderedPreviewBase64 = png.toString('base64');
    } catch {
      renderedPreviewBase64 = undefined;
    }

    const { system, user } = buildEvaluatorPrompt({
      classification,
      brief,
      styleSystem,
      layout,
      referenceAnalysis,
      renderedPreviewBase64,
      svgSource: options?.svgSource,
      validationSummary: options?.validationSummary,
    });

    const result = await generateStructuredOutput(
      this.llmProvider,
      system,
      user,
      EvaluationResultSchema,
      { maxRetries: 2, onToken: options?.onToken }
    );

    // Check against quality thresholds
    const thresholds = QUALITY_THRESHOLDS[classification.assetType] ?? QUALITY_THRESHOLDS.icon;
    const scores = result.scores;

    let meetsThresholds = true;
    for (const [key, threshold] of Object.entries(thresholds)) {
      const score = scores[key];
      if (typeof score === 'number' && score < threshold) {
        meetsThresholds = false;
        break;
      }
    }

    // If there are high severity issues, continue iterating
    const hasHighSeverityIssues = result.issues.some((issue) => issue.severity === 'high');

    // Override continueIteration based on thresholds and issues
    const shouldContinue = hasHighSeverityIssues || !meetsThresholds || result.continueIteration;

    return {
      ...result,
      continueIteration: shouldContinue,
    };
  }
}
