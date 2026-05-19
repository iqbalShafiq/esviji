import { generateDebugOverlay, renderSvg } from '@svg-builder/svg-core';
import { StorageService } from './StorageService.js';
import { logger } from '../utils/logger.js';

export class DebugOverlayService {
  constructor(private storageService: StorageService) {}

  async generate(
    layout: any,
    svg: string,
    assetId: string,
    iteration: number
  ): Promise<{ debugSvgPath: string; debugPngPath: string }> {
    const debugSvg = generateDebugOverlay(layout, svg);
    const svgFilename = `debug-${iteration}.svg`;
    const pngFilename = `debug-${iteration}.png`;

    const debugSvgPath = this.storageService.getAssetFilePath(assetId, svgFilename);
    const debugPngPath = this.storageService.getAssetFilePath(assetId, pngFilename);

    await this.storageService.saveAssetFile(assetId, svgFilename, debugSvg);

    const shouldRenderDebugPng = process.env.RENDER_DEBUG_OVERLAY_PNG === 'true';
    if (!shouldRenderDebugPng) {
      logger.info(
        { assetId, iteration, debugSvgPath },
        'Skipped debug overlay PNG render (RENDER_DEBUG_OVERLAY_PNG!=true)'
      );
      return { debugSvgPath, debugPngPath: '' };
    }

    try {
      const pngBuffer = await renderSvg(debugSvg);
      await this.storageService.saveAssetFile(assetId, pngFilename, pngBuffer);
      logger.info({ assetId, iteration, debugSvgPath, debugPngPath }, 'Generated debug overlay');
      return { debugSvgPath, debugPngPath };
    } catch (error) {
      logger.warn(
        { assetId, iteration, error },
        'Debug overlay PNG render failed; continuing without debug PNG'
      );
      return { debugSvgPath, debugPngPath: '' };
    }
  }
}
