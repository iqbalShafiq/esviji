import { PIPELINE_STAGES } from "@svg-builder/shared";
import type { AssetResponse } from "../../types/index.js";

interface PipelineRailProps {
  asset?: AssetResponse;
  currentStage?: string;
  failed?: boolean;
  activeRun?: boolean;
}

export function PipelineRail({ asset, currentStage, failed, activeRun = false }: PipelineRailProps) {
  const stages = PIPELINE_STAGES.map((stage) => ({
    key: stage,
    label: stage.charAt(0).toUpperCase() + stage.slice(1),
    status: getStageStatus(asset, stage, currentStage, failed, activeRun),
  }));

  return (
    <div
      className="flex flex-row items-center py-3 px-4 gap-0 w-full overflow-x-auto"
      style={{ background: "var(--surface)" }}
    >
      {stages.map((stage, index) => (
        <div key={stage.key} className="flex flex-row items-center">
          {/* Connector line before */}
          {index > 0 && (
            <div
              className="h-px w-6 mx-1"
              style={{
                background:
                  stage.status === "completed" || stage.status === "running"
                    ? "var(--blueprint)"
                    : "var(--line)",
              }}
            />
          )}

          {/* Node + Label group */}
          <div className="flex flex-row items-center gap-2">
            {/* Node */}
              <div
              className="w-6 h-6 flex items-center justify-center border-2 transition-all shrink-0"
              style={{
                borderColor:
                  stage.status === "running"
                    ? "var(--blueprint)"
                    : stage.status === "completed"
                    ? "var(--green)"
                    : stage.status === "failed"
                    ? "var(--red)"
                    : "var(--line)",
                background:
                  stage.status === "running"
                    ? "var(--blueprint)"
                    : stage.status === "completed"
                    ? "var(--green)"
                    : stage.status === "failed"
                    ? "var(--red)"
                    : "var(--surface)",
              }}
            >
              {stage.status === "completed" && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6L5 8.5L9.5 3.5"
                    stroke="#fff"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {stage.status === "failed" && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5"
                    stroke="#fff"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              {stage.status === "running" && (
                <span className="w-2 h-2 bg-white animate-pulse" />
              )}
            </div>

            {/* Label */}
            <span
              className="text-[10px] font-mono whitespace-nowrap"
              style={{
                color:
                  stage.status === "running"
                    ? "var(--blueprint)"
                    : stage.status === "completed"
                    ? "var(--green)"
                    : stage.status === "failed"
                    ? "var(--red)"
                    : "var(--muted)",
              }}
            >
              {stage.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function getStageStatus(
  asset: AssetResponse | undefined,
  stage: string,
  currentStage?: string,
  failed?: boolean,
  activeRun?: boolean
): "pending" | "running" | "completed" | "failed" {
  const effectiveStage = currentStage ?? asset?.currentStage;
  if (!asset && !effectiveStage) return "pending";

  if (activeRun) {
    const currentIdx = effectiveStage
      ? PIPELINE_STAGES.indexOf(effectiveStage as (typeof PIPELINE_STAGES)[number])
      : -1;
    const stageIdx = PIPELINE_STAGES.indexOf(stage as (typeof PIPELINE_STAGES)[number]);
    if (failed) {
      if (stageIdx < currentIdx) return "completed";
      if (stageIdx === currentIdx) return "failed";
      return "pending";
    }
    if (currentIdx < 0) return "pending";
    if (stageIdx < currentIdx) return "completed";
    if (stageIdx === currentIdx) return "running";
    return "pending";
  }

  if (failed || asset?.status === "failed") {
    const currentIdx = PIPELINE_STAGES.indexOf(
      effectiveStage as (typeof PIPELINE_STAGES)[number]
    );
    const stageIdx = PIPELINE_STAGES.indexOf(stage as (typeof PIPELINE_STAGES)[number]);
    if (stageIdx < currentIdx) return "completed";
    if (stageIdx === currentIdx) return "failed";
    return "pending";
  }

  if (asset?.status === "completed" && !failed) {
    return "completed";
  }

  const currentIdx = effectiveStage
    ? PIPELINE_STAGES.indexOf(effectiveStage as (typeof PIPELINE_STAGES)[number])
    : -1;
  const stageIdx = PIPELINE_STAGES.indexOf(stage as (typeof PIPELINE_STAGES)[number]);

  if (stageIdx < currentIdx) return "completed";
  if (stageIdx === currentIdx) return "running";
  return "pending";
}
