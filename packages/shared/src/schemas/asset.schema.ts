import { z } from "zod";

export const BuildSvgAssetRequestSchema = z.object({
  prompt: z.string().min(1),
  assetType: z.string().optional(),
  mode: z.enum(["direct", "reference", "premium"]).default("direct"),
  style: z.string().optional(),
  output: z.object({
    formats: z.array(z.enum(["svg", "png"])).default(["svg", "png"]),
    width: z.number().default(512),
    height: z.number().default(512),
  }),
  referenceImageUrl: z.string().optional(),
  maxIterations: z.number().min(1).max(15).optional(),
  visibility: z.enum(["private", "public"]).default("private"),
});

export const IterateSvgAssetRequestSchema = z.object({
  assetId: z.string(),
  instruction: z.string().min(1),
});

export const RenderSvgRequestSchema = z.object({
  svg: z.string().min(1),
  width: z.number().default(512),
  height: z.number().default(512),
});

export const OptimizeSvgRequestSchema = z.object({
  svg: z.string().min(1),
});

export type BuildSvgAssetRequest = z.infer<typeof BuildSvgAssetRequestSchema>;
export type IterateSvgAssetRequest = z.infer<
  typeof IterateSvgAssetRequestSchema
>;
export type RenderSvgRequest = z.infer<typeof RenderSvgRequestSchema>;
export type OptimizeSvgRequest = z.infer<typeof OptimizeSvgRequestSchema>;
