import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

interface TopBarProps {
  actions?: ReactNode;
}

export function TopBar({ actions }: TopBarProps) {
  const location = useLocation();

  const navLinks = [
    { to: "/assets/new", label: "Asset Builder" },
    { to: "/packs", label: "My Packs" },
    { to: "/history", label: "History" },
  ];

  return (
    <header
      className="h-[56px] flex items-center justify-between px-6 shrink-0"
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div className="flex items-center gap-8">
        <Link
          to="/"
          className="text-lg font-semibold tracking-tight"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--ink)",
          }}
        >
          VectorLab
        </Link>
        <nav className="hidden sm:flex items-center gap-6">
          {navLinks.map((link) => {
            const active = location.pathname === link.to || (link.to === "/packs" && location.pathname.startsWith("/packs/"));
            return (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-medium transition-colors"
                style={{
                  color: active ? "var(--ink)" : "var(--muted)",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
