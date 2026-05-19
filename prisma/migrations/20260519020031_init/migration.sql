-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "packId" TEXT,
    "name" TEXT,
    "prompt" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "style" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "referenceImageUrl" TEXT,
    "finalSvgPath" TEXT,
    "finalPngPath" TEXT,
    "finalDebugPngPath" TEXT,
    "currentIteration" INTEGER NOT NULL DEFAULT 0,
    "finalScores" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPack" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "style" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "styleSystem" JSONB NOT NULL,
    "consistencyScores" JSONB,
    "zipPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetIteration" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "iterationNumber" INTEGER NOT NULL,
    "brief" JSONB NOT NULL,
    "styleSystem" JSONB NOT NULL,
    "referenceAnalysis" JSONB,
    "layout" JSONB NOT NULL,
    "svgDraftPath" TEXT,
    "pngPreviewPath" TEXT,
    "debugPreviewPath" TEXT,
    "scores" JSONB,
    "issues" JSONB,
    "actionTaken" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetIteration_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_packId_fkey" FOREIGN KEY ("packId") REFERENCES "AssetPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIteration" ADD CONSTRAINT "AssetIteration_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
