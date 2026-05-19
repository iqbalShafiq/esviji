import { useState } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell.js";
import { StudioFrame } from "../components/layout/StudioFrame.js";
import { PackBuilderForm } from "../components/builder/PackBuilderForm.js";
import { AssetGrid } from "../components/builder/AssetGrid.js";
import { PackConsistencyPanel } from "../components/builder/PackConsistencyPanel.js";
import { PipelineFlowLogs } from "../components/builder/PipelineFlowLogs.js";
import type { PackResponse, AssetResponse, JobResponse } from "../types/index.js";
import { getPack, subscribeJobStream } from "../lib/api.js";

export default function PackBuilderPage() {
  const [pack, setPack] = useState<PackResponse | undefined>();
  const [jobId, setJobId] = useState<string | undefined>();
  const [job, setJob] = useState<JobResponse | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmitStart = () => {
    setIsLoading(true);
  };

  const handleBuildError = () => {
    setIsLoading(false);
  };

  const handleJobCreated = (id: string) => {
    setJobId(id);
    setJob(undefined);
    setPack(undefined);
  };

  useEffect(() => {
    if (!jobId) return;

    const unsubscribe = subscribeJobStream(jobId, {
      onJob: async (incomingJob) => {
        setJob(incomingJob);

        if (incomingJob.status === "completed" && incomingJob.packId) {
          const p = await getPack(incomingJob.packId);
          setPack(p);
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

  const handleRefine = (asset: AssetResponse) => {
    navigate(`/assets/${asset.id}`);
  };

  const outlierIds = pack?.outliers?.map((o) => o.assetId) || [];

  return (
    <StudioFrame>
      <AppShell
        leftPanel={
          <div className="h-full">
            <PackBuilderForm
              onJobCreated={handleJobCreated}
              onSubmitStart={handleSubmitStart}
              onBuildError={handleBuildError}
            />
          </div>
        }
        centerPanel={
          <div className="h-full flex flex-col">
            {pack && (
              <div
                className="flex items-center justify-between px-4 py-3 border-b shrink-0"
                style={{ borderColor: "var(--line)" }}
              >
                <div className="flex items-center gap-2">
                  <h2
                    className="text-sm font-semibold"
                    style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}
                  >
                    {pack.prompt}
                  </h2>
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 border"
                    style={{
                      borderColor: "var(--line)",
                      color: "var(--muted)",
                      background: "var(--bg)",
                    }}
                  >
                    {pack.assetType}
                  </span>
                </div>
                <span
                  className="text-xs font-mono"
                  style={{ color: "var(--muted)" }}
                >
                  {pack.assets?.length ?? 0} / {pack.quantity}
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
          <div className="h-full overflow-y-auto" style={{ background: "var(--surface)" }}>
            <div className="flex flex-col gap-4 p-4">
              {job?.logs && job.logs.length > 0 && (
                <PipelineFlowLogs
                  logs={job.logs}
                  currentStage={job.currentStage}
                  failed={job.status === "failed"}
                  stageStreams={job.stageStreams}
                  stageReasoningStreams={job.stageReasoningStreams}
                  error={job.error}
                />
              )}
              <PackConsistencyPanel pack={pack} />
            </div>
          </div>
        }
      />
    </StudioFrame>
  );
}
