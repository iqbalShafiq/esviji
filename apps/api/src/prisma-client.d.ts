declare module '@prisma/client' {
  export class PrismaClient {
    asset: AssetDelegate;
    assetPack: AssetPackDelegate;
    assetIteration: AssetIterationDelegate;
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    $transaction(queries: Promise<unknown>[]): Promise<unknown[]>;
  }

  export namespace Prisma {
    export const JsonNull: 'JsonNull';
    export type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];
  }

  export interface Asset {
    id: string;
    packId: string | null;
    name: string | null;
    prompt: string;
    assetType: string;
    mode: string;
    style: string | null;
    status: string;
    width: number;
    height: number;
    referenceImageUrl: string | null;
    finalSvgPath: string | null;
    finalPngPath: string | null;
    finalDebugPngPath: string | null;
    currentIteration: number;
    bestIterationNumber: number | null;
    finalScores: unknown | null;
    createdAt: Date;
    updatedAt: Date;
    pack?: AssetPack | null;
    iterations?: AssetIteration[];
  }

  export interface AssetPack {
    id: string;
    prompt: string;
    assetType: string;
    quantity: number;
    style: string | null;
    status: string;
    styleSystem: unknown;
    consistencyScores: unknown | null;
    zipPath: string | null;
    createdAt: Date;
    updatedAt: Date;
    assets?: Asset[];
  }

  export interface AssetIteration {
    id: string;
    assetId: string;
    iterationNumber: number;
    brief: unknown;
    styleSystem: unknown;
    referenceAnalysis: unknown | null;
    layout: unknown;
    svgDraftPath: string | null;
    pngPreviewPath: string | null;
    debugPreviewPath: string | null;
    scores: unknown | null;
    issues: unknown | null;
    actionTaken: unknown | null;
    createdAt: Date;
    asset?: Asset;
  }

  interface AssetDelegate {
    create(args: { data: Partial<Asset> }): Promise<Asset>;
    findUnique(args: {
      where: { id: string };
      include?: {
        pack?: boolean;
        iterations?: { orderBy?: { iterationNumber?: 'asc' | 'desc' }; take?: number };
      };
      select?: Partial<Record<keyof Asset, boolean>>;
    }): Promise<(Asset & { pack?: AssetPack | null; iterations: AssetIteration[] }) | null>;
    findMany(args?: {
      where?: { packId?: string };
      orderBy?: { createdAt?: 'asc' | 'desc' } | Array<{ createdAt?: 'asc' | 'desc' }>;
      include?: {
        pack?: boolean;
        iterations?: { orderBy?: { iterationNumber?: 'asc' | 'desc' }; take?: number };
      };
    }): Promise<(Asset & { pack?: AssetPack | null; iterations?: AssetIteration[] })[]>;
    update(args: { where: { id: string }; data: Partial<Asset> }): Promise<Asset>;
    delete(args: { where: { id: string } }): Promise<Asset>;
    count(args?: { where?: { packId?: string | null } }): Promise<number>;
  }

  interface AssetPackDelegate {
    create(args: { data: Partial<AssetPack> }): Promise<AssetPack>;
    findUnique(args: {
      where: { id: string };
      include?: {
        assets?:
          | boolean
          | { select?: Partial<Record<keyof Asset, boolean>>; include?: { iterations?: { orderBy?: { iterationNumber?: 'asc' | 'desc' } } } };
      };
    }): Promise<(AssetPack & { assets: (Asset & { iterations?: AssetIteration[] })[] }) | null>;
    findMany(args?: {
      orderBy?: { createdAt?: 'asc' | 'desc'; updatedAt?: 'asc' | 'desc' };
      include?: {
        assets?: boolean | { select?: Partial<Record<keyof Asset, boolean>> };
      };
    }): Promise<(AssetPack & { assets: Asset[] })[]>;
    update(args: { where: { id: string }; data: Partial<AssetPack> }): Promise<AssetPack>;
  }

  interface AssetIterationDelegate {
    create(args: { data: Partial<AssetIteration> }): Promise<AssetIteration>;
    findMany(args?: {
      where?: { assetId?: string };
      orderBy?: { iterationNumber?: 'desc' | 'asc' };
    }): Promise<AssetIteration[]>;
    deleteMany(args: { where: { assetId: string } }): Promise<{ count: number }>;
  }
}
