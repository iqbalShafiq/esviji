export function buildAssetTypeClassifierPrompt(params: {
  prompt: string;
  explicitAssetType?: string;
  quantity?: number;
  width: number;
  height: number;
  useCase?: string;
  hasReference: boolean;
}): { system: string; user: string } {
  const system = `You are an SVG asset type classifier. Analyze the user's request and determine the appropriate asset type, quantity, use case, and special requirements. Return JSON only.`;

  const user = `Please classify the following SVG asset request.

User prompt: "${params.prompt}"
${params.explicitAssetType ? `Explicit asset type: ${params.explicitAssetType}` : ""}
${params.quantity ? `Requested quantity: ${params.quantity}` : ""}
Canvas size: ${params.width}x${params.height}
${params.useCase ? `Use case: ${params.useCase}` : ""}
Has reference image: ${params.hasReference}

Return a JSON object matching AssetTypeClassification with these fields:
- assetType: string (e.g., "icon", "illustration", "logo", "pattern")
- quantity: number
- useCase: enum ("web_app", "mobile_app", "landing_page", "brand_identity", "sticker", "presentation", "general")
- requiresConsistency: boolean
- requiresSmallSizeReadability: boolean
- requiresTileability: boolean
- requiresBrandOriginality: boolean
- requiresReferenceMatching: boolean

Return JSON only, no markdown.`;

  return { system, user };
}
