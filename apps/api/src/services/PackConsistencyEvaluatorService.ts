import { z } from 'zod';
import { generateStructuredOutput } from '@svg-builder/ai-core';
import type { LlmProvider } from '@svg-builder/ai-core';
import type { StyleSystem, EvaluationResult } from '@svg-builder/shared';
import type { Asset } from '@prisma/client';
import type { PackPlan } from './PackPlannerService.js';

export const ConsistencyScoresSchema = z.object({
  styleConsistency: z.number(),
  strokeConsistency: z.number(),
  paletteConsistency: z.number(),
  gridConsistency: z.number(),
  metaphorDiversity: z.number(),
  overall: z.number(),
});

export const OutlierSchema = z.object({
  assetId: z.string(),
  assetName: z.string(),
  problems: z.array(z.string()),
  suggestedFixes: z.array(z.string()),
});

export const PackConsistencyEvaluationSchema = z.object({
  consistencyScores: ConsistencyScoresSchema,
  outliers: z.array(OutlierSchema),
});

export type PackConsistencyEvaluation = z.infer<
  typeof PackConsistencyEvaluationSchema
>;

export class PackConsistencyEvaluatorService {
  constructor(private llmProvider: LlmProvider) {}

  async evaluate(
    packPlan: PackPlan,
    styleSystem: StyleSystem,
    assets: Asset[],
    scores: EvaluationResult[],
    options?: { onToken?: (token: string) => void }
  ): Promise<PackConsistencyEvaluation> {
    const system = `You are a pack consistency evaluator for an AI SVG Asset Builder. Evaluate the consistency of a pack of SVG assets and identify outliers. Return JSON only.`;

    const assetsSummary = assets
      .map(
        (a, i) =>
          `Asset ${i + 1}:\n- ID: ${a.id}\n- Name: ${a.name ?? 'Unnamed'}\n- Type: ${
            a.assetType
          }\n- Final SVG Path: ${a.finalSvgPath ?? 'N/A'}\n- Final PNG Path: ${
            a.finalPngPath ?? 'N/A'
          }`
      )
      .join('\n\n');

    const scoresSummary = scores
      .map(
        (s, i) =>
          `Asset ${i + 1} Scores:\n${JSON.stringify(s.scores, null, 2)}\nIssues:\n${s.issues
            .map((issue) => `- [${issue.severity}] ${issue.type}: ${issue.problem}`)
            .join('\n')}`
      )
      .join('\n\n');

    const user = `Evaluate the consistency of the following pack of SVG assets.

Pack Plan:
${JSON.stringify(packPlan, null, 2)}

Style System:
${JSON.stringify(styleSystem, null, 2)}

Assets:
${assetsSummary}

Evaluation Results:
${scoresSummary}

Check the following and return a JSON object:
1. Style consistency across all assets
2. Stroke consistency
3. Palette consistency
4. Grid consistency
5. Metaphor diversity (ensure metaphors are not too repetitive)

For each outlier asset, provide:
- assetId
- assetName
- problems (list of consistency problems)
- suggestedFixes (list of specific fix instructions)

Return JSON matching this structure:
{
  "consistencyScores": {
    "styleConsistency": number (0-100),
    "strokeConsistency": number (0-100),
    "paletteConsistency": number (0-100),
    "gridConsistency": number (0-100),
    "metaphorDiversity": number (0-100),
    "overall": number (0-100)
  },
  "outliers": [
    {
      "assetId": string,
      "assetName": string,
      "problems": [string],
      "suggestedFixes": [string]
    }
  ]
}

Return JSON only, no markdown.`;

    const result = await generateStructuredOutput<PackConsistencyEvaluation>(
      this.llmProvider,
      system,
      user,
      PackConsistencyEvaluationSchema,
      { maxRetries: 2, onToken: options?.onToken }
    );

    return result;
  }
}
