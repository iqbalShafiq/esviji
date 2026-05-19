import { optimizeSvg, type OptimizeResult } from '@svg-builder/svg-core';
import { logger } from '../utils/logger.js';

export class SvgOptimizerService {
  async optimize(svg: string): Promise<OptimizeResult> {
    const result = await optimizeSvg(svg);
    logger.info(
      {
        sizeBeforeBytes: result.sizeBeforeBytes,
        sizeAfterBytes: result.sizeAfterBytes,
        reductionPercent: Number(
          (
            ((result.sizeBeforeBytes - result.sizeAfterBytes) / result.sizeBeforeBytes) *
            100
          ).toFixed(2)
        ),
      },
      'SVG optimized'
    );
    return result;
  }
}
