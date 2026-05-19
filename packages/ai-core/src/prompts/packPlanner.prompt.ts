export function buildPackPlannerPrompt(params: {
  prompt: string;
  classification: any;
  items?: string[];
  quantity: number;
  style?: string;
}): { system: string; user: string } {
  const system = `You are a pack planner for an AI SVG Asset Builder. Plan a cohesive pack of related SVG assets based on the user's request. Return JSON only.`;

  const user = `Plan a pack of SVG assets based on the following request.

User prompt: "${params.prompt}"
Asset classification: ${JSON.stringify(params.classification, null, 2)}
Requested quantity: ${params.quantity}
${params.style ? `Style preference: ${params.style}` : ""}
${params.items && params.items.length > 0 ? `Explicit items: ${params.items.join(", ")}` : ""}

Return a JSON object with these fields:
- packName: string (a descriptive name for the pack)
- assetType: string (the type of assets in the pack)
- quantity: number (total number of items)
- styleSystem: partial StyleSystem object with optional palette, stroke, shapeLanguage, effects, and constraints
- items: array of objects, each with:
  - name: string (descriptive name for this asset)
  - prompt: string (detailed generation prompt)
  - metaphor: string (visual metaphor or concept)
  - requiredElements: string[] (elements that must be present)
  - avoidElements: string[] (elements to avoid)
  - layoutHint: string (guidance on composition/layout)

Return JSON only, no markdown.`;

  return { system, user };
}
