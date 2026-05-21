import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/layout/AppShell.js";
import { StudioFrame } from "../components/layout/StudioFrame.js";
import { PreviewWorkspace } from "../components/builder/PreviewWorkspace.js";
import { PreviewCanvas } from "../components/builder/PreviewCanvas.js";
import { PreviewToolbar } from "../components/builder/PreviewToolbar.js";
import { PipelineRail } from "../components/builder/PipelineRail.js";

import { ScoresCard } from "../components/builder/ScoresCard.js";
import { QualityGates } from "../components/builder/QualityGates.js";
import { IterationTimeline } from "../components/builder/IterationTimeline.js";
import { IssuesPanel } from "../components/builder/IssuesPanel.js";
import { ExportButtons } from "../components/builder/ExportButtons.js";
import { SvgCodeEditor } from "../components/builder/SvgCodeEditor.js";
import { JsonInspector } from "../components/builder/JsonInspector.js";
import { ManualRefinementPrompt } from "../components/builder/ManualRefinementPrompt.js";
import { getAsset, iterateSvgAsset } from "../lib/api.js";
import type {
  PreviewMode,
  BackgroundMode,
  PreviewSize,
} from "../types/index.js";

export default function AssetDetailPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const [mode, setMode] = useState<PreviewMode>("final");
  const [background, setBackground] = useState<BackgroundMode>("transparent");
  const [previewSize, setPreviewSize] = useState<PreviewSize>("full");
  const [isRefining, setIsRefining] = useState(false);

  const {
    data: asset,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: !!assetId,
  });

  // Reset preview when asset changes
  useEffect(() => {
    setMode("final");
    setBackground("transparent");
    setPreviewSize("full");
  }, [assetId]);

  const handleManualRefine = async (instruction: string) => {
    if (!asset) return;
    setIsRefining(true);
    try {
      await iterateSvgAsset({ assetId: asset.id, instruction });
      await refetch();
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <StudioFrame>
      <AppShell
        leftPanel={
          <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
            {asset && (
              <>
                <div
                  className="p-4 border flex flex-col gap-2"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--surface)",
                  }}
                >
                  <h2
                    className="text-sm font-semibold"
                    style={{
                      color: "var(--ink)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {asset.prompt}
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
                      {asset.assetType}
                    </span>
                    <span
                      className="text-[10px] font-mono px-2 py-1 border"
                      style={{
                        borderColor: "var(--line)",
                        color: "var(--muted)",
                        background: "var(--bg)",
                      }}
                    >
                      {asset.mode}
                    </span>
                    <span
                      className="text-[10px] font-mono px-2 py-1 border"
                      style={{
                        borderColor: "var(--line)",
                        color: "var(--muted)",
                        background: "var(--bg)",
                      }}
                    >
                      {asset.output.width}×{asset.output.height}
                    </span>
                  </div>
                </div>

                <ExportButtons
                  assetId={asset.id}
                  svg={asset.finalSvg}
                  pngUrl={asset.finalPngUrl}
                />

                {asset.finalSvg && <SvgCodeEditor svg={asset.finalSvg} />}
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

            {!asset && !isLoading && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--muted)" }}
                >
                  Asset not found
                </p>
              </div>
            )}
          </div>
        }
        centerPanel={
          <PreviewWorkspace
            pipelineRail={<PipelineRail asset={asset} />}
            canvas={
              <PreviewCanvas
                asset={asset}
                mode={mode}
                background={background}
                previewSize={previewSize}
                isLoading={isLoading}
                isRefining={isRefining}
              />
            }
            toolbar={
              <PreviewToolbar
                mode={mode}
                onModeChange={setMode}
                background={background}
                onBackgroundChange={setBackground}
                previewSize={previewSize}
                onPreviewSizeChange={setPreviewSize}
              />
            }
            refinementPrompt={
              asset ? (
                <ManualRefinementPrompt
                  disabled={isLoading || isRefining}
                  isLoading={isRefining}
                  onSubmit={handleManualRefine}
                />
              ) : undefined
            }
          />
        }
        rightPanel={
          <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
            {asset && (
              <>
                <ScoresCard scores={asset.evaluation?.scores} />
                {asset.qualityGates && asset.qualityGates.length > 0 && (
                  <QualityGates gates={asset.qualityGates} />
                )}
                <IterationTimeline iterations={asset.iterations} />
                <IssuesPanel
                  issues={asset.evaluation?.issues}
                  iterationLabel="latest/final iteration"
                />
                <JsonInspector data={asset} title="Raw Response" />
              </>
            )}
            {isLoading && (
              <div className="flex flex-col gap-3">
                <div
                  className="h-24 animate-pulse"
                  style={{ background: "var(--surface-2)" }}
                />
                <div
                  className="h-32 animate-pulse"
                  style={{ background: "var(--surface-2)" }}
                />
                <div
                  className="h-40 animate-pulse"
                  style={{ background: "var(--surface-2)" }}
                />
              </div>
            )}
          </div>
        }
      />
    </StudioFrame>
  );
}
