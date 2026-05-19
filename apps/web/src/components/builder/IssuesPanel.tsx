import type { EvaluationIssue } from "@svg-builder/shared";

interface IssuesPanelProps {
  issues?: EvaluationIssue[];
  iterationLabel?: string;
}

export function IssuesPanel({ issues, iterationLabel = "latest iteration" }: IssuesPanelProps) {
  if (!issues || issues.length === 0) {
    return (
      <div
        className="p-4 border flex flex-col gap-2 items-center justify-center text-center"
        style={{ borderColor: "var(--line)", background: "var(--surface)", minHeight: 120 }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 2L17 6V14L10 18L3 14V6L10 2Z"
            stroke="var(--green)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M7 10L9 12L13 8"
            stroke="var(--green)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-xs font-medium" style={{ color: "var(--green)", fontFamily: "var(--font-body)" }}>
          No issues found
        </p>
        <p className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
          No unresolved issues in the {iterationLabel}
        </p>
      </div>
    );
  }

  const severityOrder = { high: 0, medium: 1, low: 2 } as const;
  const sortedIssues = [...issues].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  const getSeverityColor = (severity: EvaluationIssue["severity"]) => {
    switch (severity) {
      case "high":
        return "var(--red)";
      case "medium":
        return "var(--amber)";
      case "low":
        return "var(--blueprint)";
      default:
        return "var(--muted)";
    }
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
          Issues
        </h3>
        <span
          className="text-xs font-mono font-medium px-2 py-0.5"
          style={{
            color: "var(--red)",
            background: "rgba(214,69,69,0.08)",
          }}
        >
          {issues.length}
        </span>
      </div>
      <p className="text-[10px] font-mono -mt-2" style={{ color: "var(--muted)" }}>
        These are issues reported by the evaluator for the {iterationLabel}; previous iteration issues may already be resolved.
      </p>

      <div className="flex flex-col gap-2">
        {sortedIssues.map((issue, index) => (
          <div
            key={index}
            className="flex flex-col gap-1.5 p-3 border"
            style={{
              borderColor: "var(--line)",
              background: "var(--bg)",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-mono font-medium px-1.5 py-0.5 uppercase"
                style={{
                  color: getSeverityColor(issue.severity),
                  background:
                    issue.severity === "high"
                      ? "rgba(214,69,69,0.08)"
                      : issue.severity === "medium"
                      ? "rgba(216,148,0,0.08)"
                      : "rgba(20,87,217,0.08)",
                }}
              >
                {issue.severity}
              </span>
              <span
                className="text-[10px] font-mono px-1.5 py-0.5"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--muted)",
                }}
              >
                {issue.type}
              </span>
            </div>
            <p className="text-xs font-medium" style={{ color: "var(--ink)", fontFamily: "var(--font-body)" }}>
              {issue.problem}
            </p>
            <p className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
              Target: {issue.target}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
