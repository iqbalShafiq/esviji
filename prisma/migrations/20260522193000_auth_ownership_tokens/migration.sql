CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "tokenBalance" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "Asset" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "sourceAssetId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private';
ALTER TABLE "AssetPack" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "AssetPack" ADD COLUMN "sourcePackId" TEXT;
ALTER TABLE "AssetPack" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private';

CREATE INDEX "Asset_ownerId_idx" ON "Asset"("ownerId");
CREATE INDEX "Asset_visibility_idx" ON "Asset"("visibility");
CREATE INDEX "Asset_sourceAssetId_idx" ON "Asset"("sourceAssetId");
CREATE INDEX "AssetPack_ownerId_idx" ON "AssetPack"("ownerId");
CREATE INDEX "AssetPack_visibility_idx" ON "AssetPack"("visibility");
CREATE INDEX "AssetPack_sourcePackId_idx" ON "AssetPack"("sourcePackId");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetPack" ADD CONSTRAINT "AssetPack_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
