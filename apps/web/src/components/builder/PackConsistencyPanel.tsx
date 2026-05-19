import { useState } from "react";
import type { PackResponse } from "../../types/index.js";
import { downloadZip } from "../../lib/download.js";

interface PackConsistencyPanelProps {
  pack?: PackResponse;
}

function ConsistencyBar({ label, score }: { label: string; score?: number }) {
  const pct = Math.min(100, Math.max(0, score ?? 0));
  const color = pct >= 85 ? "var(--green)" : pct >= 60 ? "var(--amber)" : "var(--red)";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-medium uppercase tracking-wider"
          style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
        >
          {label}
        </span>
        <span
          className="text-[10px] font-mono font-semibold"
          style={{ color }}
        >
          {score != null ? Math.round(score) : "—"}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden"
        style={{ background: "var(--surface-2)" }}
      >
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function PackConsistencyPanel({ pack }: PackConsistencyPanelProps) {
  const [showStyleSystem, setShowStyleSystem] = useState(false);

  if (!pack) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2 p-4">
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
          Pack Inspector
        </p>
        <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>
          Generate a pack to see consistency details
        </p>
      </div>
    );
  }

  const scores = pack.consistencyScores || {};
  const overall = scores.overallConsistency ?? scores.styleConsistency ?? 0;
  const outliers = pack.outliers || [];

  return (
    <div
      className="flex flex-col gap-5 p-5 h-full overflow-y-auto"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between">
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
        >
          Pack Inspector
        </h2>
        <span
          className="text-[10px] font-mono px-2 py-0.5 border"
          style={{
            borderColor: "var(--line)",
            color: "var(--muted)",
            background: "var(--bg)",
          }}
        >
          {pack.status}
        </span>
      </div>

      {/* Consistency Score */}
      <div
        className="flex flex-col items-center gap-2 p-4 border"
        style={{
          borderColor: "var(--line)",background: "var(--bg)",
        }}
      >
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
        >
          Consistency Score
        </span>
        <span
          className="text-4xl font-bold"
          style={{
            color:
              overall >= 85
                ? "var(--green)"
                : overall >= 60
                ? "var(--amber)"
                : "var(--red)",
            fontFamily: "var(--font-display)",
          }}
        >
          {overall > 0 ? Math.round(overall) : "—"}
        </span>
      </div>

      {/* Consistency Strip */}
      <div className="flex flex-col gap-3">
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
        >
          Consistency Metrics
        </h3>
        <ConsistencyBar label="Style" score={scores.styleConsistency} />
        <ConsistencyBar label="Stroke" score={scores.strokeConsistency} />
        <ConsistencyBar label="Palette" score={scores.paletteConsistency} />
        <ConsistencyBar label="Grid" score={scores.gridConsistency} />
      </div>

      {/* Shared Style System */}
      {pack.sharedStyleSystem && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowStyleSystem((s) => !s)}
            className="flex items-center justify-between w-full text-left"
          >
            <h3
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            >
              Shared Style System
            </h3>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className="transition-transform"
              style={{ transform: showStyleSystem ? "rotate(180deg)" : undefined }}
            >
              <path d="M2 4L6 8L10 4" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showStyleSystem && (
            <pre
              className="text-[10px] font-mono p-3 border overflow-auto max-h-64"
              style={{
                background: "var(--bg)",
                borderColor: "var(--line)",color: "var(--ink)",
              }}
            >
              {JSON.stringify(pack.sharedStyleSystem, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Outliers */}
      {outliers.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}
          >
            Outliers ({outliers.length})
          </h3>
          <div className="flex flex-col gap-2">
            {outliers.map((o, i) => (
              <div
                key={`${o.assetId}-${i}`}
                className="flex flex-col gap-1 p-3 border"
                style={{
                  borderColor: "var(--line)",background: "var(--bg)",
                }}
              >
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--ink)", fontFamily: "var(--font-body)" }}
                >
                  {o.name}
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: "var(--red)", fontFamily: "var(--font-body)" }}
                >
                  {o.problem}
                </span>
                {o.suggestedFix && (
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
                  >
                    Suggested: {o.suggestedFix}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Download ZIP */}
      {pack.zipUrl && (
        <button
          type="button"
          onClick={() => downloadZip(pack.zipUrl!, `${pack.id}.zip`)}
          className="w-full py-3 px-4 text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          style={{
            background: "var(--blueprint)",
            color: "#ffffff",}}
        >
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
            <path d="M7 1V9M7 9L4 6M7 9L10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M1 10V12C1 12.5523 1.44772 13 2 13H12C12.5523 13 13 12.5523 13 12V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download ZIP
        </button>
      )}
    </div>
  );
}
