export const QUALITY_THRESHOLDS: Record<string, Record<string, number>> = {
  icon: {
    readabilitySmallSize: 88,
    gridAlignment: 85,
    metaphorClarity: 80,
    styleConsistency: 85,
    technicalValidity: 100,
  },
  icon_pack: {
    styleConsistencyAcrossPack: 85,
    strokeConsistency: 90,
    paletteConsistency: 90,
    gridConsistency: 85,
    technicalValidity: 100,
  },
  logo: {
    brandFit: 80,
    geometricBalance: 88,
    monochromeReadability: 88,
    smallSizeReadability: 85,
    technicalValidity: 100,
  },
  illustration: {
    composition: 85,
    styleMatch: 80,
    visualHierarchy: 80,
    proportion: 80,
    technicalValidity: 100,
  },
  pattern: {
    seamlessness: 85,
    motifBalance: 80,
    densityControl: 80,
    styleConsistency: 85,
    technicalValidity: 100,
  },
};
