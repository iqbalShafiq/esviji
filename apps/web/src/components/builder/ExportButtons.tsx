import { downloadSvg, downloadPng } from "../../lib/download.js";

interface ExportButtonsProps {
  assetId: string;
  svg?: string;
  pngUrl?: string;
}

export function ExportButtons({ assetId, svg, pngUrl }: ExportButtonsProps) {
  const handleCopySvg = async () => {
    if (!svg) return;
    try {
      await navigator.clipboard.writeText(svg);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {svg && (
        <>
          <button
            type="button"
            onClick={() => downloadSvg(svg, `${assetId}.svg`)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium border transition-all active:scale-[0.98]"
            style={{
              borderColor: "var(--line)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontFamily: "var(--font-body)",}}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 1V9M7 9L4 6M7 9L10 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M1 10V12C1 12.5523 1.44772 13 2 13H12C12.5523 13 13 12.5523 13 12V10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Download SVG
          </button>

          <button
            type="button"
            onClick={handleCopySvg}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium border transition-all active:scale-[0.98]"
            style={{
              borderColor: "var(--line)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontFamily: "var(--font-body)",}}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect
                x="3"
                y="3"
                width="8"
                height="8"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M1 9V3C1 1.89543 1.89543 1 3 1H9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            Copy SVG
          </button>
        </>
      )}

      {pngUrl && (
        <button
          type="button"
          onClick={() => downloadPng(pngUrl, `${assetId}.png`)}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium border transition-all active:scale-[0.98]"
          style={{
            borderColor: "var(--line)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontFamily: "var(--font-body)",}}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1V9M7 9L4 6M7 9L10 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M1 10V12C1 12.5523 1.44772 13 2 13H12C12.5523 13 13 12.5523 13 12V10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Download PNG
        </button>
      )}
    </div>
  );
}
