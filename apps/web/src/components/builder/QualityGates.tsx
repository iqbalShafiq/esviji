import type { QualityGateResult } from "../../types/index.js";

interface QualityGatesProps {
  gates?: QualityGateResult[];
}

export function QualityGates({ gates }: QualityGatesProps) {
  if (!gates || gates.length === 0) {
    return (
      <div className="p-4 border" style={{ borderColor: "var(--line)" }}>
        <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>
          No quality gates evaluated
        </p>
      </div>
    );
  }

  const passedCount = gates.filter((g) => g.passed).length;

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
          Quality Gates
        </h3>
        <span
          className="text-xs font-mono font-medium px-2 py-0.5"
          style={{
            color: passedCount === gates.length ? "var(--green)" : "var(--amber)",
            background:
              passedCount === gates.length
                ? "rgba(47,158,68,0.08)"
                : "rgba(216,148,0,0.08)",
          }}
        >
          {passedCount}/{gates.length}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {gates.map((gate) => (
          <div
            key={gate.name}
            className="flex items-center gap-2 py-1.5 px-2"
            style={{ background: "var(--bg)" }}
          >
            {gate.passed ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 7L6 10L11 4"
                  stroke="var(--green)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M4 4L10 10M10 4L4 10"
                  stroke="var(--red)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
            <span
              className="text-xs font-medium flex-1"
              style={{
                color: gate.passed ? "var(--green)" : "var(--red)",
                fontFamily: "var(--font-body)",
              }}
            >
              {gate.name}
            </span>
            {gate.message && (
              <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
                {gate.message}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
