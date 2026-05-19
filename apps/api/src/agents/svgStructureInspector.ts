export interface SvgStructureInspection {
  groupCount: number;
  pathCount: number;
  shapeCount: number;
  uniqueFillCount: number;
  ids: string[];
  hasViewBox: boolean;
  hasExternalReferences: boolean;
  hasBlockedElements: boolean;
  likelyLowComplexity: boolean;
}

export function inspectSvgStructure(svg: string): SvgStructureInspection {
  const ids = [...svg.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const fills = [...svg.matchAll(/\bfill=["']([^"']+)["']/gi)]
    .map((match) => match[1].trim().toLowerCase())
    .filter((fill) => fill !== 'none' && !fill.startsWith('url('));
  const groupCount = (svg.match(/<g\b/gi) ?? []).length;
  const pathCount = (svg.match(/<path\b/gi) ?? []).length;
  const shapeCount =
    (svg.match(/<(rect|circle|ellipse|polygon|polyline|line)\b/gi) ?? []).length + pathCount;
  const blackFillCount = fills.filter((fill) => /^#0{3,6}$/.test(fill)).length;

  return {
    groupCount,
    pathCount,
    shapeCount,
    uniqueFillCount: new Set(fills).size,
    ids,
    hasViewBox: /\bviewBox\s*=/i.test(svg),
    hasExternalReferences: /\b(?:href|src|xlink:href)=["'](?:https?:|data:|javascript:|file:|ftp:)/i.test(svg),
    hasBlockedElements: /<(script|foreignObject|iframe|image|style|link|object|embed)\b/i.test(svg),
    likelyLowComplexity: groupCount < 2 || shapeCount < 3 || (shapeCount <= 4 && blackFillCount >= 1),
  };
}
