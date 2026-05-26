import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { deleteAsset, listAssets, cloneAsset, assignAssetToPack } from "../lib/api.js";
import type { AssetListItem } from "../lib/api.js";
import { StudioFrame } from "../components/layout/StudioFrame.js";
import { ConfirmationDialog } from "../components/common/ConfirmationDialog.js";
import { DuplicateDialog } from "../components/common/DuplicateDialog.js";
import { useState } from "react";

function getDefaultDuplicateName(baseName: string, existingNames: string[]): string {
  const copyRegex = new RegExp(`^${escapeRegex(baseName)} - copy \\((\\d+)\\)$`);
  let maxCopy = 0;

  for (const name of existingNames) {
    const match = name.match(copyRegex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxCopy) maxCopy = num;
    }
  }

  return `${baseName} - copy (${maxCopy + 1})`;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function AssetHistoryCard({
  asset,
  onDelete,
  onDuplicate,
}: {
  asset: AssetListItem;
  onDelete: (asset: AssetListItem) => void;
  onDuplicate: (asset: AssetListItem) => void;
}) {
  const previewUrl = asset.latestPngPreviewPath || asset.finalPngPath || undefined;
  const hasBestIteration = asset.bestIterationNumber && asset.bestIterationNumber > 0;
  const overallScore = asset.latestScores?.overall ?? 0;

  return (
    <article
      className="group relative flex flex-col gap-3 border p-4 transition-all hover:border-[var(--blueprint)]"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <Link to={`/assets/${asset.id}`} className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3
              className="text-sm font-semibold truncate"
              style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}
            >
              {asset.name || asset.prompt}
            </h3>
            <p className="text-xs mt-1 truncate" style={{ color: "var(--muted)" }}>
              {asset.prompt}
            </p>
          </div>
          {overallScore > 0 && (
            <span
              className="text-xs font-mono px-2 py-1 shrink-0"
              style={{
                background: scoreColor(overallScore),
                color: "#ffffff",
              }}
            >
              {overallScore.toFixed(1)}
            </span>
          )}
        </div>

        <div className="aspect-square w-full overflow-hidden border flex items-center justify-center"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={asset.prompt}
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              No preview
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono" style={{ color: "var(--muted)" }}>
          <div className="flex min-w-0 flex-wrap gap-2">
            <span className="px-1.5 py-0.5 border" style={{ borderColor: "var(--line)" }}>
              {asset.assetType}
            </span>
            <span className="px-1.5 py-0.5 border" style={{ borderColor: "var(--line)" }}>
              {asset.mode}
            </span>
            {asset.pack && (
              <span
                className="max-w-full truncate px-1.5 py-0.5 border"
                style={{
                  borderColor: "rgba(0, 168, 200, 0.45)",
                  background: "rgba(0, 168, 200, 0.12)",
                  color: "var(--cyan)",
                }}
                title={asset.pack.prompt}
              >
                {asset.pack.prompt}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasBestIteration && (
              <span className="px-1.5 py-0.5 border border-dashed" style={{ borderColor: "var(--blueprint)", color: "var(--blueprint)" }}>
                Best #{asset.bestIterationNumber}
              </span>
            )}
            <span>#{asset.currentIteration} iterations</span>
          </div>
        </div>
      </Link>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px]" style={{ color: "var(--muted)" }}>
          {formatDate(asset.createdAt)}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-2.5 py-1.5 text-[10px] font-semibold transition-colors disabled:opacity-50"
            style={{ background: "var(--bg)", color: "var(--ink)", border: "1px solid var(--line)" }}
            onClick={() => onDuplicate(asset)}
            aria-label={`Duplicate ${asset.name || asset.prompt}`}
            title="Duplicate asset"
          >
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6 1.5H10.5C11.6046 1.5 12.5 2.39543 12.5 3.5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Duplicate
            </span>
          </button>
          <button
            type="button"
            className="px-2.5 py-1.5 text-[10px] font-semibold transition-colors"
            style={{ background: "var(--red)", color: "#ffffff" }}
            onClick={() => onDelete(asset)}
            aria-label={`Delete ${asset.name || asset.prompt}`}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function scoreColor(score: number): string {
  if (score >= 8) return "var(--green, #22c55e)";
  if (score >= 6) return "var(--yellow, #eab308)";
  if (score >= 4) return "var(--orange, #f97316)";
  return "var(--red, #ef4444)";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const queryClient = useQueryClient();
  const [assetToDelete, setAssetToDelete] = useState<AssetListItem | undefined>();
  const [assetToDuplicate, setAssetToDuplicate] = useState<AssetListItem | undefined>();
  const { data: assets, isLoading, error } = useQuery({
    queryKey: ["assets", "list"],
    queryFn: listAssets,
  });

  const deleteMutation = useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId),
    onSuccess: async () => {
      setAssetToDelete(undefined);
      await queryClient.invalidateQueries({ queryKey: ["assets", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["packs", "list"] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async ({ asset, name }: { asset: AssetListItem; name: string }) => {
      const cloned = await cloneAsset(asset.id, name);
      if (asset.packId) {
        await assignAssetToPack(cloned.id, asset.packId);
      }
      return cloned;
    },
    onSuccess: async (_, { asset }) => {
      setAssetToDuplicate(undefined);
      await queryClient.invalidateQueries({ queryKey: ["assets", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["pack", asset.packId] });
      await queryClient.invalidateQueries({ queryKey: ["packs", "list"] });
    },
  });

  const defaultDuplicateName = assetToDuplicate
    ? getDefaultDuplicateName(
        assetToDuplicate.name || assetToDuplicate.prompt,
        (assets || []).map((a) => a.name || a.prompt)
      )
    : "";

  return (
    <StudioFrame>
      <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-80 animate-pulse"
                  style={{ background: "var(--surface-2)" }}
                />
              ))}
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2">
              <p className="text-sm font-medium" style={{ color: "var(--red)" }}>
                Failed to load history
              </p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
          )}

          {!isLoading && !error && assets && assets.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2">
              <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
                No generated assets yet
              </p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Generate your first SVG asset to see it here
              </p>
              <Link
                to="/assets/new"
                className="mt-2 text-xs font-semibold px-4 py-2 transition-colors"
                style={{ background: "var(--blueprint)", color: "#ffffff" }}
              >
                Generate Asset
              </Link>
            </div>
          )}

          {!isLoading && !error && assets && assets.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {assets.map((asset) => (
                <AssetHistoryCard
                  key={asset.id}
                  asset={asset}
                  onDelete={setAssetToDelete}
                  onDuplicate={setAssetToDuplicate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmationDialog
        open={Boolean(assetToDelete)}
        title="Delete this asset?"
        description={`This removes "${
          assetToDelete?.name || assetToDelete?.prompt || "this asset"
        }" from history and clears its generated iterations. This action cannot be undone.`}
        confirmLabel="Delete Asset"
        intent="danger"
        isPending={deleteMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setAssetToDelete(undefined);
        }}
        onConfirm={() => {
          if (assetToDelete) deleteMutation.mutate(assetToDelete.id);
        }}
      />
      <DuplicateDialog
        open={Boolean(assetToDuplicate)}
        title="Duplicate Asset"
        defaultName={defaultDuplicateName}
        isPending={duplicateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setAssetToDuplicate(undefined);
        }}
        onConfirm={(name) => {
          if (assetToDuplicate) {
            duplicateMutation.mutate({ asset: assetToDuplicate, name });
          }
        }}
      />
    </StudioFrame>
  );
}
