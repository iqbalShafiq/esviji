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

Coordinate rules:
- If normalizedCoordinateSystem is false, bounds MUST be pixel coordinates inside the ${params.width}x${params.height} canvas.
- If normalizedCoordinateSystem is true, bounds MUST be percentages from 0 to 100.
- Do not mix coordinate systems.
- For pixel coordinates, every layer should fit inside the canvas and use realistic sizes, not normalized percentages.
- Make composition metadata useful: include intended silhouette, visual hierarchy, simplification priorities, and which layers are essential vs decorative.

Return JSON only, no markdown.`;

  return { system, user };
}
