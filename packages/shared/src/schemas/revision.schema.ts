import { z } from "zod";

export const RevisionPlanSchema = z.object({
  strategy: z.enum([
    "layout_update",
    "layer_transform",
    "layer_regenerate",
    "full_regenerate",
  ]),
  updatedLayout: z.record(z.any()).optional(),
  layerTransforms: z
    .array(
      z.object({
        layerId: z.string(),
        transform: z.union([z.string(), z.record(z.any())]),
      })
    )
    .optional(),
  layersToRegenerate: z.array(z.string()).optional(),
  mustChange: z.array(z.string()).optional(),
  avoidRepeating: z.array(z.string()).optional(),
  successCriteria: z.array(z.string()).optional(),
  notes: z.string(),
});

export type RevisionPlan = z.infer<typeof RevisionPlanSchema>;
