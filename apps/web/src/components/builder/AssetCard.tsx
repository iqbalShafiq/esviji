import { useMemo } from "react";
import type { AssetResponse } from "../../types/index.js";
import { downloadSvg, downloadPng } from "../../lib/download.js";

interface AssetCardProps {
  asset: AssetResponse;
  isOutlier?: boolean;
  onRefine?: (asset: AssetResponse) => void;
  onDelete?: (asset: AssetResponse) => void;
  onDuplicate?: (asset: AssetResponse) => void;
  isDeleting?: boolean;
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

export function AssetCard({ asset, isOutlier, onRefine, onDelete, onDuplicate, isDeleting = false }: AssetCardProps) {
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
      className="group flex h-auto max-w-[240px] flex-col gap-2.5 border p-3 transition-all hover:-translate-y-0.5"
      style={{
        background: "var(--surface)",
        borderColor: isOutlier ? "var(--amber)" : "var(--line)",boxShadow: isOutlier ? "0 0 0 1px var(--amber)" : undefined,
      }}
    >
      <button
        type="button"
        className="relative flex w-full items-center justify-center overflow-hidden focus:outline-none focus:ring-2"
        style={{
          aspectRatio: "1 / 1",
          background: "var(--surface-2)",}}
        onClick={() => onRefine?.(asset)}
        title="Preview asset"
      >
        {previewSrc ? (
          <img
            src={previewSrc}
            alt={asset.prompt}
            className="h-3/4 w-3/4 object-contain transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div
            className="w-8 h-8 animate-pulse"
            style={{ background: "var(--line)" }}
          />
        )}

        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ background: "rgba(7, 17, 31, 0.42)", color: "#ffffff" }}
        >
          <span
            className="flex h-10 w-10 items-center justify-center"
            style={{ background: "rgba(255, 255, 255, 0.16)", border: "1px solid rgba(255, 255, 255, 0.42)" }}
          >
            <svg width="18" height="18" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 7C1 7 3 3 7 3C11 3 13 7 13 7C13 7 11 11 7 11C3 11 1 7 1 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
        </span>

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
      </button>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <p
            className="text-sm font-medium truncate"
            style={{ color: "var(--ink)", fontFamily: "var(--font-body)" }}
            title={asset.name || asset.prompt}
          >
            {asset.name || asset.prompt}
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

          {onDuplicate && (
            <button
              type="button"
              onClick={() => onDuplicate(asset)}
              className="p-1.5 border transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              title="Duplicate asset"
              style={{
                borderColor: "var(--line)",
                color: "var(--ink)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6 1.5H10.5C11.6046 1.5 12.5 2.39543 12.5 3.5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(asset)}
              className="ml-auto p-1.5 border transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              title="Delete SVG from pack"
              disabled={isDeleting}
              style={{
                borderColor: "var(--line)",
                color: "var(--red)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 3.5H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M5.5 1.5H8.5M4 3.5L4.5 12H9.5L10 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 6V10M8 6V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
