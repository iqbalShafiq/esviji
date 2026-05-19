import { useMemo } from "react";
import type { AssetResponse } from "../../types/index.js";
import { downloadSvg, downloadPng } from "../../lib/download.js";

interface AssetCardProps {
  asset: AssetResponse;
  isOutlier?: boolean;
  onRefine?: (asset: AssetResponse) => void;
}

function getScoreColor(score: number): string {
  if (score >= 85) return "var(--green)";
  if (score >= 60) return "var(--amber)";
  return "var(--red)";
}

function getStatusBadge(status: AssetResponse["status"]) {
  switch (status) {
    case "pending":
      return { label: "Pending", color: "var(--muted)", bg: "var(--surface-2)" };
    case "building":
      return { label: "Processing", color: "var(--blueprint)", bg: "rgba(20, 87, 217, 0.08)" };
    case "completed":
      return { label: "Completed", color: "var(--green)", bg: "rgba(47, 158, 68, 0.08)" };
    case "failed":
      return { label: "Failed", color: "var(--red)", bg: "rgba(214, 69, 69, 0.08)" };
    default:
      return { label: status, color: "var(--muted)", bg: "var(--surface-2)" };
  }
}

export function AssetCard({ asset, isOutlier, onRefine }: AssetCardProps) {
  const avgScore = useMemo(() => {
    if (!asset.evaluation?.scores) return null;
    const values = Object.values(asset.evaluation.scores);
    if (values.length === 0) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }, [asset.evaluation?.scores]);

  const statusBadge = getStatusBadge(asset.status);

  const previewSrc = asset.finalPngUrl || (asset.finalSvg ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(asset.finalSvg)))}` : null);

  return (
    <div
      className="flex flex-col gap-2.5 p-3 border transition-all hover:-translate-y-0.5"
      style={{
        background: "var(--surface)",
        borderColor: isOutlier ? "var(--amber)" : "var(--line)",boxShadow: isOutlier ? "0 0 0 1px var(--amber)" : undefined,
      }}
    >
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{
          aspectRatio: "1 / 1",
          background: "var(--surface-2)",}}
      >
        {previewSrc ? (
          <img
            src={previewSrc}
            alt={asset.prompt}
            className="w-3/4 h-3/4 object-contain"
          />
        ) : (
          <div
            className="w-8 h-8 animate-pulse"
            style={{ background: "var(--line)" }}
          />
        )}

        {isOutlier && (
          <span
            className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5"
            style={{
              background: "var(--amber)",
              color: "#fff",
            }}
          >
            Outlier
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <p
            className="text-sm font-medium truncate"
            style={{ color: "var(--ink)", fontFamily: "var(--font-body)" }}
            title={asset.prompt}
          >
            {asset.prompt}
          </p>
          {avgScore !== null && (
            <span
              className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded shrink-0"
              style={{
                color: getScoreColor(avgScore),
                background: `${getScoreColor(avgScore)}14`,
              }}
            >
              {avgScore}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-mono px-2 py-0.5"
            style={{ color: statusBadge.color, background: statusBadge.bg }}
          >
            {statusBadge.label}
          </span>
        </div>

        <div className="flex items-center gap-1.5 mt-1">
          {asset.finalSvg && (
            <button
              type="button"
              onClick={() => downloadSvg(asset.finalSvg!, `${asset.id}.svg`)}
              className="p-1.5 border transition-all active:scale-95"
              title="Download SVG"
              style={{
                borderColor: "var(--line)",color: "var(--ink)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1V9M7 9L4 6M7 9L10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M1 10V12C1 12.5523 1.44772 13 2 13H12C12.5523 13 13 12.5523 13 12V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {asset.finalPngUrl && (
            <button
              type="button"
              onClick={() => downloadPng(asset.finalPngUrl!, `${asset.id}.png`)}
              className="p-1.5 border transition-all active:scale-95"
              title="Download PNG"
              style={{
                borderColor: "var(--line)",color: "var(--ink)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1V9M7 9L4 6M7 9L10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M1 10V12C1 12.5523 1.44772 13 2 13H12C12.5523 13 13 12.5523 13 12V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={() => onRefine?.(asset)}
            className="p-1.5 border transition-all active:scale-95 ml-auto"
            title="Refine"
            style={{
              borderColor: "var(--line)",color: "var(--ink)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 7C1 7 3 3 7 3C11 3 13 7 13 7C13 7 11 11 7 11C3 11 1 7 1 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
