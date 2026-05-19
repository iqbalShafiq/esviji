import type { ReactNode } from "react";
import { TopBar } from "./TopBar.js";

interface StudioFrameProps {
  children: ReactNode;
}

export function StudioFrame({ children }: StudioFrameProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
