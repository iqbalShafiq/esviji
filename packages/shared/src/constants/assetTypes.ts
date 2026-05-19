export const ASSET_TYPES = [
  "icon",
  "icon_pack",
  "logo",
  "monogram",
  "app_icon",
  "mascot",
  "character",
  "portrait",
  "empty_state",
  "web_illustration",
  "decorative_asset",
  "sticker",
  "sticker_pack",
  "badge",
  "pattern",
  "background",
  "diagram",
  "infographic",
  "product_illustration",
  "illustration_set",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
