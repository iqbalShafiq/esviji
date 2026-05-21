import { useState } from "react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { PipelineFlowLogs } from "../components/builder/PipelineFlowLogs.js";
import { ManualRefinementPrompt } from "../components/builder/ManualRefinementPrompt.js";
import { AssetPackPanel } from "../components/builder/AssetPackPanel.js";
import type {
  AssetResponse,
  PreviewMode,
  BackgroundMode,
  PreviewSize,
  JobResponse,
} from "../types/index.js";
import { getAsset, iterateSvgAsset, subscribeJobStream } from "../lib/api.js";

export default function AssetBuilderPage() {
  const [searchParams] = useSearchParams();
  const loadAssetId = searchParams.get("load");

  const [asset, setAsset] = useState<AssetResponse | undefined>();
  const [jobId, setJobId] = useState<string | undefined>();
  const [job, setJob] = useState<JobResponse | undefined>();
  const [mode, setMode] = useState<PreviewMode>("final");
  const [background, setBackground] = useState<BackgroundMode>("transparent");
  const [previewSize, setPreviewSize] = useState<PreviewSize>("full");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  const { data: loadedAsset } = useQuery({
    queryKey: ["asset", loadAssetId],
    queryFn: () => getAsset(loadAssetId!),
    enabled: !!loadAssetId && !asset,
  });

  useEffect(() => {
    if (loadedAsset) {
      setAsset(loadedAsset);
    }
  }, [loadedAsset]);

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

  const handleNewAsset = () => {
    setAsset(undefined);
    setJob(undefined);
    setJobId(undefined);
    setIsLoading(false);
    setIsRefining(false);
  };

  const handleManualRefine = async (instruction: string) => {
    if (!asset) return;
    setIsRefining(true);
    try {
      const result = await iterateSvgAsset({
        assetId: asset.id,
        instruction,
      });
      setAsset(result);
    } finally {
      setIsRefining(false);
    }
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
      onModelToken: ({ stage, content }) => {
        setJob((current) =>
          appendJobStream(current, "stageStreams", stage, content),
        );
      },
      onReasoning: ({ stage, content }) => {
        setJob((current) =>
          appendJobStream(current, "stageReasoningStreams", stage, content),
        );
      },
      onTool: (event) => {
        setJob((current) => appendJobToolEvent(current, event));
      },
      onClearStream: ({ stage }) => {
        setJob((current) => clearJobStream(current, stage));
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
            {asset ? (
              <AssetPackPanel
                asset={asset}
                onAssetUpdated={setAsset}
                onNewAsset={handleNewAsset}
              />
            ) : (
              <AssetBuilderForm
                onJobCreated={handleJobCreated}
                onSubmitStart={handleSubmitStart}
                onBuildError={handleBuildError}
                isSubmitting={isLoading}
              />
            )}
          </div>
        }
        centerPanel={
          <PreviewWorkspace
            pipelineRail={
              <PipelineRail
                asset={asset}
                currentStage={job?.currentStage}
                failed={job?.status === "failed"}
              />
            }
            canvas={
              <PreviewCanvas
                asset={asset}
                mode={mode}
                background={background}
                previewSize={previewSize}
                isLoading={isLoading}
                isRefining={isRefining}
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
            refinementPrompt={
              asset ? (
                <ManualRefinementPrompt
                  disabled={!asset || isLoading || isRefining}
                  isLoading={isRefining}
                  onSubmit={handleManualRefine}
                />
              ) : undefined
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
                {asset.qualityGates && asset.qualityGates.length > 0 && (
                  <QualityGates gates={asset.qualityGates} />
                )}
                <IterationTimeline iterations={asset.iterations} />
                <IssuesPanel
                  issues={asset.evaluation?.issues}
                  iterationLabel="latest/final iteration"
                />
              </>
            )}
            {hasPipelineData(job) && (
              <PipelineFlowLogs
                logs={job.logs}
                currentStage={job.currentStage}
                failed={job.status === "failed"}
                stageStreams={job.stageStreams}
                stageReasoningStreams={job.stageReasoningStreams}
                streamEvents={job.streamEvents}
                error={job.error}
              />
            )}
            {!asset && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--muted)" }}
                >
                  Inspector
                </p>
                <p
                  className="text-xs font-mono"
                  style={{ color: "var(--muted)" }}
                >
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

function clearJobStream(
  job: JobResponse | undefined,
  stage: string,
): JobResponse | undefined {
  if (!job) return job;
  return {
    ...job,
    stageStreams: {
      ...(job.stageStreams ?? {}),
      [stage]: "",
    },
    stageReasoningStreams: {
      ...(job.stageReasoningStreams ?? {}),
      [stage]: "",
    },
  };
}

function appendJobStream(
  job: JobResponse | undefined,
  key: "stageStreams" | "stageReasoningStreams",
  stage: string,
  content: string,
): JobResponse | undefined {
  if (!job) return job;
  const streams = job[key] ?? {};
  return {
    ...job,
    [key]: {
      ...streams,
      [stage]: `${streams[stage] ?? ""}${content}`,
    },
  };
}

function appendJobToolEvent(
  job: JobResponse | undefined,
  event: NonNullable<JobResponse["streamEvents"]>[number],
): JobResponse | undefined {
  if (!job) return job;
  const streamEvents = job.streamEvents ?? [];
  if (streamEvents.some((item) => item.sequence === event.sequence)) {
    return job;
  }
  return {
    ...job,
    streamEvents: [...streamEvents, event],
  };
}

function hasPipelineData(job: JobResponse | undefined): job is JobResponse {
  if (!job) return false;
  return (
    job.logs.length > 0 ||
    Object.keys(job.stageStreams ?? {}).length > 0 ||
    Object.keys(job.stageReasoningStreams ?? {}).length > 0 ||
    (job.streamEvents ?? []).some((event) => event.type === "tool")
  );
}
