import { useState } from "react";
import { useEffect } from "react";
import { AppShell } from "../components/layout/AppShell.js";
import { StudioFrame } from "../components/layout/StudioFrame.js";
import { AssetBuilderForm } from "../components/builder/AssetBuilderForm.js";
import { PreviewWorkspace } from "../components/builder/PreviewWorkspace.js";
import { PreviewCanvas } from "../components/builder/PreviewCanvas.js";
import { PreviewToolbar } from "../components/builder/PreviewToolbar.js";
import { PipelineRail } from "../components/builder/PipelineRail.js";
import { ScoresCard } from "../components/builder/ScoresCard.js";
import { QualityGates } from "../components/builder/QualityGates.js";
import { IterationTimeline } from "../components/builder/IterationTimeline.js";
import { IssuesPanel } from "../components/builder/IssuesPanel.js";
import { ExportButtons } from "../components/builder/ExportButtons.js";
import { JsonInspector } from "../components/builder/JsonInspector.js";
import { PipelineFlowLogs } from "../components/builder/PipelineFlowLogs.js";
import type { AssetResponse, PreviewMode, BackgroundMode, PreviewSize, JobResponse } from "../types/index.js";
import { getAsset, subscribeJobStream } from "../lib/api.js";

export default function AssetBuilderPage() {
  const [asset, setAsset] = useState<AssetResponse | undefined>();
  const [jobId, setJobId] = useState<string | undefined>();
  const [job, setJob] = useState<JobResponse | undefined>();
  const [mode, setMode] = useState<PreviewMode>("final");
  const [background, setBackground] = useState<BackgroundMode>("transparent");
  const [previewSize, setPreviewSize] = useState<PreviewSize>("full");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmitStart = () => {
    setIsLoading(true);
  };

  const handleBuildError = () => {
    setIsLoading(false);
  };

  const handleJobCreated = (id: string) => {
    setJobId(id);
    setJob(undefined);
    setAsset(undefined);
  };

  useEffect(() => {
    if (!jobId) return;

    const unsubscribe = subscribeJobStream(jobId, {
      onJob: async (incomingJob) => {
        setJob(incomingJob);

        if (incomingJob.status === "completed" && incomingJob.assetId) {
          const result = await getAsset(incomingJob.assetId);
          setAsset({ ...result, currentStage: incomingJob.currentStage });
          setIsLoading(false);
        }

        if (incomingJob.status === "failed") {
          setIsLoading(false);
        }
      },
      onError: () => {
        setIsLoading(false);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [jobId]);

  useEffect(() => {
    if (job?.status === "failed") {
      setIsLoading(false);
    }
  }, [job?.status]);

  return (
    <StudioFrame>
      <AppShell
        leftPanel={
          <div className="h-full">
            <AssetBuilderForm
              onJobCreated={handleJobCreated}
              onSubmitStart={handleSubmitStart}
              onBuildError={handleBuildError}
            />
          </div>
        }
        centerPanel={
          <PreviewWorkspace
            pipelineRail={<PipelineRail asset={asset} currentStage={job?.currentStage} failed={job?.status === 'failed'} />}
            canvas={
              <PreviewCanvas
                asset={asset}
                mode={mode}
                background={background}
                previewSize={previewSize}
                isLoading={isLoading}
                currentStage={job?.currentStage}
                loadingPreviewUrl={job?.latestPreviewUrl}
                loadingIteration={job?.latestIteration}
                loadingProgress={job?.progress}
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
          />
        }
        rightPanel={
          <div
            className="flex flex-col gap-4 p-4 overflow-y-auto h-full"
            style={{ background: "var(--surface)" }}
          >
            {asset && (
              <>
                <ExportButtons
                  assetId={asset.id}
                  svg={asset.finalSvg}
                  pngUrl={asset.finalPngUrl}
                />
                <ScoresCard scores={asset.evaluation?.scores} />
                <QualityGates gates={asset.qualityGates} />
                <IterationTimeline iterations={asset.iterations} />
                <IssuesPanel issues={asset.evaluation?.issues} />
                {asset.classification && (
                  <JsonInspector data={asset.classification} title="Classification" />
                )}
                {asset.brief && (
                  <JsonInspector data={asset.brief} title="Brief" />
                )}
                {asset.styleSystem && (
                  <JsonInspector data={asset.styleSystem} title="Style System" />
                )}
                {asset.layoutBlueprint && (
                  <JsonInspector data={asset.layoutBlueprint} title="Layout" />
                )}
                {job?.logs && job.logs.length > 0 && (
                  <PipelineFlowLogs
                    logs={job.logs}
                    currentStage={job.currentStage}
                    failed={job.status === "failed"}
                    stageStreams={job.stageStreams}
                  />
                )}
              </>
            )}
            {!asset && job?.logs && job.logs.length > 0 && (
              <PipelineFlowLogs
                logs={job.logs}
                currentStage={job.currentStage}
                failed={job.status === "failed"}
                stageStreams={job.stageStreams}
              />
            )}
            {!asset && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
                  Inspector
                </p>
                <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                  Generate an asset to see evaluation details
                </p>
              </div>
            )}
          </div>
        }
      />
    </StudioFrame>
  );
}
