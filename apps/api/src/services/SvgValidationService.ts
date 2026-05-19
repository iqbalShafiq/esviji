import { validateSvg, type SvgValidationResult } from '@svg-builder/svg-core';
import { logger } from '../utils/logger.js';

export class SvgValidationService {
  async validate(svg: string): Promise<SvgValidationResult> {
    const result = validateSvg(svg);
    logger.info(
      {
        valid: result.valid,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        errors: result.errors,
        warnings: result.warnings,
      },
      'SVG validation completed'
    );
    return result;
  }
}
