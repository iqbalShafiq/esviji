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
      onRetry?: (attempt: number, maxRetries: number, error: Error) => void;
      svgSource?: string;
      validationSummary?: { valid: boolean; errors: string[]; warnings: string[] };
      previousEvaluationContext?: unknown;
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
      previousEvaluationContext: options?.previousEvaluationContext,
    });

    const result = await generateStructuredOutput(
      this.llmProvider,
      system,
      user,
      EvaluationResultSchema,
      { maxRetries: 3, onToken: options?.onToken, onRetry: options?.onRetry }
    );

    // Check against quality thresholds
    const thresholds = QUALITY_THRESHOLDS[classification.assetType] ?? QUALITY_THRESHOLDS.icon;
    const scores = { ...result.scores };
    const issues = [...result.issues];

    if (options?.validationSummary && !options.validationSummary.valid) {
      scores.technicalValidity = 0;
      issues.push({
        severity: 'high',
        type: 'technical',
        target: 'svg',
        problem: `SVG validation failed: ${options.validationSummary.errors.join('; ')}`,
        suggestedFix: { regenerateLayer: true },
      });
    } else if (options?.validationSummary?.warnings.length) {
      scores.technicalValidity = Math.min(scores.technicalValidity ?? 80, 80);
      issues.push({
        severity: 'medium',
        type: 'technical',
        target: 'svg',
        problem: `SVG validation warnings: ${options.validationSummary.warnings.join('; ')}`,
        suggestedFix: { regenerateLayer: true },
      });
    }

    let meetsThresholds = true;
    for (const [key, threshold] of Object.entries(thresholds)) {
      const score = scores[key];
      if (typeof score !== 'number') {
        scores[key] = 0;
        issues.push({
          severity: 'high',
          type: 'technical',
          target: 'evaluation',
          problem: `Missing required quality metric "${key}" for ${classification.assetType}.`,
          suggestedFix: { regenerateLayer: true },
        });
        meetsThresholds = false;
        continue;
      }

      if (score < threshold) {
        meetsThresholds = false;
      }
    }

    // If there are high severity issues, continue iterating
    const hasHighSeverityIssues = issues.some((issue) => issue.severity === 'high');

    // Override continueIteration based on thresholds and issues
    const shouldContinue = hasHighSeverityIssues || !meetsThresholds || result.continueIteration;

    return {
      ...result,
      scores,
      issues,
      continueIteration: shouldContinue,
    };
  }
}
