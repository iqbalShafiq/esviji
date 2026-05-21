import { createWriteStream } from 'fs';
import type { WriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import type { Asset } from '@prisma/client';
import type { StorageService } from './StorageService.js';
import { logger } from '../utils/logger.js';

const require = createRequire(import.meta.url);
const archiverModule = require('archiver') as ArchiverModule;

type ZipArchiveOptions = { zlib: { level: number } };
type ArchiveInstance = {
  pointer(): number;
  on(event: 'error' | 'warning', listener: (error: Error) => void): ArchiveInstance;
  pipe(output: WriteStream): void;
  file(source: string, data: { name: string }): void;
  append(source: string | Buffer, data: { name: string }): void;
  finalize(): void;
};
type LegacyArchiverFactory = (format: 'zip', options: ZipArchiveOptions) => ArchiveInstance;
type ArchiverModule =
  | LegacyArchiverFactory
  | {
      default?: LegacyArchiverFactory;
      ZipArchive?: new (options: ZipArchiveOptions) => ArchiveInstance;
    };

export class ZipExportService {
  constructor(private storageService: StorageService) {}

  async createZip(
    packId: string,
    assets: Asset[],
    packMetadata?: unknown,
    styleSystem?: unknown
  ): Promise<string> {
    const packDir = this.storageService.getPackFilePath(packId, '');
    await mkdir(packDir, { recursive: true });

    const zipPath = path.join(packDir, 'pack.zip');
    const output = createWriteStream(zipPath);
    const archive = createZipArchive({ zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        logger.info(
          { packId, totalBytes: archive.pointer() },
          'Pack ZIP created'
        );
        resolve(zipPath);
      });

      archive.on('error', (err: Error) => {
        logger.error({ packId, error: err }, 'Failed to create pack ZIP');
        reject(err);
      });

      archive.on('warning', (err: Error) => {
        logger.warn({ packId, error: err }, 'Pack ZIP warning');
      });

      archive.pipe(output);

      // Add each asset's files
      for (const asset of assets) {
        if (asset.finalSvgPath) {
          const svgPath = this.storageService.getAssetFilePath(
            asset.id,
            'final.svg'
          );
          archive.file(svgPath, {
            name: `assets/${asset.id}/final.svg`,
          });
        }
        if (asset.finalPngPath) {
          const pngFileName = path.basename(asset.finalPngPath);
          const pngPath = this.storageService.getAssetFilePath(
            asset.id,
            pngFileName
          );
          archive.file(pngPath, {
            name: `assets/${asset.id}/${pngFileName}`,
          });
        }
      }

      // Add metadata
      if (packMetadata) {
        archive.append(JSON.stringify(packMetadata, null, 2), {
          name: 'pack-metadata.json',
        });
      }

      // Add style system
      if (styleSystem) {
        archive.append(JSON.stringify(styleSystem, null, 2), {
          name: 'style-system.json',
        });
      }

      archive.finalize();
    });
  }
}

function createZipArchive(options: ZipArchiveOptions): ArchiveInstance {
  if (typeof archiverModule === 'function') {
    return archiverModule('zip', options);
  }

  if (typeof archiverModule.default === 'function') {
    return archiverModule.default('zip', options);
  }

  if (archiverModule.ZipArchive) {
    return new archiverModule.ZipArchive(options);
  }

  throw new Error('Unsupported archiver module shape');
}
