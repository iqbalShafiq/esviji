export { validateSvg, type SvgValidationResult } from "./validateSvg.js";
export { sanitizeSvg } from "./sanitizeSvg.js";
export { optimizeSvg, type OptimizeResult } from "./optimizeSvg.js";
export { renderSvg } from "./renderSvg.js";
export {
  normalizedToPixel,
  pixelToNormalized,
  type NormalizedBounds,
  type PixelBounds,
} from "./coordinateTransform.js";
export { applyTransformToLayer } from "./svgLayerTransform.js";
export { generateDebugOverlay } from "./debugOverlay.js";
