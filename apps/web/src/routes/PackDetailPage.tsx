import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/layout/AppShell.js";
import { StudioFrame } from "../components/layout/StudioFrame.js";
import { AssetGrid } from "../components/builder/AssetGrid.js";
import { PackAssetBuilderForm } from "../components/builder/PackAssetBuilderForm.js";
import { PackConsistencyPanel } from "../components/builder/PackConsistencyPanel.js";
import { PreviewCanvas } from "../components/builder/PreviewCanvas.js";
import { PreviewToolbar } from "../components/builder/PreviewToolbar.js";
import { PreviewWorkspace } from "../components/builder/PreviewWorkspace.js";
import { PipelineRail } from "../components/builder/PipelineRail.js";
import { PipelineFlowLogs } from "../components/builder/PipelineFlowLogs.js";
import { ExportButtons } from "../components/builder/ExportButtons.js";
import { ScoresCard } from "../components/builder/ScoresCard.js";
import { QualityGates } from "../components/builder/QualityGates.js";
import { IterationTimeline } from "../components/builder/IterationTimeline.js";
import { IssuesPanel } from "../components/builder/IssuesPanel.js";
import { SvgCodeEditor } from "../components/builder/SvgCodeEditor.js";
import { ManualRefinementPrompt } from "../components/builder/ManualRefinementPrompt.js";
import { ConfirmationDialog } from "../components/common/ConfirmationDialog.js";
import { clonePack, deleteAsset, getAsset, getPack, iterateSvgAsset, subscribeJobStream, updatePackVisibility } from "../lib/api.js";
import type { AssetResponse, BackgroundMode, JobResponse, PreviewMode, PreviewSize } from "../types/index.js";
import { useAuth } from "../auth/AuthContext.js";

