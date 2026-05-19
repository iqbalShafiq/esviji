export function buildEvaluatorPrompt(params: {
  classification: any;
  brief: any;
  styleSystem: any;
  layout: any;
  referenceAnalysis?: any;
  renderedPreviewBase64?: string;
  svgSource?: string;
  validationSummary?: { valid: boolean; errors: string[]; warnings: string[] };
}): { system: string; user: string } {
  const system = `You are a strict visual QA evaluator. Evaluate an SVG asset against its brief, style system, and layout plan. Return JSON only with numeric scores and concrete fixes.`;

  const user = `Evaluate the generated SVG asset against its specifications.

Asset classification: ${JSON.stringify(params.classification, null, 2)}
Creative brief: ${JSON.stringify(params.brief, null, 2)}
Style system: ${JSON.stringify(params.styleSystem, null, 2)}
Layout plan: ${JSON.stringify(params.layout, null, 2)}
${params.referenceAnalysis ? `Reference analysis: ${JSON.stringify(params.referenceAnalysis, null, 2)}` : ""}
${params.renderedPreviewBase64 ? `Rendered preview PNG (base64): ${params.renderedPreviewBase64}` : ""}
${params.svgSource ? `SVG source:\n${params.svgSource}` : ""}
${params.validationSummary ? `SVG validation summary: ${JSON.stringify(params.validationSummary, null, 2)}` : ""}

Return a JSON object matching EvaluationResult with these fields:
- scores: object with numeric scores (0-100) for overall, styleAdherence, layoutAccuracy, readability, technicalQuality
- issues: array of objects with severity ("low", "medium", "high"), type ("positioning", "proportion", "style", "crop", "technical", "readability", "consistency", "metaphor", "tileability", "brand"), target, problem, suggestedFix (optional object with moveX, moveY, scale, regenerateLayer, simplifyDetail, updateLayout)
- continueIteration: boolean (true if issues remain that need fixing)

Return JSON only, no markdown.`;

  return { system, user };
}
