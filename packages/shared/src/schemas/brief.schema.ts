import { z } from "zod";
import { coercedBoolean } from "../utils/zodHelpers.js";

export const CreativeBriefSchema = z.object({
  assetType: z.string(),
  style: z.object({
    category: z.string(),
    texture: z.string(),
    lineQuality: z.string(),
    palette: z.array(z.string()),
    mood: z.string(),
  }),
  composition: z.object({
    canvas: z.string(),
    subject: z.string(),
    negativeSpace: z.string(),
    mainFocus: z.string(),
  }),
  constraints: z.object({
    mustBeSvg: coercedBoolean(),
    noExternalImages: coercedBoolean(),
    safeSvgOnly: coercedBoolean(),
    editableLayers: coercedBoolean(),
    smallSizeReadable: coercedBoolean(),
  }),
});

export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;
