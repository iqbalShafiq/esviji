import { useState } from "react";

interface JsonInspectorProps {
  data: unknown;
  title?: string;
}

export function JsonInspector({ data, title = "JSON" }: JsonInspectorProps) {
  const [collapsed, setCollapsed] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
    } catch {
      // Fallback not implemented for brevity
    }
  };

  return (
    <div
      className="border flex flex-col overflow-hidden"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            style={{
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {title}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[10px] font-mono px-2 py-1 transition-colors"
          style={{ color: "var(--muted)", background: "var(--bg)" }}
        >
          Copy
        </button>
      </div>

      {!collapsed && (
        <div className="overflow-auto max-h-[400px]">
          <pre
            className="p-4 text-xs leading-relaxed"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--ink)",
              background: "var(--bg)",
            }}
          >
            <code>{jsonString}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
