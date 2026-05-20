import { LlmProvider, generateStructuredOutput, buildEvaluatorPrompt, repairJson } from '@svg-builder/ai-core';
import { EvaluationResultSchema, type EvaluationResult, type AssetTypeClassification, type CreativeBrief, type StyleSystem, type LayoutBlueprint } from '@svg-builder/shared';
import { QUALITY_THRESHOLDS } from '@svg-builder/shared';
import { readFile } from 'fs/promises';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createLangChainChatModel, type LangChainModelConfig } from '../agents/langChainModelFactory.js';

export class AssetTypeEvaluatorService {
  constructor(private llmProvider: LlmProvider, private langChainModelConfig?: LangChainModelConfig) {}

  async evaluate(
    classification: AssetTypeClassification,
    brief: CreativeBrief,
    styleSystem: StyleSystem,
    layout: LayoutBlueprint,
    _pngPreviewPath: string,
    referenceAnalysis?: unknown,
    options?: {
      onToken?: (token: string) => void;
      onReasoning?: (token: string) => void;
      onRetry?: (attempt: number, maxRetries: number, error: Error) => void;
      svgSource?: string;
      validationSummary?: { valid: boolean; errors: string[]; warnings: string[] };
      previousEvaluationContext?: unknown;
    }
  ): Promise<EvaluationResult> {
    let renderedPreviewDataUrl: string | undefined;
    try {
      const png = await readFile(_pngPreviewPath);
      renderedPreviewDataUrl = `data:image/png;base64,${png.toString('base64')}`;
    } catch {
      renderedPreviewDataUrl = undefined;
    }

    const { system, user } = buildEvaluatorPrompt({
      classification,
      brief,
      styleSystem,
      layout,
      referenceAnalysis,
      hasRenderedPreview: Boolean(renderedPreviewDataUrl),
      svgSource: options?.svgSource,
      validationSummary: options?.validationSummary,
      previousEvaluationContext: options?.previousEvaluationContext,
    });

    const result = renderedPreviewDataUrl && this.langChainModelConfig
      ? await this.evaluateWithMultimodalInput(system, user, renderedPreviewDataUrl, options)
      : await generateStructuredOutput(
          this.llmProvider,
          system,
          user,
          EvaluationResultSchema,
          { maxRetries: 3, onToken: options?.onToken, onReasoning: options?.onReasoning, onRetry: options?.onRetry }
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

  private async evaluateWithMultimodalInput(
    system: string,
    user: string,
    renderedPreviewDataUrl: string,
    options?: {
      onRetry?: (attempt: number, maxRetries: number, error: Error) => void;
    }
  ): Promise<EvaluationResult> {
    const maxRetries = 3;
    const errors: Error[] = [];
    const model = createLangChainChatModel(this.langChainModelConfig!, {
      temperature: 0.2,
      maxRetries: 0,
      useResponsesApi: true,
    });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const retryText = errors.length
          ? `\n\nPrevious generation errors:\n${errors
              .map((error, index) => `Attempt ${index + 1} failed: ${error.message}`)
              .join('\n')}\n\nRetry instructions:\n- Return output that satisfies the requested JSON schema exactly.`
          : '';
        const content = [
          { type: 'text', text: `${user}${retryText}\n\nReturn JSON only, no markdown.` },
          { type: 'image_url', image_url: { url: renderedPreviewDataUrl } },
        ];
        const raw = await model.invoke([
          new SystemMessage(system),
          new HumanMessage({ content: content as never }),
        ]);
        const text = typeof raw.content === 'string'
          ? raw.content
          : raw.content
              .map((part) => typeof part === 'string' ? part : 'text' in part ? String(part.text) : '')
              .join('');
        return EvaluationResultSchema.parse(JSON.parse(repairJson(text)));
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        errors.push(normalized);
        if (attempt < maxRetries) {
          options?.onRetry?.(attempt + 1, maxRetries, normalized);
        }
      }
    }

    throw new Error(
      `Failed to generate multimodal evaluation after ${maxRetries + 1} attempt(s): ${errors.at(-1)?.message}`
    );
  }
}
