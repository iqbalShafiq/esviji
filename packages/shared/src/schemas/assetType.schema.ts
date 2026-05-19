import { z } from "zod";
import { coercedBoolean, coercedInt } from "../utils/zodHelpers.js";

export const AssetTypeClassificationSchema = z.object({
  assetType: z.string(),
  quantity: coercedInt().default(1),
  useCase: z.enum([
    "web_app",
    "mobile_app",
    "landing_page",
    "brand_identity",
    "sticker",
    "presentation",
    "general",
  ]),
  requiresConsistency: coercedBoolean(),
  requiresSmallSizeReadability: coercedBoolean(),
  requiresTileability: coercedBoolean(),
  requiresBrandOriginality: coercedBoolean(),
  requiresReferenceMatching: coercedBoolean(),
});

export type AssetTypeClassification = z.infer<
  typeof AssetTypeClassificationSchema
>;
