export function buildCreativeBriefPrompt(params: {
  prompt: string;
  classification: unknown;
  style?: string;
  width: number;
  height: number;
  referenceAnalysis?: unknown;
}): { system: string; user: string } {
  const system = `You are an expert art director for SVG asset generation. Create a detailed creative brief based on the user's request and classification. Return JSON only.`;

  const user = `Create a creative brief for the following request.

User prompt: "${params.prompt}"
Asset classification: ${JSON.stringify(params.classification, null, 2)}
${params.style ? `Style preference: ${params.style}` : ""}
Canvas size: ${params.width}x${params.height}
${params.referenceAnalysis ? `Reference analysis: ${JSON.stringify(params.referenceAnalysis, null, 2)}` : ""}

Return a JSON object matching CreativeBrief with these fields:
- assetType: string
- style: object with category, texture, lineQuality, palette (array of hex strings), mood
- composition: object with canvas, subject, negativeSpace, mainFocus
- constraints: object with mustBeSvg, noExternalImages, safeSvgOnly, editableLayers, smallSizeReadable

Return JSON only, no markdown.`;

  return { system, user };
}
