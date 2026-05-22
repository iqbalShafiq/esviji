declare module '@prisma/client' {
  export class PrismaClient {
    user: UserDelegate;
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

  export interface User {
    id: string;
    username: string;
    email: string;
    passwordHash: string;
    role: string;
    tokenBalance: number;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface Asset {
    id: string;
    ownerId: string | null;
    packId: string | null;
    sourceAssetId: string | null;
    name: string | null;
    prompt: string;
    assetType: string;
    mode: string;
    style: string | null;
    visibility: string;
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
    owner?: User | null;
    pack?: AssetPack | null;
    iterations?: AssetIteration[];
  }

  export interface AssetPack {
    id: string;
    ownerId: string | null;
    sourcePackId: string | null;
    prompt: string;
    assetType: string;
    quantity: number;
    style: string | null;
    visibility: string;
    status: string;
    styleSystem: unknown;
    consistencyScores: unknown | null;
    zipPath: string | null;
    createdAt: Date;
    updatedAt: Date;
    owner?: User | null;
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

  interface UserDelegate {
    create(args: any): Promise<any>;
    upsert(args: any): Promise<any>;
    findUnique(args: any): Promise<any>;
    findFirst(args: any): Promise<any>;
    findMany(args?: any): Promise<any[]>;
    update(args: any): Promise<any>;
  }

  interface AssetDelegate {
    create(args: any): Promise<any>;
    findUnique(args: any): Promise<any>;
    findMany(args?: any): Promise<any[]>;
    update(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
    delete(args: any): Promise<any>;
    count(args?: any): Promise<number>;
    aggregate(args?: any): Promise<any>;
  }

  interface AssetPackDelegate {
    create(args: any): Promise<any>;
    findUnique(args: any): Promise<any>;
    findMany(args?: any): Promise<any[]>;
    update(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
  }

  interface AssetIterationDelegate {
    create(args: any): Promise<any>;
    findMany(args?: any): Promise<any[]>;
    deleteMany(args: any): Promise<{ count: number }>;
  }
}
