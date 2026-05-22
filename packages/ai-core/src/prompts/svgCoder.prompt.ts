export function buildSvgCoderPrompt(params: {
  brief: unknown;
  styleSystem: unknown;
  layout: unknown;
  revisionInstruction?: string;
  previousSvg?: string;
  previousErrorContext?: string;
}): { system: string; user: string } {
  const system = `You are an expert SVG illustrator and SVG engineer. Generate clean, valid, production-ready SVG markup based on the provided brief, style system, and layout plan. Output SVG markup only.`;

  const user = `Generate an SVG based on the following specifications.

Creative brief: ${JSON.stringify(params.brief, null, 2)}
Style system: ${JSON.stringify(params.styleSystem, null, 2)}
Layout plan: ${JSON.stringify(params.layout, null, 2)}
${params.revisionInstruction ? `Revision instruction / structured revision plan:\n${params.revisionInstruction}` : ""}
${params.previousErrorContext ? `Previous failed attempt context:\n${params.previousErrorContext}` : ""}
${params.previousSvg ? `Previous SVG context:\n${params.previousSvg}` : ""}

Requirements:
- Output valid SVG markup only, no markdown fences, no explanations
- Use the style system colors and stroke settings
- Follow the layout plan for layer positioning
- Create clear visual hierarchy with foreground, midground, and supporting detail layers
- Use at least 3 named <g id="..."> groups that correspond to meaningful parts of the asset
- Avoid generic placeholder blobs, single-shape icons, random decoration, and text labels unless explicitly requested
- Keep all important content inside the viewBox with comfortable padding
- Ensure the SVG is self-contained with no external dependencies
- Use viewBox and appropriate xmlns
- Keep it clean and editable
- Use only safe SVG elements and attributes; do not use script, style, foreignObject, image, external URLs, data URLs, or event handlers
- When a structured revision plan is provided, follow its strategy, layersToRegenerate, layerTransforms failure context, and updated layout intent explicitly. Preserve resolved parts of the previous SVG when possible.
- If the revision plan says full_regenerate, do not preserve the previous SVG structure. Treat any previous SVG as a failure reference, rebuild from the brief/layout, and satisfy every mustChange, avoidRepeating, and successCriteria item.
- If the revision plan contains avoidRepeating, verify your SVG does not repeat those exact failure patterns before returning.
- If the revision plan contains successCriteria, use it as a preflight checklist and only return an SVG that satisfies it.
- Do not merely rename attributes or make cosmetic edits when the issues describe poor visual quality, unreadability, weak metaphor, or repeated failures. Make structural geometry/layer changes.

Output SVG markup only.`;

  return { system, user };
}
