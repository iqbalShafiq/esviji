export function buildEvaluatorPrompt(params: {
  classification: unknown;
  brief: unknown;
  styleSystem: unknown;
  layout: unknown;
  referenceAnalysis?: unknown;
  hasRenderedPreview?: boolean;
  svgSource?: string;
  validationSummary?: { valid: boolean; errors: string[]; warnings: string[] };
  previousEvaluationContext?: unknown;
}): { system: string; user: string } {
  const system = `You are a strict visual QA evaluator and SVG production reviewer. Evaluate an SVG asset against its brief, style system, layout plan, technical validity, and visual craft. 

CRITICAL: You must verify whether issues from previous evaluations have been fixed or still persist. If an issue from the previous iteration is still present, you MUST report it again. If an issue has been resolved, do NOT report it. Return JSON only with numeric scores and concrete fixes.`;

  const user = `Evaluate the generated SVG asset against its specifications.

Asset classification: ${JSON.stringify(params.classification, null, 2)}
Creative brief: ${JSON.stringify(params.brief, null, 2)}
Style system: ${JSON.stringify(params.styleSystem, null, 2)}
Layout plan: ${JSON.stringify(params.layout, null, 2)}
${params.referenceAnalysis ? `Reference analysis: ${JSON.stringify(params.referenceAnalysis, null, 2)}` : ""}
${params.hasRenderedPreview ? "Rendered preview PNG is attached as an image input. Use it as the primary source for visual quality, composition, crop, readability, and style adherence." : "Rendered preview PNG is unavailable; evaluate from SVG source and specs only."}
${params.svgSource ? `SVG source:\n${params.svgSource}` : ""}
${params.validationSummary ? `SVG validation summary: ${JSON.stringify(params.validationSummary, null, 2)}` : ""}
${params.previousEvaluationContext ? `Previous evaluation context: ${JSON.stringify(params.previousEvaluationContext, null, 2)}\nUse this to determine whether earlier fixes are now resolved, which issues remain, and whether the current SVG regressed on prior scores.` : ""}
${params.previousEvaluationContext ? `\nIMPORTANT INSTRUCTIONS FOR ITERATION TRACKING:\n- Compare the current SVG with previous evaluations\n- If an issue from the previous iteration is STILL PRESENT, you MUST report it again with the same or higher severity\n- If an issue from the previous iteration has been FIXED, do NOT report it again\n- Only report NEW issues that you observe in the current version\n- Be strict: if a previous issue is partially fixed but still visible, report it as "medium" or "high" severity\n- If ALL previous issues have been resolved and no new issues exist, set continueIteration to false` : ""}

Return a JSON object matching EvaluationResult with these fields:
- scores: object with numeric scores (0-100). Always include overall, styleAdherence, layoutAccuracy, readability, technicalQuality, and technicalValidity.
- For icons also include readabilitySmallSize, gridAlignment, metaphorClarity, and styleConsistency.
- For icon packs also include styleConsistencyAcrossPack, strokeConsistency, paletteConsistency, gridConsistency, and technicalValidity.
- For logos also include brandFit, geometricBalance, monochromeReadability, smallSizeReadability, and technicalValidity.
- For illustrations also include composition, styleMatch, visualHierarchy, proportion, and technicalValidity.
- For patterns also include seamlessness, motifBalance, densityControl, styleConsistency, and technicalValidity.
- issues: array of objects with severity ("low", "medium", "high"), type ("positioning", "proportion", "style", "crop", "technical", "readability", "consistency", "metaphor", "tileability", "brand"), target, problem, suggestedFix (optional object with moveX, moveY, scale, regenerateLayer, simplifyDetail, updateLayout)
- continueIteration: boolean (true if issues remain that need fixing)

Scoring rules:
- If SVG validation summary is invalid, technicalValidity must be 0 and continueIteration must be true.
- If the SVG is valid but sparse, generic, off-layout, visually unclear at small size, or does not use meaningful layers, lower the relevant scores and add concrete issues.
- Do not reward technically valid but visually poor output; overall should reflect craft quality, not just parsability.

Return JSON only, no markdown.`;

  return { system, user };
}
