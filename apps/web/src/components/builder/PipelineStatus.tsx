import type { AssetResponse } from "../../types/index.js";

interface PipelineStatusProps {
  asset?: AssetResponse;
  isLoading: boolean;
}

export function PipelineStatus({ asset, isLoading }: PipelineStatusProps) {
  if (!isLoading && !asset) return null;

  const stage = asset?.currentStage || "Initializing";
  const stageLabel = stage.charAt(0).toUpperCase() + stage.slice(1);

  return (
    <div className="flex items-center gap-3">
      {isLoading && (
        <div className="relative w-4 h-4">
          <div
            className="absolute inset-0 border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--blueprint)", borderTopColor: "transparent" }}
          />
        </div>
      )}
      <span
        className="text-xs font-mono font-medium"
        style={{ color: "var(--blueprint)" }}
      >
        {isLoading ? `${stageLabel}...` : "Ready"}
      </span>
    </div>
  );
}
