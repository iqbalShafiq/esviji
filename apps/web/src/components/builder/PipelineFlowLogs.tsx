import { useEffect, useMemo, useRef, useState } from "react";

type FlowLog = { stage: string; message: string; at: string; progress?: number };

interface PipelineFlowLogsProps {
  logs: FlowLog[];
  currentStage?: string;
  failed?: boolean;
  stageStreams?: Record<string, string>;
  stageReasoningStreams?: Record<string, string>;
  error?: string;
}

export function PipelineFlowLogs({
  logs,
  currentStage,
  failed,
  stageStreams,
  stageReasoningStreams,
  error,
}: PipelineFlowLogsProps) {
  const stageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const grouped = useMemo(() => {
    const map = new Map<string, FlowLog[]>();
    for (const log of logs) {
      const list = map.get(log.stage) ?? [];
      list.push(log);
      map.set(log.stage, list);
    }
    for (const stage of Object.keys(stageStreams ?? {})) {
      if (!map.has(stage)) map.set(stage, []);
    }
    for (const stage of Object.keys(stageReasoningStreams ?? {})) {
      if (!map.has(stage)) map.set(stage, []);
    }
    return [...map.entries()].map(([stage, entries]) => ({ stage, entries }));
  }, [logs, stageStreams, stageReasoningStreams]);

  const latestStage = grouped[grouped.length - 1]?.stage;
  const [expandedStage, setExpandedStage] = useState<string | undefined>(latestStage);
  const activeStage = currentStage ?? latestStage;

  useEffect(() => {
    if (currentStage) {
      setExpandedStage(currentStage);
      return;
    }
    if (latestStage) setExpandedStage(latestStage);
  }, [latestStage, currentStage]);

  useEffect(() => {
    if (!activeStage) return;
    const activeEl = stageRefs.current[activeStage];
    activeEl?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeStage, logs.length]);

  if (grouped.length === 0) return null;

  return (
    <div className="border" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="px-3 py-2 border-b text-xs font-mono" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
        Pipeline Flows
      </div>
      {failed && error && (
        <div
          className="mx-3 mt-3 border px-3 py-2 text-[11px] font-mono"
          style={{ borderColor: "var(--red)", background: "rgba(214, 69, 69, 0.08)", color: "var(--red)" }}
        >
          Final error: {error}
        </div>
      )}
      <div className="max-h-[280px] overflow-y-auto">
        {grouped.map((group) => {
          const expanded = expandedStage === group.stage;
          const isActive = currentStage === group.stage;
          const groupHasRetry = group.entries.some((entry) => isRetryMessage(entry.message));
          const lastEntry = group.entries[group.entries.length - 1];
          const lastWasRetry = lastEntry ? isRetryMessage(lastEntry.message) : false;
          const groupHasError = group.entries.some((entry) => isErrorMessage(entry.message));
          const isFailed = (failed && isActive) || (groupHasError && !groupHasRetry);
          const isRetrying = isActive && lastWasRetry;
          const isRecovered = groupHasRetry && !isRetrying && !isFailed;
          const icon = isFailed ? "x" : isRetrying ? "…" : isActive ? "o" : "✓";
          const iconColor = isFailed
            ? "var(--red)"
            : isRetrying
            ? "var(--amber)"
            : isActive
            ? "var(--blueprint)"
            : "var(--green)";
          return (
            <div
              key={group.stage}
              ref={(el) => {
                stageRefs.current[group.stage] = el;
              }}
              className="border-b last:border-b-0 scroll-mt-2"
              style={{
                borderColor: isActive ? "var(--blueprint)" : "var(--line)",
                background: isActive ? "rgba(20, 87, 217, 0.05)" : "transparent",
              }}
            >
              <button
                type="button"
                onClick={() => setExpandedStage(expanded ? undefined : group.stage)}
                className="w-full text-left px-3 py-2 flex items-center justify-between"
              >
                <span className="text-xs font-mono flex items-center gap-2" style={{ color: "var(--ink)" }}>
                  <span style={{ color: iconColor }} className={isActive ? "animate-pulse" : ""}>{icon}</span>
                  <span>{group.stage.toUpperCase()}</span>
                  {isRetrying && (
                    <span
                      className="px-1.5 py-0.5 border"
                      style={{ borderColor: "var(--amber)", color: "var(--amber)", background: "rgba(216, 148, 0, 0.08)" }}
                    >
                      retrying
                    </span>
                  )}
                  {isRecovered && (
                    <span
                      className="px-1.5 py-0.5 border"
                      style={{ borderColor: "var(--green)", color: "var(--green)", background: "rgba(47, 158, 68, 0.08)" }}
                    >
                      recovered
                    </span>
                  )}
                  {isFailed && (
                    <span
                      className="px-1.5 py-0.5 border"
                      style={{ borderColor: "var(--red)", color: "var(--red)", background: "rgba(214, 69, 69, 0.08)" }}
                    >
                      error
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
                  {group.entries.length} event{group.entries.length > 1 ? "s" : ""}
                </span>
              </button>
              {expanded && (
                <div className="px-3 pb-3 flex flex-col gap-2">
                  {stageReasoningStreams?.[group.stage] && (
                    <div
                      className="text-[11px] font-mono border p-2 max-h-32 overflow-y-auto whitespace-pre-wrap"
                      style={{
                        borderColor: "var(--blueprint)",
                        background: "rgba(20, 87, 217, 0.06)",
                        color: "var(--ink)",
                      }}
                    >
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--blueprint)" }}>
                        Reasoning summary
                      </div>
                      {stageReasoningStreams[group.stage]}
                    </div>
                  )}
                  {stageStreams?.[group.stage] && (
                    <div className="text-[11px] font-mono border p-2 max-h-24 overflow-y-auto" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}>
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--muted)" }}>
                        Model stream
                      </div>
                      {stageStreams[group.stage]}
                    </div>
                  )}
                  {group.entries.map((entry, idx) => (
                    <div
                      key={`${entry.at}-${idx}`}
                      className="text-[11px] font-mono border-l-2 pl-2"
                      style={{
                        borderColor: isErrorMessage(entry.message)
                          ? "var(--red)"
                          : isRetryMessage(entry.message)
                          ? "var(--amber)"
                          : "var(--line)",
                      }}
                    >
                      <div
                        style={{
                          color: isErrorMessage(entry.message)
                            ? "var(--red)"
                            : isRetryMessage(entry.message)
                            ? "var(--amber)"
                            : "var(--ink)",
                        }}
                        className="max-h-20 overflow-y-auto pr-1"
                      >
                        {entry.message}
                      </div>
                      <div style={{ color: "var(--muted)" }}>
                        {new Date(entry.at).toLocaleTimeString()} {typeof entry.progress === "number" ? `· ${entry.progress}%` : ""}
                      </div>
                    </div>
                  ))}
                  {group.entries.length === 0 && (
                    <div className="text-[11px] font-mono" style={{ color: "var(--muted)" }}>
                      Streaming output is available for this stage.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isRetryMessage(message: string): boolean {
  return /retry|retrying/i.test(message);
}

function isErrorMessage(message: string): boolean {
  if (isRetryMessage(message)) return false;
  return /failed|error|invalid|validation failed/i.test(message);
}
