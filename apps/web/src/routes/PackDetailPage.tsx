import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/layout/AppShell.js";
import { StudioFrame } from "../components/layout/StudioFrame.js";
import { AssetGrid } from "../components/builder/AssetGrid.js";
import { PackConsistencyPanel } from "../components/builder/PackConsistencyPanel.js";
import { getPack } from "../lib/api.js";
import type { AssetResponse } from "../types/index.js";

export default function PackDetailPage() {
  const { packId } = useParams<{ packId: string }>();

  const { data: pack, isLoading, error } = useQuery({
    queryKey: ["pack", packId],
    queryFn: () => getPack(packId!),
    enabled: !!packId,
  });

  const handleRefine = (asset: AssetResponse) => {
    // Navigate to asset detail — the AssetCard refine button navigates,
    // but in detail page we may want a different behavior.
    // For now, we'll open the asset in a new tab or navigate.
    window.open(`/assets/${asset.id}`, "_blank");
  };

  const outlierIds = pack?.outliers?.map((o) => o.assetId) || [];

  return (
    <StudioFrame>
      <AppShell
        leftPanel={
          <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
            {pack && (
              <>
                <div
                  className="p-4 border flex flex-col gap-3"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--surface)",}}
                >
                  <div className="flex items-center gap-2">
                    <Link
                      to="/packs/new"
                      className="text-xs font-medium hover:underline"
                      style={{ color: "var(--blueprint)" }}
                    >
                      &larr; New Pack
                    </Link>
                  </div>
                  <h2
                    className="text-sm font-semibold"
                    style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}
                  >
                    {pack.prompt}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className="text-[10px] font-mono px-2 py-1 border"
                      style={{
                        borderColor: "var(--line)",
                        color: "var(--muted)",
                        background: "var(--bg)",
                      }}
                    >
                      {pack.assetType}
                    </span>
                    <span
                      className="text-[10px] font-mono px-2 py-1 border"
                      style={{
                        borderColor: "var(--line)",
                        color: "var(--muted)",
                        background: "var(--bg)",
                      }}
                    >
                      {pack.quantity} items
                    </span>
                    <span
                      className="text-[10px] font-mono px-2 py-1 border"
                      style={{
                        borderColor: "var(--line)",
                        color: "var(--muted)",
                        background: "var(--bg)",
                      }}
                    >
                      {pack.output?.width ?? 48}&times;{pack.output?.height ?? 48}
                    </span>
                  </div>
                </div>

                {/* Outlier Report */}
                {pack.outliers && pack.outliers.length > 0 && (
                  <div
                    className="p-4 border flex flex-col gap-3"
                    style={{
                      borderColor: "var(--amber)",
                      background: "var(--surface)",}}
                  >
                    <h3
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}
                    >
                      Outlier Report
                    </h3>
                    <div className="flex flex-col gap-2">
                      {pack.outliers.map((o, i) => (
                        <div
                          key={`${o.assetId}-${i}`}
                          className="flex flex-col gap-1"
                        >
                          <span
                            className="text-xs font-medium"
                            style={{ color: "var(--ink)" }}
                          >
                            {o.name}
                          </span>
                          <span
                            className="text-[10px]"
                            style={{ color: "var(--red)" }}
                          >
                            {o.problem}
                          </span>
                          {o.suggestedFix && (
                            <span
                              className="text-[10px] font-mono"
                              style={{ color: "var(--muted)" }}
                            >
                              Fix: {o.suggestedFix}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Consistency Scores */}
                {pack.consistencyScores && (
                  <div
                    className="p-4 border flex flex-col gap-3"
                    style={{
                      borderColor: "var(--line)",
                      background: "var(--surface)",}}
                  >
                    <h3
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
                    >
                      Consistency Scores
                    </h3>
                    <pre
                      className="text-[10px] font-mono p-2 border overflow-auto"
                      style={{
                        background: "var(--bg)",
                        borderColor: "var(--line)",color: "var(--ink)",
                      }}
                    >
                      {JSON.stringify(pack.consistencyScores, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            )}

            {isLoading && (
              <div className="flex flex-col gap-3">
                <div
                  className="h-20 animate-pulse"
                  style={{ background: "var(--surface-2)" }}
                />
                <div
                  className="h-40 animate-pulse"
                  style={{ background: "var(--surface-2)" }}
                />
              </div>
            )}

            {error && !pack && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <p className="text-sm font-medium" style={{ color: "var(--red)" }}>
                  Failed to load pack
                </p>
                <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                  {error instanceof Error ? error.message : "Unknown error"}
                </p>
              </div>
            )}

            {!pack && !isLoading && !error && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
                  Pack not found
                </p>
              </div>
            )}
          </div>
        }
        centerPanel={
          <div className="h-full flex flex-col">
            {pack && (
              <div
                className="flex items-center justify-between px-4 py-3 border-b shrink-0"
                style={{ borderColor: "var(--line)" }}
              >
                <h2
                  className="text-sm font-semibold"
                  style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}
                >
                  Assets
                </h2>
                <span
                  className="text-xs font-mono"
                  style={{ color: "var(--muted)" }}
                >
                  {pack.assets?.length ?? 0} items
                </span>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <AssetGrid
                assets={pack?.assets || []}
                outlierIds={outlierIds}
                onRefine={handleRefine}
              />
            </div>
          </div>
        }
        rightPanel={
          <div className="h-full">
            <PackConsistencyPanel pack={pack} />
          </div>
        }
      />
    </StudioFrame>
  );
}
