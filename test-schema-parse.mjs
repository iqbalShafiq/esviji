import { z } from "zod";
import { coercedBoolean, coercedNumber } from "./packages/shared/dist/utils/zodHelpers.js";

const StyleSystemSchema = z.object({
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
    cornerRadius: coercedNumber(),
    geometry: z.string(),
    asymmetry: coercedNumber(),
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

const testData = {
  name: "Test",
  palette: { background: "#FFF", primary: "#000", secondary: "#333", accent: "#F00", muted: "#999" },
  stroke: { enabled: "true", width: "2", cap: "round", join: "round" },
  shapeLanguage: { cornerRadius: "16", geometry: "round", asymmetry: "0.5", detailLevel: "high" },
  effects: { shadow: "true", texture: "false", gradient: "true" },
  constraints: { maxColorsPerAsset: "5", safeSvgOnly: "true", editableLayers: "false" },
};

const result = StyleSystemSchema.safeParse(testData);
console.log("success:", result.success);
if (!result.success) {
  console.log("errors:", result.error.issues);
} else {
  console.log("data:", JSON.stringify(result.data, null, 2));
}
