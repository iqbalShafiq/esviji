import { z } from "zod";
import { coercedBoolean, coercedNumber } from "../utils/zodHelpers.js";

export const StyleSystemSchema = z.object({
  name: z.string(),
  palette: z.object({
    background: z.string(),
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    muted: z.string(),
  }),
  stroke: z.object({
    enabled: coercedBoolean(),
    width: coercedNumber(),
    cap: z.string(),
    join: z.string(),
  }),
  shapeLanguage: z.object({
    cornerRadius: z.union([coercedNumber(), z.string()]),
    geometry: z.string(),
    asymmetry: z.union([coercedNumber(), z.string()]),
    detailLevel: z.string(),
  }),
  effects: z.object({
    shadow: coercedBoolean(),
    texture: coercedBoolean(),
    gradient: coercedBoolean(),
  }),
  constraints: z.object({
    maxColorsPerAsset: coercedNumber(),
    safeSvgOnly: coercedBoolean(),
    editableLayers: coercedBoolean(),
  }),
});

export type StyleSystem = z.infer<typeof StyleSystemSchema>;
