import { useMemo, useRef, useState } from "react";
import type { AssetResponse, BackgroundMode, PreviewSize } from "../../types/index.js";
import { formatScore } from "../../lib/formatters.js";
import { resolveApiAssetUrl } from "../../lib/download.js";

interface PreviewCanvasProps {
  asset?: AssetResponse;
  mode: "final" | "debug" | "raw";
  background: BackgroundMode;
  previewSize: PreviewSize;
  isLoading?: boolean;
  isRefining?: boolean;
  currentStage?: string;
  loadingPreviewUrl?: string;
  loadingIteration?: number;
  loadingProgress?: number;
}

export function PreviewCanvas({
  asset,
  mode,
  background,
  previewSize,
  isLoading,
  isRefining,
  currentStage,
  loadingPreviewUrl,
  loadingIteration,
  loadingProgress,
}: PreviewCanvasProps) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    dragStart.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? -1 : 1;
    const next = zoom + direction * 0.08;
    setZoom(Math.max(0.2, Math.min(4, Number(next.toFixed(2)))));
  };

  const bgStyle = useMemo(() => {
    switch (background) {
      case "white":
        return { background: "#ffffff" };
      case "dark":
        return { background: "#1a1a2e" };
      case "blueprint":
        return { background: "#1457d9" };
      case "transparent":
      default:
        return {
          backgroundImage:
            "repeating-conic-gradient(var(--line) 0% 25%, transparent 0% 50%) 50% / 16px 16px",
          backgroundColor: "var(--surface-2)",
        };
    }
  }, [background]);

  const sizeClass = useMemo(() => {
    switch (previewSize) {
      case "16":
        return "w-4 h-4";
      case "24":
        return "w-6 h-6";
      case "48":
        return "w-12 h-12";
      case "128":
        return "w-32 h-32";
      case "full":
      default:
        return "w-full h-full max-w-[512px] max-h-[512px]";
    }
  }, [previewSize]);

  const svgContent = useMemo(() => {
    if (!asset) return null;
    const source = mode === "raw" ? asset.finalSvg : asset.finalSvg;
    return stripBackgroundLayer(source);
  }, [asset, mode]);

  const viewBox = useMemo(() => {
    if (!svgContent) return "";
    const match = svgContent.match(/viewBox=["']([^"']+)["']/);
    return match ? match[1] : "";
  }, [svgContent]);

  const isPattern = asset?.assetType === "pattern";
  const resolvedLoadingPreviewUrl = resolvePreviewUrl(loadingPreviewUrl);

  if (!asset || !svgContent) {
    return (
      <div
        className="w-full h-full flex items-center justify-center relative"
        style={bgStyle}
      >
        {isLoading && resolvedLoadingPreviewUrl && (
          <div
            className={`w-full h-full flex items-center justify-center ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
          >
            <img
              key={resolvedLoadingPreviewUrl}
              src={resolvedLoadingPreviewUrl}
              alt="Iteration preview"
              className="max-w-[512px] max-h-[512px] w-full h-full object-contain animate-[fadeIn_260ms_ease-out] select-none"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              draggable={false}
            />
          </div>
        )}
        {!isLoading && (
          <div className="text-center">
            <p
              className="text-sm font-medium mb-1"
              style={{ color: "var(--muted)" }}
            >
              No asset rendered yet
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Submit a prompt to generate an SVG asset
            </p>
          </div>
        )}
        {isLoading && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center z-10 px-3 py-2 min-w-[140px]" style={{ background: "rgba(255,253,247,0.92)", border: "1px solid var(--line)", boxShadow: "var(--shadow-soft)" }}>
            <div className="relative w-8 h-8 mb-3">
              <div
                className="absolute inset-0 border-2 border-t-transparent animate-spin"
                style={{ borderColor: "var(--blueprint)", borderTopColor: "transparent" }}
              />
            </div>
            <span
              className="text-xs font-mono font-medium"
              style={{ color: "var(--blueprint)" }}
            >
              {(currentStage ? currentStage.charAt(0).toUpperCase() + currentStage.slice(1) : "Initializing")}...
            </span>
            {typeof loadingIteration === "number" && loadingIteration > 0 && (
              <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
                Iteration {loadingIteration}
              </span>
            )}
            <div className="mt-2 w-full h-1.5" style={{ background: "var(--surface-2)" }}>
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${Math.max(8, Math.min(100, loadingProgress ?? 12))}%`, background: "var(--blueprint)" }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex items-center justify-center relative"
      style={bgStyle}
    >
      {/* Loading overlay */}
      {(isLoading || isRefining) && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center z-20 px-3 py-2" style={{ background: "rgba(255,253,247,0.85)", border: "1px solid var(--line)" }}>
          <div className="relative w-8 h-8 mb-3">
            <div
              className="absolute inset-0 border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--blueprint)", borderTopColor: "transparent" }}
            />
          </div>
            <span
              className="text-xs font-mono font-medium"
              style={{ color: "var(--blueprint)" }}
            >
            {isRefining ? "Refining" : (currentStage ?? asset?.currentStage ? (currentStage ?? asset?.currentStage)!.charAt(0).toUpperCase() + (currentStage ?? asset?.currentStage)!.slice(1) : "Initializing")}...
            </span>
            {typeof loadingIteration === "number" && loadingIteration > 0 && (
              <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
                Iteration {loadingIteration}
              </span>
            )}
        </div>
      )}

      {/* Refining overlay */}
      {isRefining && (
        <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: "rgba(255,253,247,0.3)" }}>
          <div className="relative w-12 h-12">
            <div
              className="absolute inset-0 border-t-transparent animate-spin rounded-full"
              style={{ borderColor: "var(--blueprint)", borderTopColor: "transparent", borderWidth: "3px" }}
            />
          </div>
        </div>
      )}

      {/* ViewBox label */}
      {viewBox && (
        <div
          className="absolute top-3 left-3 text-[10px] font-mono px-2 py-1 z-40"
          style={{
            background: "rgba(7,17,31,0.7)",
            color: "#fff",
          }}
        >
          {viewBox}
        </div>
      )}

      {/* Score badge */}
      {asset.evaluation?.scores && Object.keys(asset.evaluation.scores).length > 0 && (
        <div
          className="absolute top-3 right-3 text-[10px] font-mono px-2 py-1 flex items-center gap-1.5 z-40"
          style={{
            background: "rgba(7,17,31,0.7)",
            color: "#fff",
          }}
        >
          <span>Score</span>
          <span className="font-bold">
            {formatScore(
              Object.values(asset.evaluation.scores).reduce(
                (a, b) => a + b,
                0
              ) / Object.values(asset.evaluation.scores).length
            )}
          </span>
        </div>
      )}

      {/* Content */}
        <div
          className={`relative ${sizeClass} ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        >
        {isPattern ? (
          <div
            className="w-full h-full"
            style={{
              backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svgContent)}")`,
              backgroundSize: "64px 64px",
              backgroundRepeat: "repeat",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          />
        ) : (
          <div
            className="w-full h-full animate-[fadeIn_260ms_ease-out]"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center center" }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>
    </div>
  );
}

function resolvePreviewUrl(input?: string): string | undefined {
  if (!input) return undefined;
  return resolveApiAssetUrl(input);
}

function stripBackgroundLayer(svg?: string): string | undefined {
  if (!svg) return svg;
  return svg.replace(/<g\b[^>]*id=["']background["'][^>]*>[\s\S]*?<\/g>/gi, "");
}
