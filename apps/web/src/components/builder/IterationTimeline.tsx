import type { IterationData } from "../../types/index.js";

interface IterationTimelineProps {
  iterations: IterationData[];
}

export function IterationTimeline({ iterations }: IterationTimelineProps) {
  if (!iterations || iterations.length === 0) {
    return (
      <div className="p-4 border" style={{ borderColor: "var(--line)" }}>
        <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>
          No iterations yet
        </p>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 85) return "var(--green)";
    if (score >= 60) return "var(--amber)";
    return "var(--red)";
  };

  return (
    <div
      className="p-4 border flex flex-col gap-4"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <h3
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}
      >
        Iterations
      </h3>

      <div className="flex flex-col gap-3">
        {iterations.map((it, index) => {
          const avgScore = it.scores
            ? Object.values(it.scores).reduce((a, b) => a + b, 0) /
              Object.values(it.scores).length
            : null;

          return (
            <div
              key={it.iteration}
              className="flex items-start gap-3 p-3 border transition-colors"
              style={{
                borderColor: "var(--line)",
                background: index === iterations.length - 1 ? "var(--surface-2)" : "var(--bg)",
              }}
            >
              {/* Iteration number */}
              <div
                className="shrink-0 w-7 h-7 flex items-center justify-center text-[10px] font-bold font-mono"
                style={{
                  background:
                    index === iterations.length - 1
                      ? "var(--blueprint)"
                      : "var(--surface-2)",
                  color: index === iterations.length - 1 ? "#fff" : "var(--muted)",
                }}
              >
                {it.iteration}
              </div>

              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--ink)", fontFamily: "var(--font-body)" }}
                  >
                    {index === iterations.length - 1 ? "Final iteration" : `Revision ${it.iteration}`}
                  </span>
                  {avgScore !== null && (
                    <span
                      className="text-[10px] font-mono font-medium px-1.5 py-0.5"
                      style={{
                        color: getScoreColor(avgScore),
                        background:
                          avgScore >= 85
                            ? "rgba(47,158,68,0.08)"
                            : avgScore >= 60
                            ? "rgba(216,148,0,0.08)"
                            : "rgba(214,69,69,0.08)",
                      }}
                    >
                      {Math.round(avgScore)}
                    </span>
                  )}
                </div>

                {it.issues && it.issues.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {it.issues.slice(0, 3).map((issue, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono px-1.5 py-0.5"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--muted)",
                        }}
                      >
                        {issue.type}
                      </span>
                    ))}
                    {it.issues.length > 3 && (
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--muted)",
                        }}
                      >
                        +{it.issues.length - 3} more
                      </span>
                    )}
                  </div>
                )}

                {it.revisionPlan && (
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>
                    Strategy: {it.revisionPlan.strategy.replace(/_/g, " ")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
