export function buildStyleSystemPrompt(params: {
  brief: unknown;
  classification: unknown;
  packPlan?: unknown;
}): { system: string; user: string } {
  const system = `You are a style system designer for SVG assets. Define a cohesive, reusable style system based on the creative brief and classification. Return JSON only.`;

  const user = `Design a style system for the following asset.

Creative brief: ${JSON.stringify(params.brief, null, 2)}
Asset classification: ${JSON.stringify(params.classification, null, 2)}
${params.packPlan ? `Pack plan: ${JSON.stringify(params.packPlan, null, 2)}` : ""}

Return a JSON object matching StyleSystem with these fields:
- name: string
- palette: object with background, primary, secondary, accent, muted (hex strings)
- stroke: object with enabled, width, cap, join
- shapeLanguage: object with cornerRadius, geometry, asymmetry, detailLevel
- effects: object with shadow, texture, gradient
- constraints: object with maxColorsPerAsset, safeSvgOnly, editableLayers

Return JSON only, no markdown.`;

  return { system, user };
}
