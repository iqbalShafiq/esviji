import { Link, useLocation } from "react-router-dom";

export function TopBar() {
  const location = useLocation();

  const navLinks = [
    { to: "/assets/new", label: "Asset Builder" },
    { to: "/packs/new", label: "Pack Builder" },
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
            const active = location.pathname === link.to;
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
    </header>
  );
}
