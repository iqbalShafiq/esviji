import { LlmProvider, generateStructuredOutput, buildRevisionPlannerPrompt } from '@svg-builder/ai-core';
import { RevisionPlanSchema, type RevisionPlan, type LayoutBlueprint, type AssetTypeClassification, type EvaluationIssue } from '@svg-builder/shared';

export class RevisionPlannerService {
  constructor(private llmProvider: LlmProvider) {}

  async plan(
    layout: LayoutBlueprint,
    svg: string,
    issues: EvaluationIssue[],
    currentIteration: number,
    classification: AssetTypeClassification,
    options?: { onToken?: (token: string) => void; onRetry?: (attempt: number, maxRetries: number, error: Error) => void }
  ): Promise<RevisionPlan> {
    const { system, user } = buildRevisionPlannerPrompt({
      classification,
      layout,
      svgSource: svg,
      issues,
      currentIteration,
    });

    const plan = await generateStructuredOutput(
      this.llmProvider,
      system,
      user,
      RevisionPlanSchema,
      { maxRetries: 3, onToken: options?.onToken, onRetry: options?.onRetry }
    );

    return plan;
  }
}
