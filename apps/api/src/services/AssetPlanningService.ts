import type { AssetTypeClassification, CreativeBrief, StyleSystem } from '@svg-builder/shared';

export class AssetPlanningService {
  async plan(
    classification: AssetTypeClassification,
    brief: CreativeBrief,
    styleSystem: StyleSystem,
    referenceAnalysis?: unknown
  ): Promise<{ strategy: string; hints: string; referenceAnalysis?: unknown }> {
    const hints = this.generateHints(classification, brief, styleSystem);

    return {
      strategy: classification.assetType,
      hints,
      referenceAnalysis,
    };
  }

  private generateHints(
    classification: AssetTypeClassification,
    brief: CreativeBrief,
    _styleSystem: StyleSystem
  ): string {
    const parts: string[] = [];

    parts.push(`Asset type: ${classification.assetType}`);
    parts.push(`Use case: ${classification.useCase}`);
    parts.push(`Style: ${brief.style.category}, ${brief.style.mood}`);
    parts.push(`Composition: ${brief.composition.canvas}`);

    if (classification.requiresConsistency) {
      parts.push('Ensure visual consistency across all elements.');
    }
    if (classification.requiresSmallSizeReadability) {
      parts.push('Optimize for small size readability.');
    }
    if (classification.requiresTileability) {
      parts.push('Design with tiling/repetition in mind.');
    }
    if (classification.requiresBrandOriginality) {
      parts.push('Maintain brand originality and uniqueness.');
    }
    if (classification.requiresReferenceMatching) {
      parts.push('Match the reference image closely.');
    }

    return parts.join(' | ');
  }
}
