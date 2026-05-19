import { z } from "zod";
import { coercedBoolean, coercedNumber } from "../utils/zodHelpers.js";

export const EvaluationIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  type: z.enum([
    "positioning",
    "proportion",
    "style",
    "crop",
    "technical",
    "readability",
    "consistency",
    "metaphor",
    "tileability",
    "brand",
  ]),
  target: z.string(),
  problem: z.string(),
  suggestedFix: z
    .object({
      moveX: coercedNumber().optional(),
      moveY: coercedNumber().optional(),
      scale: coercedNumber().optional(),
      regenerateLayer: coercedBoolean().optional(),
      simplifyDetail: coercedBoolean().optional(),
      updateLayout: coercedBoolean().optional(),
    })
    .optional(),
});

export const EvaluationScoresSchema = z.record(coercedNumber());

export const EvaluationResultSchema = z.object({
  scores: EvaluationScoresSchema,
  issues: z.array(EvaluationIssueSchema),
  continueIteration: coercedBoolean(),
});

export type EvaluationIssue = z.infer<typeof EvaluationIssueSchema>;
export type EvaluationScores = z.infer<typeof EvaluationScoresSchema>;
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;
