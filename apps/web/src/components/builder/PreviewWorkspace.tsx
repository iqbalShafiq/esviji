import type { ReactNode } from "react";

interface PreviewWorkspaceProps {
  canvas: ReactNode;
  toolbar: ReactNode;
  pipelineRail?: ReactNode;
  refinementPrompt?: ReactNode;
}

export function PreviewWorkspace({
  canvas,
  toolbar,
  pipelineRail,
  refinementPrompt,
}: PreviewWorkspaceProps) {
  return (
    <div className="flex flex-col h-full">
      {pipelineRail && (
        <div className="shrink-0 border-b" style={{ borderColor: "var(--line)" }}>
          {pipelineRail}
        </div>
      )}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {canvas}
        </div>
        {refinementPrompt && (
          <div className="shrink-0 border-t" style={{ borderColor: "var(--line)" }}>
            {refinementPrompt}
          </div>
        )}
        <div className="shrink-0 border-t" style={{ borderColor: "var(--line)" }}>
          {toolbar}
        </div>
      </div>
    </div>
  );
}
