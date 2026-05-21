import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listAssets } from "../lib/api.js";
import type { AssetListItem } from "../lib/api.js";
import { StudioFrame } from "../components/layout/StudioFrame.js";

function AssetHistoryCard({ asset }: { asset: AssetListItem }) {
  const previewUrl = asset.latestPngPreviewPath || asset.finalPngPath || undefined;
  const hasBestIteration = asset.bestIterationNumber && asset.bestIterationNumber > 0;
  const overallScore = asset.latestScores?.overall ?? 0;

  return (
    <Link
      to={`/assets/new?load=${asset.id}`}
      className="group flex flex-col gap-3 p-4 border transition-all hover:border-[var(--blueprint)]"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
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
        <div className="flex flex-wrap gap-2">
          <span className="px-1.5 py-0.5 border" style={{ borderColor: "var(--line)" }}>
            {asset.assetType}
          </span>
          <span className="px-1.5 py-0.5 border" style={{ borderColor: "var(--line)" }}>
            {asset.mode}
          </span>
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

      <p className="text-[10px]" style={{ color: "var(--muted)" }}>
        {formatDate(asset.createdAt)}
      </p>
    </Link>
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
  const { data: assets, isLoading, error } = useQuery({
    queryKey: ["assets", "list"],
    queryFn: listAssets,
  });

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
                <AssetHistoryCard key={asset.id} asset={asset} />
              ))}
            </div>
          )}
        </div>
      </div>
    </StudioFrame>
  );
}
