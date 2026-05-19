export function buildRevisionPlannerPrompt(params: {
  classification: any;
  layout: any;
  issues: any[];
  currentIteration: number;
}): { system: string; user: string } {
  const system = `You are a geometry and style correction planner. Analyze evaluation issues and produce a structured revision plan. Return JSON only.`;

  const user = `Create a revision plan based on the evaluation issues.

Asset classification: ${JSON.stringify(params.classification, null, 2)}
Layout plan: ${JSON.stringify(params.layout, null, 2)}
Current iteration: ${params.currentIteration}

Issues:
${JSON.stringify(params.issues, null, 2)}

Return a JSON object matching RevisionPlan with these fields:
- strategy: enum ("layout_update", "layer_transform", "layer_regenerate", "full_regenerate")
- updatedLayout: optional object (updated layout metadata if strategy is layout_update)
- layerTransforms: optional array of objects with layerId, transform
  - transform can be either:
    1) string SVG transform command (e.g. "translate(2 -1) scale(0.95)")
    2) object with transform metadata (e.g. {"translate": {"x": 2, "y": -1}, "scale": 0.95})
- layersToRegenerate: optional array of layer IDs
- notes: string (human-readable explanation of the plan)

Return JSON only, no markdown.`;

  return { system, user };
}
