import type { ReactNode } from "react";
import { TopBar } from "./TopBar.js";

interface StudioFrameProps {
  children: ReactNode;
  topBarActions?: ReactNode;
}

export function StudioFrame({ children, topBarActions }: StudioFrameProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar actions={topBarActions} />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
