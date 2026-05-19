import { z } from "zod";

export const BuildSvgPackRequestSchema = z.object({
  prompt: z.string().min(1),
  assetType: z.string().default("icon_pack"),
  quantity: z.number().min(1).max(50).default(12),
  style: z.string().optional(),
  output: z.object({
    width: z.number().default(48),
    height: z.number().default(48),
    formats: z.array(z.enum(["svg", "png"])).default(["svg", "png"]),
  }),
  items: z.array(z.string()).optional(),
  maxIterations: z.number().min(1).max(8).default(3),
});

export type BuildSvgPackRequest = z.infer<typeof BuildSvgPackRequestSchema>;
