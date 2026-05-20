export function buildLayoutPlannerPrompt(params: {
  brief: unknown;
  styleSystem: unknown;
  referenceAnalysis?: unknown;
  classification: unknown;
  width: number;
  height: number;
}): { system: string; user: string } {
  const system = `You are a layout planner for a high-quality SVG Asset Builder. Design the spatial composition, layer structure, and bounding boxes for an SVG asset. Return JSON only.`;

  const user = `Plan the layout for the following asset.

Creative brief: ${JSON.stringify(params.brief, null, 2)}
Style system: ${JSON.stringify(params.styleSystem, null, 2)}
Asset classification: ${JSON.stringify(params.classification, null, 2)}
Canvas size: ${params.width}x${params.height}
${params.referenceAnalysis ? `Reference analysis: ${JSON.stringify(params.referenceAnalysis, null, 2)}` : ""}

Return a JSON object matching LayoutBlueprint with these fields:
- canvas: object with width, height, viewBox
- assetType: string
- normalizedCoordinateSystem: boolean
- composition: object (freeform layout metadata)
- layers: array of objects with id, type, bounds (x, y, w, h), anchor

Return JSON only, no markdown.`;

  return { system, user };
}
