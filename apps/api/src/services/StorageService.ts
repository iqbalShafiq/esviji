import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

export class StorageService {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.env.LOCAL_STORAGE_DIR || './storage';
  }

  async ensureDir(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true });
  }

  async saveAssetFile(assetId: string, filename: string, data: Buffer | string): Promise<string> {
    const relativeDir = path.join('assets', assetId);
    const absoluteDir = path.join(this.baseDir, relativeDir);
    await this.ensureDir(absoluteDir);
    const absolutePath = path.join(absoluteDir, filename);
    await writeFile(absolutePath, data);
    const relativePath = path.join(relativeDir, filename).replace(/\\/g, '/');
    logger.info({ assetId, filename, relativePath }, 'Saved asset file');
    return relativePath;
  }

  async savePackFile(packId: string, filename: string, data: Buffer | string): Promise<string> {
    const relativeDir = path.join('packs', packId);
    const absoluteDir = path.join(this.baseDir, relativeDir);
    await this.ensureDir(absoluteDir);
    const absolutePath = path.join(absoluteDir, filename);
    await writeFile(absolutePath, data);
    const relativePath = path.join(relativeDir, filename).replace(/\\/g, '/');
    logger.info({ packId, filename, relativePath }, 'Saved pack file');
    return relativePath;
  }

  getAssetFilePath(assetId: string, filename: string): string {
    return path.resolve(this.baseDir, 'assets', assetId, filename);
  }

  getPackFilePath(packId: string, filename: string): string {
    return path.resolve(this.baseDir, 'packs', packId, filename);
  }
}
