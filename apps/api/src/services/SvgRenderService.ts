import { renderSvg, generateDebugOverlay } from '@svg-builder/svg-core';
import type { LayoutBlueprint } from '@svg-builder/shared';
import { StorageService } from './StorageService.js';
import { logger } from '../utils/logger.js';

export class SvgRenderService {
  constructor(private storageService: StorageService) {}

  async render(
    svg: string,
    assetId: string,
    iteration: number,
    width?: number,
    height?: number
  ): Promise<{ pngPath: string; pngUrl: string }> {
    const pngBuffer = await renderSvg(svg, width, height);
    const filename = `${iteration}.png`;
    const relativePath = await this.storageService.saveAssetFile(assetId, filename, pngBuffer);
    const pngPath = this.storageService.getAssetFilePath(assetId, filename);
    logger.info({ assetId, iteration, pngPath }, 'Rendered SVG to PNG');
    return { pngPath, pngUrl: `/${relativePath}` };
  }

  async renderDebug(
    layout: LayoutBlueprint,
    svg: string,
    assetId: string,
    iteration: number
  ): Promise<{ debugPngPath: string }> {
    const debugSvg = generateDebugOverlay(layout, svg);
    const pngBuffer = await renderSvg(debugSvg);
    const filename = `debug-${iteration}.png`;
    const debugPngPath = this.storageService.getAssetFilePath(assetId, filename);
    await this.storageService.saveAssetFile(assetId, filename, pngBuffer);
    logger.info({ assetId, iteration, debugPngPath }, 'Rendered debug overlay to PNG');
    return { debugPngPath };
  }
}
