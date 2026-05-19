export function buildReferenceAnalysisPrompt(params: {
  imageBase64?: string;
  imageUrl: string;
}): { system: string; user: string } {
  const system = `You are a visual analysis expert. Analyze images for SVG reconstruction purposes. Return JSON only.`;

  const user = `Analyze the reference image for SVG reconstruction.

Image URL: ${params.imageUrl}
${params.imageBase64 ? `Image data: [base64 image data available]` : ""}

Return a JSON object with these fields:
- canvas: object with width, height (estimated dimensions)
- subjectBounds: object with x, y, w, h (normalized 0-100)
- palette: array of dominant hex color strings
- styleNotes: string (description of style, line quality, shapes, complexity)

Return JSON only, no markdown.`;

  return { system, user };
}
