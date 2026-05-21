import type { AssetResponse } from "../../types/index.js";
import { AssetCard } from "./AssetCard.js";

interface AssetGridProps {
  assets: AssetResponse[];
  outlierIds?: string[];
  emptyMessage?: string;
  onRefine?: (asset: AssetResponse) => void;
}

export function AssetGrid({ assets, outlierIds = [], emptyMessage = "Generate a pack to see assets here", onRefine }: AssetGridProps) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2 p-8">
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
          No assets yet
        </p>
        <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid gap-4 p-4 overflow-y-auto h-full"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gridAutoRows: "max-content",
        alignContent: "start",
        alignItems: "start",
      }}
    >
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          isOutlier={outlierIds.includes(asset.id)}
          onRefine={onRefine}
        />
      ))}
    </div>
  );
}
