import { z } from 'zod';
import {
  generateStructuredOutput,
  buildPackPlannerPrompt,
} from '@svg-builder/ai-core';
import type { LlmProvider } from '@svg-builder/ai-core';
import type { AssetTypeClassification } from '@svg-builder/shared';

export const PackPlanItemSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  metaphor: z.string(),
  requiredElements: z.array(z.string()),
  avoidElements: z.array(z.string()),
  layoutHint: z.string(),
});

export const PackPlanSchema = z.object({
  packName: z.string(),
  assetType: z.string(),
  quantity: z.number(),
  styleSystem: z
    .object({
      palette: z
        .object({
          background: z.string().optional(),
          primary: z.string().optional(),
          secondary: z.string().optional(),
          accent: z.string().optional(),
          muted: z.string().optional(),
        })
        .optional(),
      stroke: z
        .object({
          enabled: z.boolean().optional(),
          width: z.number().optional(),
          cap: z.string().optional(),
          join: z.string().optional(),
        })
        .optional(),
      shapeLanguage: z
        .object({
          cornerRadius: z.number().optional(),
          geometry: z.string().optional(),
          asymmetry: z.number().optional(),
          detailLevel: z.string().optional(),
        })
        .optional(),
      effects: z
        .object({
          shadow: z.boolean().optional(),
          texture: z.boolean().optional(),
          gradient: z.boolean().optional(),
        })
        .optional(),
      constraints: z
        .object({
          maxColorsPerAsset: z.number().optional(),
          safeSvgOnly: z.boolean().optional(),
          editableLayers: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  items: z.array(PackPlanItemSchema),
});

export type PackPlanItem = z.infer<typeof PackPlanItemSchema>;
export type PackPlan = z.infer<typeof PackPlanSchema>;

export class PackPlannerService {
  constructor(private llmProvider: LlmProvider) {}

  async plan(
    prompt: string,
    classification: AssetTypeClassification,
    options?: { items?: string[]; quantity: number; style?: string; onToken?: (token: string) => void }
  ): Promise<PackPlan> {
    const { system, user } = buildPackPlannerPrompt({
      prompt,
      classification,
      items: options?.items,
      quantity: options?.quantity ?? 12,
      style: options?.style,
    });

    const plan = await generateStructuredOutput<PackPlan>(
      this.llmProvider,
      system,
      user,
      PackPlanSchema,
      { maxRetries: 2, onToken: options?.onToken }
    );

    return plan;
  }
}
