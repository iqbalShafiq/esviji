import { useState, useRef, useEffect } from "react";

interface SvgCodeEditorProps {
  svg: string;
}

export function SvgCodeEditor({ svg }: SvgCodeEditorProps) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(svg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  // Simple syntax highlighting for SVG
  const highlightedSvg = svg
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/(&lt;\/?)([\w:-]+)/g, '<span class="svg-tag">$1$2</span>')
    .replace(/(\s)([\w:-]+)(=)/g, '$1<span class="svg-attr">$2</span>$3')
    .replace(/"([^"]*)"/g, '<span class="svg-string">"$1"</span>');

  useEffect(() => {
    if (preRef.current) {
      // Apply inline styles to highlighted spans since we're using dangerouslySetInnerHTML
      const tags = preRef.current.querySelectorAll(".svg-tag");
      tags.forEach((el) => {
        (el as HTMLElement).style.color = "var(--blueprint)";
      });
      const attrs = preRef.current.querySelectorAll(".svg-attr");
      attrs.forEach((el) => {
        (el as HTMLElement).style.color = "var(--cyan)";
      });
      const strings = preRef.current.querySelectorAll(".svg-string");
      strings.forEach((el) => {
        (el as HTMLElement).style.color = "var(--green)";
      });
    }
  }, [highlightedSvg]);

  return (
    <div
      className="border flex flex-col"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}
        >
          SVG Source
        </h3>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[10px] font-mono px-2 py-1 transition-colors"
          style={{
            color: copied ? "var(--green)" : "var(--muted)",
            background: "var(--bg)",
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="overflow-auto max-h-[500px]">
        <pre
          ref={preRef}
          className="p-4 text-xs leading-relaxed"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--ink)",
            background: "var(--bg)",
            tabSize: 2,
          }}
          dangerouslySetInnerHTML={{ __html: highlightedSvg }}
        />
      </div>
    </div>
  );
}