export default function PackDetailPage() {
  const { packId } = useParams<{ packId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const [selectedAsset, setSelectedAsset] = useState<AssetResponse | undefined>();
  const [jobId, setJobId] = useState<string | undefined>();
  const [job, setJob] = useState<JobResponse | undefined>();
  const [mode, setMode] = useState<PreviewMode>("final");
  const [background, setBackground] = useState<BackgroundMode>("transparent");
  const [previewSize, setPreviewSize] = useState<PreviewSize>("full");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isLoadingAssetDetail, setIsLoadingAssetDetail] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<AssetResponse | undefined>();

  const { data: pack, isLoading: isPackLoading, error, refetch } = useQuery({
    queryKey: ["pack", packId],
    queryFn: () => getPack(packId!),
    enabled: !!packId,
  });

  const visibilityMutation = useMutation({
    mutationFn: (visibility: "private" | "public") => updatePackVisibility(packId!, visibility),
    onSuccess: async () => {
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["packs", "list"] });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: () => clonePack(packId!),
    onSuccess: (cloned) => navigate(`/packs/${cloned.id}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId),
    onSuccess: async ({ id }) => {
      if (selectedAsset?.id === id) setSelectedAsset(undefined);
      setAssetToDelete(undefined);
      await refetch();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["packs", "list"] }),
        queryClient.invalidateQueries({ queryKey: ["assets", "list"] }),
      ]);
    },
  });

  const outlierIds = useMemo(() => pack?.outliers?.map((o) => o.assetId) ?? [], [pack?.outliers]);
  const activeAsset = selectedAsset ?? pack?.assets[0];
  const showingPreview = Boolean(selectedAsset || isLoading || job);
  const isGenerating = isLoading || job?.status === "queued" || job?.status === "running";

  useEffect(() => {
    setSelectedAsset(undefined);
    setJob(undefined);
    setJobId(undefined);
    setIsLoading(false);
  }, [packId]);

  useEffect(() => {
    if (!jobId) return;

    const unsubscribe = subscribeJobStream(jobId, {
      onJob: async (incomingJob) => {
        setJob(incomingJob);

        if (incomingJob.status === "completed") {
          const nextPack = await refetch();
          if (incomingJob.assetId) {
            const asset = await getAsset(incomingJob.assetId);
            setSelectedAsset(asset);
          } else {
            setSelectedAsset(nextPack.data?.assets[0]);
          }
          await queryClient.invalidateQueries({ queryKey: ["packs", "list"] });
          await refreshUser({ silent: true });
          setIsLoading(false);
        }

        if (incomingJob.status === "failed") {
          setIsLoading(false);
        }
      },
      onError: () => setIsLoading(false),
      onModelToken: ({ stage, content }) => {
        setJob((current) => appendJobStream(current, "stageStreams", stage, content));
      },
      onReasoning: ({ stage, content }) => {
        setJob((current) => appendJobStream(current, "stageReasoningStreams", stage, content));
      },
      onTool: (event) => {
        setJob((current) => appendJobToolEvent(current, event));
      },
      onClearStream: ({ stage }) => {
        setJob((current) => clearJobStream(current, stage));
      },
    });

    return () => unsubscribe();
  }, [jobId, queryClient, refetch, refreshUser]);

  const handleManualRefine = async (instruction: string) => {
    if (!activeAsset) return;
    setIsRefining(true);
    try {
      const updated = await iterateSvgAsset({ assetId: activeAsset.id, instruction });
      setSelectedAsset(updated);
      await refetch();
      await refreshUser({ silent: true });
    } finally {
      setIsRefining(false);
    }
  };

  const handleSelectAsset = async (asset: AssetResponse) => {
    if (asset.finalSvg) {
      setSelectedAsset(asset);
      return;
    }

    setIsLoadingAssetDetail(true);
    try {
      const fullAsset = await getAsset(asset.id);
      setSelectedAsset(fullAsset);
    } finally {
      setIsLoadingAssetDetail(false);
    }
  };

  return (
    <>
    <StudioFrame
      topBarActions={
        <>
          {pack?.isOwner && (
            <button type="button" className="px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50" style={{ background: "var(--bg)", color: "var(--ink)", border: "1px solid var(--line)" }} disabled={visibilityMutation.isPending} onClick={() => visibilityMutation.mutate(pack.visibility === "public" ? "private" : "public")}>
              {pack.visibility === "public" ? "Make Private" : "Make Public"}
            </button>
          )}
          {pack && !pack.isOwner && pack.visibility === "public" && (
            <button type="button" className="px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50" style={{ background: "var(--blueprint)", color: "#fff" }} disabled={cloneMutation.isPending} onClick={() => cloneMutation.mutate()}>
              Clone Pack
            </button>
          )}
          <Link to="/packs" className="px-3 py-2 text-xs font-semibold transition-colors" style={{ background: "var(--bg)", color: "var(--ink)", border: "1px solid var(--line)" }}>
            My Packs
          </Link>
        </>
      }
    >
      <AppShell
        leftPanel={
          <div className="h-full">
            {pack && (
              <PackAssetBuilderForm
                pack={pack}
                isSubmitting={isLoading}
                onSubmitStart={() => setIsLoading(true)}
                onBuildError={() => setIsLoading(false)}
                onJobCreated={(id) => {
                  setJobId(id);
                  setJob(undefined);
                  setSelectedAsset(undefined);
                }}
              />
            )}
            {isPackLoading && <PackSkeleton />}
            {error && !pack && <PackLoadError error={error} />}
          </div>
        }
        centerPanel={
          showingPreview ? (
            <div className="flex h-full flex-col">
              {isLoading && pack && (
                <PackAssetStrip
                  assets={pack.assets}
                  selectedAssetId={activeAsset?.id}
                  onSelect={handleSelectAsset}
                />
              )}
              <div className="min-h-0 flex-1">
                <PreviewWorkspace
                  pipelineRail={<PipelineRail asset={activeAsset} currentStage={job?.currentStage} failed={job?.status === "failed"} />}
                  canvas={
                  <PreviewCanvas
                      asset={activeAsset}
                      mode={mode}
                      background={background}
                      previewSize={previewSize}
                      isLoading={isLoading || isPackLoading || isLoadingAssetDetail}
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
                    activeAsset ? (
                      <ManualRefinementPrompt
                        disabled={isLoading || isRefining}
                        isLoading={isRefining}
                        onSubmit={handleManualRefine}
                      />
                    ) : undefined
                  }
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>
                    {pack?.prompt ?? "Assets"}
                  </h2>
                  <p className="mt-0.5 text-[10px] font-mono" style={{ color: "var(--muted)" }}>
                    Click an SVG to inspect or refine it
                  </p>
                </div>
                <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                  {pack?.assets.length ?? 0} items
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <AssetGrid
                  assets={pack?.assets ?? []}
                  outlierIds={outlierIds}
                  emptyMessage="Add a SVG from the left command panel"
                  onRefine={handleSelectAsset}
                  onDelete={pack?.isOwner && !isGenerating ? setAssetToDelete : undefined}
                  deletingAssetId={deleteMutation.isPending ? assetToDelete?.id : undefined}
                />
              </div>
            </div>
          )
        }
        rightPanel={
          <div className="flex h-full flex-col gap-4 overflow-y-auto p-4" style={{ background: "var(--surface)" }}>
            {job && isGenerating && (
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
            {!isGenerating && <PackConsistencyPanel pack={pack} />}
            {activeAsset && showingPreview && !isGenerating && (
              <>
                <ExportButtons assetId={activeAsset.id} svg={activeAsset.finalSvg} pngUrl={activeAsset.finalPngUrl} />
                {activeAsset.finalSvg && <SvgCodeEditor svg={activeAsset.finalSvg} />}
                <ScoresCard scores={activeAsset.evaluation?.scores} />
                {activeAsset.qualityGates && activeAsset.qualityGates.length > 0 && <QualityGates gates={activeAsset.qualityGates} />}
                <IterationTimeline iterations={activeAsset.iterations} />
                <IssuesPanel issues={activeAsset.evaluation?.issues} iterationLabel="latest/final iteration" />
              </>
            )}
            {hasPipelineData(job) && !isGenerating && (
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
          </div>
        }
      />
    </StudioFrame>
    <ConfirmationDialog
      open={Boolean(assetToDelete)}
      title="Delete SVG from pack?"
      description={`This will permanently remove "${assetToDelete?.prompt ?? "this SVG"}" from the pack and update the pack item count.`}
      confirmLabel="Delete SVG"
      intent="danger"
      isPending={deleteMutation.isPending}
      onConfirm={() => {
        if (assetToDelete) deleteMutation.mutate(assetToDelete.id);
      }}
      onOpenChange={(open) => {
        if (!open && !deleteMutation.isPending) setAssetToDelete(undefined);
      }}
    />
    </>
  );
}

function PackAssetStrip({
  assets,
  selectedAssetId,
  onSelect,
}: {
  assets: AssetResponse[];
  selectedAssetId?: string;
  onSelect: (asset: AssetResponse) => void;
}) {
  return (
    <div className="flex shrink-0 gap-2 overflow-x-auto border-b p-3" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      {assets.map((asset) => (
        <button
          key={asset.id}
          type="button"
          className="flex h-16 w-16 shrink-0 items-center justify-center border transition-all"
          style={{
            borderColor: selectedAssetId === asset.id ? "var(--blueprint)" : "var(--line)",
            background: "var(--bg)",
          }}
          onClick={() => onSelect(asset)}
          title={asset.prompt}
        >
          {asset.finalPngUrl ? (
            <img src={asset.finalPngUrl} alt={asset.prompt} className="h-10 w-10 object-contain" />
          ) : (
            <span className="h-5 w-5 animate-pulse" style={{ background: "var(--line)" }} />
          )}
        </button>
      ))}
      <div className="flex h-16 min-w-32 items-center justify-center border border-dashed px-3 text-[10px] font-mono" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
        Generating next SVG
      </div>
    </div>
  );
}

function PackSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="h-24 animate-pulse" style={{ background: "var(--surface-2)" }} />
      <div className="h-48 animate-pulse" style={{ background: "var(--surface-2)" }} />
    </div>
  );
}

function PackLoadError({ error }: { error: unknown }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <p className="text-sm font-semibold" style={{ color: "var(--red)" }}>
        Failed to load pack
      </p>
      <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>
        {error instanceof Error ? error.message : "Unknown error"}
      </p>
    </div>
  );
}

function clearJobStream(job: JobResponse | undefined, stage: string): JobResponse | undefined {
  if (!job) return job;
  return {
    ...job,
    stageStreams: { ...(job.stageStreams ?? {}), [stage]: "" },
    stageReasoningStreams: { ...(job.stageReasoningStreams ?? {}), [stage]: "" },
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
    [key]: { ...streams, [stage]: `${streams[stage] ?? ""}${content}` },
  };
}

function appendJobToolEvent(
  job: JobResponse | undefined,
  event: NonNullable<JobResponse["streamEvents"]>[number],
): JobResponse | undefined {
  if (!job) return job;
  const streamEvents = job.streamEvents ?? [];
  if (streamEvents.some((item) => item.sequence === event.sequence)) return job;
  return { ...job, streamEvents: [...streamEvents, event] };
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
