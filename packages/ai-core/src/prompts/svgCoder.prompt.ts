export function buildSvgCoderPrompt(params: {
  brief: any;
  styleSystem: any;
  layout: any;
  revisionInstruction?: string;
  previousSvg?: string;
}): { system: string; user: string } {
  const system = `You are an expert SVG illustrator and SVG engineer. Generate clean, valid, optimized SVG markup based on the provided brief, style system, and layout plan. Output SVG markup only.`;

  const user = `Generate an SVG based on the following specifications.

Creative brief: ${JSON.stringify(params.brief, null, 2)}
Style system: ${JSON.stringify(params.styleSystem, null, 2)}
Layout plan: ${JSON.stringify(params.layout, null, 2)}
${params.revisionInstruction ? `Revision instruction: ${params.revisionInstruction}` : ""}
${params.previousSvg ? `Previous SVG to revise:\n${params.previousSvg}` : ""}

Requirements:
- Output valid SVG markup only, no markdown fences, no explanations
- Use the style system colors and stroke settings
- Follow the layout plan for layer positioning
- Ensure the SVG is self-contained with no external dependencies
- Use viewBox and appropriate xmlns
- Keep it clean and editable

Output SVG markup only.`;

  return { system, user };
}
