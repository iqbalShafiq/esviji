import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ManualRefinementPrompt } from "../components/builder/ManualRefinementPrompt.js";
import { PipelineFlowLogs } from "../components/builder/PipelineFlowLogs.js";
import { AssetPackPanel } from "../components/builder/AssetPackPanel.js";
import { ConfirmationDialog } from "../components/common/ConfirmationDialog.js";
import { AssetNameEditor } from "../components/common/AssetNameEditor.js";
import { cloneAsset, deleteAsset, getAsset, iterateSvgAsset, subscribeJobStream, updateAssetName, updateAssetVisibility } from "../lib/api.js";
import type { AssetResponse, JobResponse } from "../types/index.js";
import type {
  PreviewMode,
  BackgroundMode,
  PreviewSize,
} from "../types/index.js";
import { useAuth } from "../auth/AuthContext.js";

export default function AssetDetailPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const [mode, setMode] = useState<PreviewMode>("final");
  const [background, setBackground] = useState<BackgroundMode>("transparent");
  const [previewSize, setPreviewSize] = useState<PreviewSize>("full");
  const [jobId, setJobId] = useState<string | undefined>();
  const [job, setJob] = useState<JobResponse | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const {
    data: asset,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: !!assetId,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAsset(assetId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assets", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["packs", "list"] });
      navigate("/history");
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: (visibility: "private" | "public") => updateAssetVisibility(assetId!, visibility),
    onSuccess: async () => refetch(),
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => updateAssetName(assetId!, name),
    onSuccess: async (updatedAsset) => {
      queryClient.setQueryData(["asset", assetId], updatedAsset);
      await queryClient.invalidateQueries({ queryKey: ["assets", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["packs", "list"] });
      if (updatedAsset.packId) {
        await queryClient.invalidateQueries({ queryKey: ["pack", updatedAsset.packId] });
      }
    },
  });

  const cloneMutation = useMutation({
    mutationFn: () => cloneAsset(assetId!),
    onSuccess: (cloned) => navigate(`/assets/${cloned.id}`),
  });

  // Reset preview when asset changes
  useEffect(() => {
    setMode("final");
    setBackground("transparent");
    setPreviewSize("full");
  }, [assetId]);

  useEffect(() => {
    if (!jobId) return;

    const unsubscribe = subscribeJobStream(jobId, {
      onJob: async (incomingJob) => {
        setJob(incomingJob);

        if (incomingJob.status === 'completed' && incomingJob.assetId) {
          await refetch();
          await refreshUser({ silent: true });
          setIsProcessing(false);
        }

        if (incomingJob.status === 'failed') {
          setIsProcessing(false);
        }
      },
      onError: () => {
        setIsProcessing(false);
      },
      onModelToken: ({ stage, content }) => {
        setJob((current) => appendJobStream(current, 'stageStreams', stage, content));
      },
      onReasoning: ({ stage, content }) => {
        setJob((current) => appendJobStream(current, 'stageReasoningStreams', stage, content));
      },
      onTool: (event) => {
        setJob((current) => appendJobToolEvent(current, event));
      },
      onClearStream: ({ stage }) => {
        setJob((current) => clearJobStream(current, stage));
      },
    });

    return () => unsubscribe();
  }, [jobId, refetch, refreshUser]);

  const handleManualRefine = async (instruction: string) => {
    if (!asset) return;
    setIsProcessing(true);
    setJob(undefined);
    try {
      const result = await iterateSvgAsset({ assetId: asset.id, instruction });
      setJobId(result.jobId);
    } catch (error) {
      setIsProcessing(false);
      throw error;
    }
  };

  const handleAssetUpdated = (updatedAsset: AssetResponse) => {
    queryClient.setQueryData(["asset", assetId], updatedAsset);
  };

  const isGenerating = isProcessing || job?.status === "queued" || job?.status === "running";

  return (
    <StudioFrame
      topBarActions={
        asset ? (
          <>
            {asset.isOwner && (
              <button
                type="button"
                className="px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ background: "var(--bg)", color: "var(--ink)", border: "1px solid var(--line)" }}
                disabled={visibilityMutation.isPending}
                onClick={() => visibilityMutation.mutate(asset.visibility === "public" ? "private" : "public")}
              >
                {asset.visibility === "public" ? "Make Private" : "Make Public"}
              </button>
            )}
            {!asset.isOwner && asset.visibility === "public" && (
              <button type="button" className="px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50" style={{ background: "var(--blueprint)", color: "#ffffff" }} disabled={cloneMutation.isPending} onClick={() => cloneMutation.mutate()}>
                Clone
              </button>
            )}
            {asset.isOwner && (
              <button
                type="button"
                className="px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "var(--red)", color: "#ffffff" }}
                disabled={deleteMutation.isPending}
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                Delete
              </button>
            )}
          </>
        ) : undefined
      }
    >
      <AppShell
        leftPanel={
          <div className="h-full">
            {asset && (
              <AssetPackPanel asset={asset} onAssetUpdated={handleAssetUpdated} />
            )}

            {isLoading && (
              <div className="flex flex-col gap-3 p-4">
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
            pipelineRail={
              <PipelineRail
                asset={asset}
                currentStage={job?.currentStage}
                failed={job?.status === 'failed'}
                activeRun={isGenerating}
              />
            }
            canvas={
              <PreviewCanvas
                asset={asset}
                mode={mode}
                background={background}
                previewSize={previewSize}
                isLoading={isLoading || isProcessing}
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
                  disabled={isLoading || isProcessing}
                  isLoading={isProcessing}
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
                {asset.isOwner && (
                  <AssetNameEditor
                    value={asset.name || asset.prompt}
                    isPending={renameMutation.isPending}
                    disabled={isLoading || isProcessing}
                    onSave={(name) => renameMutation.mutate(name)}
                  />
                )}
                {job && isGenerating && (
                  <PipelineFlowLogs
                    logs={job.logs}
                    currentStage={job.currentStage}
                    failed={job.status === 'failed'}
                    stageStreams={job.stageStreams}
                    stageReasoningStreams={job.stageReasoningStreams}
                    streamEvents={job.streamEvents}
                    error={job.error}
                  />
                )}
                {hasPipelineData(job) && !isGenerating && (
                  <PipelineFlowLogs
                    logs={job.logs}
                    currentStage={job.currentStage}
                    failed={job.status === 'failed'}
                    stageStreams={job.stageStreams}
                    stageReasoningStreams={job.stageReasoningStreams}
                    streamEvents={job.streamEvents}
                    error={job.error}
                  />
                )}
                <ExportButtons
                  assetId={asset.id}
                  svg={asset.finalSvg}
                  pngUrl={asset.finalPngUrl}
                />
                {asset.finalSvg && <SvgCodeEditor svg={asset.finalSvg} />}
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
      <ConfirmationDialog
        open={isDeleteDialogOpen}
        title="Delete this asset?"
        description="This removes the SVG asset from history and clears its generated iterations. This action cannot be undone."
        confirmLabel="Delete Asset"
        intent="danger"
        isPending={deleteMutation.isPending}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={() => deleteMutation.mutate()}
      />
    </StudioFrame>
  );
}

function appendJobStream(
  current: JobResponse | undefined,
  key: 'stageStreams' | 'stageReasoningStreams',
  stage: string,
  content: string,
): JobResponse | undefined {
  if (!current) return current;
  return {
    ...current,
    [key]: {
      ...(current[key] ?? {}),
      [stage]: `${current[key]?.[stage] ?? ''}${content}`.slice(-5000),
    },
  };
}

function appendJobToolEvent(
  current: JobResponse | undefined,
  event: {
    stage: string;
    content: string;
    at: string;
    sequence: number;
    toolName?: string;
    toolStatus?: 'requested' | 'running' | 'completed' | 'failed';
  },
): JobResponse | undefined {
  if (!current) return current;
  return {
    ...current,
    streamEvents: [
      ...(current.streamEvents ?? []),
      {
        sequence: event.sequence,
        type: 'tool',
        stage: event.stage,
        content: event.content,
        at: event.at,
        toolName: event.toolName,
        toolStatus: event.toolStatus,
      },
    ],
  };
}

function clearJobStream(
  current: JobResponse | undefined,
  stage: string,
): JobResponse | undefined {
  if (!current) return current;
  return {
    ...current,
    stageStreams: { ...(current.stageStreams ?? {}), [stage]: '' },
    stageReasoningStreams: { ...(current.stageReasoningStreams ?? {}), [stage]: '' },
  };
}

function hasPipelineData(job: JobResponse | undefined): job is JobResponse {
  return Boolean(job && (job.logs.length > 0 || job.currentStage || job.status === 'running' || job.status === 'failed'));
}
