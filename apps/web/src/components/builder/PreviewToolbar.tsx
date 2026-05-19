import type { BackgroundMode, PreviewMode, PreviewSize } from "../../types/index.js";

interface PreviewToolbarProps {
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
  background: BackgroundMode;
  onBackgroundChange: (bg: BackgroundMode) => void;
  previewSize: PreviewSize;
  onPreviewSizeChange: (size: PreviewSize) => void;
}

export function PreviewToolbar({
  mode,
  onModeChange,
  background,
  onBackgroundChange,
  previewSize,
  onPreviewSizeChange,
}: PreviewToolbarProps) {
  const modes: { value: PreviewMode; label: string }[] = [
    { value: "final", label: "Final" },
    { value: "debug", label: "Debug" },
    { value: "raw", label: "Raw SVG" },
  ];

  const backgrounds: { value: BackgroundMode; label: string }[] = [
    { value: "transparent", label: "Transparent" },
    { value: "white", label: "White" },
    { value: "dark", label: "Dark" },
    { value: "blueprint", label: "Blueprint" },
  ];

  const sizes: { value: PreviewSize; label: string }[] = [
    { value: "16", label: "16px" },
    { value: "24", label: "24px" },
    { value: "48", label: "48px" },
    { value: "128", label: "128px" },
    { value: "full", label: "Full" },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-3 py-2 border"
      style={{
        background: "var(--surface)",
        borderColor: "var(--line)",}}
    >
      {/* Mode toggles */}
      <div className="flex items-center gap-1">
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onModeChange(m.value)}
            className="px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              background: mode === m.value ? "var(--blueprint)" : "transparent",
              color: mode === m.value ? "#fff" : "var(--muted)",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div
        className="w-px h-4"
        style={{ background: "var(--line)" }}
      />

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="px-2 py-1 text-xs font-mono transition-colors hover:bg-surface-2"
          style={{ color: "var(--muted)" }}
          onClick={() => {
            const idx = sizes.findIndex((s) => s.value === previewSize);
            if (idx > 0) onPreviewSizeChange(sizes[idx - 1].value);
          }}
        >
          -
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs font-mono transition-colors hover:bg-surface-2"
          style={{ color: "var(--muted)" }}
          onClick={() => {
            const idx = sizes.findIndex((s) => s.value === previewSize);
            if (idx < sizes.length - 1) onPreviewSizeChange(sizes[idx + 1].value);
          }}
        >
          +
        </button>
      </div>

      <div
        className="w-px h-4"
        style={{ background: "var(--line)" }}
      />

      {/* Background toggle */}
      <div className="flex items-center gap-1">
        {backgrounds.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => onBackgroundChange(b.value)}
            className="px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              background:
                background === b.value ? "var(--blueprint)" : "transparent",
              color: background === b.value ? "#fff" : "var(--muted)",
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div
        className="w-px h-4"
        style={{ background: "var(--line)" }}
      />

      {/* Size preview */}
      <div className="flex items-center gap-1">
        {sizes.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onPreviewSizeChange(s.value)}
            className="px-2 py-1 text-xs font-medium transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              background:
                previewSize === s.value ? "var(--blueprint)" : "transparent",
              color: previewSize === s.value ? "#fff" : "var(--muted)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
