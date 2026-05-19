declare module '@prisma/client' {
  export class PrismaClient {
    asset: AssetDelegate;
    assetPack: AssetPackDelegate;
    assetIteration: AssetIterationDelegate;
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
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
      include?: { iterations?: { orderBy?: { iterationNumber?: 'asc' | 'desc' }; take?: number } };
    }): Promise<(Asset & { iterations: AssetIteration[] }) | null>;
    findMany(args?: { where?: { packId?: string } }): Promise<Asset[]>;
    update(args: { where: { id: string }; data: Partial<Asset> }): Promise<Asset>;
  }

  interface AssetPackDelegate {
    create(args: { data: Partial<AssetPack> }): Promise<AssetPack>;
    findUnique(args: {
      where: { id: string };
      include?: { assets?: boolean };
    }): Promise<(AssetPack & { assets: Asset[] }) | null>;
    update(args: { where: { id: string }; data: Partial<AssetPack> }): Promise<AssetPack>;
  }

  interface AssetIterationDelegate {
    create(args: { data: Partial<AssetIteration> }): Promise<AssetIteration>;
    findMany(args?: {
      where?: { assetId?: string };
      orderBy?: { iterationNumber?: 'desc' | 'asc' };
    }): Promise<AssetIteration[]>;
  }
}
