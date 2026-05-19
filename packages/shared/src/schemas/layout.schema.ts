import { z } from "zod";
import { coercedBoolean, coercedNumber } from "../utils/zodHelpers.js";

export const BoundsSchema = z.object({
  x: coercedNumber(),
  y: coercedNumber(),
  w: coercedNumber(),
  h: coercedNumber(),
});

export const LayerSchema = z.object({
  id: z.string(),
  type: z.string(),
  bounds: BoundsSchema,
  pixelBounds: BoundsSchema.optional(),
  anchor: z.string(),
});

export const LayoutBlueprintSchema = z.object({
  canvas: z.object({
    width: coercedNumber(),
    height: coercedNumber(),
    viewBox: z.string(),
  }),
  assetType: z.string(),
  normalizedCoordinateSystem: coercedBoolean(),
  composition: z.record(z.any()),
  layers: z.array(LayerSchema),
});

export type Bounds = z.infer<typeof BoundsSchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type LayoutBlueprint = z.infer<typeof LayoutBlueprintSchema>;
