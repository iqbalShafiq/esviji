import { useEffect, useMemo, useState } from "react";

type FlowLog = { stage: string; message: string; at: string; progress?: number };

interface PipelineFlowLogsProps {
  logs: FlowLog[];
  currentStage?: string;
  failed?: boolean;
  stageStreams?: Record<string, string>;
}

export function PipelineFlowLogs({ logs, currentStage, failed, stageStreams }: PipelineFlowLogsProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, FlowLog[]>();
    for (const log of logs) {
      const list = map.get(log.stage) ?? [];
      list.push(log);
      map.set(log.stage, list);
    }
    return [...map.entries()].map(([stage, entries]) => ({ stage, entries }));
  }, [logs]);

  const latestStage = grouped[grouped.length - 1]?.stage;
  const [expandedStage, setExpandedStage] = useState<string | undefined>(latestStage);

  useEffect(() => {
    if (currentStage) {
      setExpandedStage(currentStage);
      return;
    }
    if (latestStage) setExpandedStage(latestStage);
  }, [latestStage, currentStage]);

  if (grouped.length === 0) return null;

  return (
    <div className="border" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="px-3 py-2 border-b text-xs font-mono" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
        Pipeline Flows
      </div>
      <div className="max-h-[280px] overflow-y-auto" ref={(el) => {
        if (!el) return;
        el.scrollTop = el.scrollHeight;
      }}>
        {grouped.map((group) => {
          const expanded = expandedStage === group.stage;
          const isActive = currentStage === group.stage;
          const isFailed = failed && isActive;
          const icon = isFailed ? "✕" : isActive ? "●" : "✓";
          const iconColor = isFailed ? "var(--red)" : isActive ? "var(--blueprint)" : "var(--green)";
          return (
            <div key={group.stage} className="border-b last:border-b-0" style={{ borderColor: "var(--line)" }}>
              <button
                type="button"
                onClick={() => setExpandedStage(expanded ? undefined : group.stage)}
                className="w-full text-left px-3 py-2 flex items-center justify-between"
              >
                <span className="text-xs font-mono flex items-center gap-2" style={{ color: "var(--ink)" }}>
                  <span style={{ color: iconColor }} className={isActive ? "animate-pulse" : ""}>{icon}</span>
                  <span>{group.stage.toUpperCase()}</span>
                </span>
                <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
                  {group.entries.length} event{group.entries.length > 1 ? "s" : ""}
                </span>
              </button>
              {expanded && (
                <div className="px-3 pb-3 flex flex-col gap-2">
                  {stageStreams?.[group.stage] && (
                    <div className="text-[11px] font-mono border p-2 max-h-24 overflow-y-auto" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}>
                      {stageStreams[group.stage]}
                    </div>
                  )}
                  {group.entries.map((entry, idx) => (
                    <div key={`${entry.at}-${idx}`} className="text-[11px] font-mono">
                      <div
                        style={{ color: "var(--ink)" }}
                        className="max-h-20 overflow-y-auto pr-1"
                      >
                        {entry.message}
                      </div>
                      <div style={{ color: "var(--muted)" }}>
                        {new Date(entry.at).toLocaleTimeString()} {typeof entry.progress === "number" ? `· ${entry.progress}%` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
