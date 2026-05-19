import type { EvaluationResult } from "@svg-builder/shared";

interface ScoresCardProps {
  scores?: EvaluationResult["scores"];
}

export function ScoresCard({ scores }: ScoresCardProps) {
  if (!scores || Object.keys(scores).length === 0) {
    return (
      <div className="p-4 border" style={{ borderColor: "var(--line)" }}>
        <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>
          No scores available
        </p>
      </div>
    );
  }

  const entries = Object.entries(scores);
  const avg = entries.reduce((sum, [, v]) => sum + v, 0) / entries.length;

  const getColor = (value: number) => {
    if (value >= 85) return "var(--green)";
    if (value >= 60) return "var(--amber)";
    return "var(--red)";
  };

  return (
    <div
      className="p-4 border flex flex-col gap-3"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between">
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}
        >
          Scores
        </h3>
        <span
          className="text-lg font-bold tabular-nums"
          style={{ color: getColor(avg), fontFamily: "var(--font-mono)" }}
        >
          {Math.round(avg)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium capitalize"
                style={{ color: "var(--ink)", fontFamily: "var(--font-body)" }}
              >
                {key.replace(/_/g, " ")}
              </span>
              <span
                className="text-xs font-mono tabular-nums font-medium"
                style={{ color: getColor(value) }}
              >
                {Math.round(value)}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden"
              style={{ background: "var(--surface-2)" }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${value}%`,
                  background: getColor(value),
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
