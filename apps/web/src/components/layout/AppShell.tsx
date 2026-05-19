import type { ReactNode } from "react";

interface AppShellProps {
  leftPanel: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
}

export function AppShell({ leftPanel, centerPanel, rightPanel }: AppShellProps) {
  return (
    <div
      className="flex flex-col lg:grid lg:grid-cols-[320px_1fr_360px] h-[calc(100vh-56px)] overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      <aside
        className="h-full overflow-y-auto border-b lg:border-b-0 lg:border-r shrink-0"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      >
        {leftPanel}
      </aside>
      <main className="h-full overflow-hidden flex flex-col min-w-0">
        {centerPanel}
      </main>
      <aside
        className="h-full overflow-y-auto border-t lg:border-t-0 lg:border-l shrink-0"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      >
        {rightPanel}
      </aside>
    </div>
  );
}
