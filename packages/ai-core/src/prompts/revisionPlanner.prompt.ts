export function buildRevisionPlannerPrompt(params: {
  classification: unknown;
  layout: unknown;
  svgSource?: string;
  issues: unknown[];
  currentIteration: number;
  issueHistorySummary?: string;
}): { system: string; user: string } {
  const system = `You are a geometry and style correction planner. Analyze evaluation issues and produce a structured revision plan. Return strict JSON only.`;

  const user = `Create a revision plan based on the evaluation issues.

Asset classification: ${JSON.stringify(params.classification, null, 2)}
Layout plan: ${JSON.stringify(params.layout, null, 2)}
Current iteration: ${params.currentIteration}
${params.svgSource ? `Current SVG source:\n${params.svgSource}` : ""}
${params.issueHistorySummary ? `Issue history across iterations:\n${params.issueHistorySummary}` : ""}

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
- mustChange: optional array of concrete, observable changes the next SVG must make
- avoidRepeating: optional array of concrete patterns from the current SVG that the next SVG must not repeat
- successCriteria: optional array of checks the next SVG should satisfy before evaluation
- notes: string (human-readable explanation of the plan)

Planning rules:
- Treat repeated issues from issue history as evidence that prior advice was ignored. Escalate to full_regenerate when a high/medium issue repeats across iterations without visible improvement.
- If an issue names a layer that does not exist in the SVG source, choose full_regenerate or layer_regenerate instead of layer_transform.
- Prefer layer_transform only when the target <g id="..."> exists and the requested fix is a small geometric adjustment.
- Use full_regenerate when the SVG is visually generic, sparse, technically invalid, or structurally inconsistent with the layout.
- For full_regenerate, mustChange must require a new visual structure, not just renamed attributes or tiny edits.
- For full_regenerate, avoidRepeating must list the most important failure patterns from the current SVG.
- successCriteria must be concrete enough for a generator to self-check before returning SVG.
- For visual quality failures, include positive construction instructions in mustChange, such as silhouette simplification, fewer decorative seams, stronger value-separated planes, larger readable forms, or clearer metaphor.
- Avoid vague notes like "improve quality". Every mustChange and successCriteria item should be visible in the resulting SVG or render.
- Make the plan directly executable: target exact layer IDs from the current SVG, keep transform values as valid SVG transform strings when using layer_transform, and put concrete regeneration instructions in notes.
- If a layout change is needed, include only the layout fields that must change in updatedLayout and explain why in notes.
- Keep notes concise. Do not include raw SVG, markdown, code fences, or unescaped quote characters inside notes.
- Output one valid JSON object only. Every string must use JSON-safe escaping.

Return JSON only, no markdown.`;

  return { system, user };
}
