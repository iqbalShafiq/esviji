import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../../auth/AuthContext.js";

interface TopBarProps {
  actions?: ReactNode;
}

export function TopBar({ actions }: TopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const navLinks = [
    { to: "/assets/new", label: "Asset Builder" },
    { to: "/packs", label: "My Packs" },
    { to: "/history", label: "History" },
    { to: "/billing", label: "Billing" },
    ...(user?.role === "admin" ? [{ to: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="h-[56px] flex items-center justify-between px-6 shrink-0" style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
      <div className="flex items-center gap-8">
        <Link to="/" className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>Esviji</Link>
        <nav className="hidden sm:flex items-center gap-6">
          {navLinks.map((link) => {
            const active = location.pathname === link.to || (link.to === "/packs" && location.pathname.startsWith("/packs/"));
            return <Link key={link.to} to={link.to} className="text-sm font-medium transition-colors" style={{ color: active ? "var(--ink)" : "var(--muted)" }}>{link.label}</Link>;
          })}
          {user && <button type="button" className="text-sm font-medium transition-colors" style={{ color: "var(--muted)" }} onClick={() => { logout(); navigate("/login"); }}>Logout</button>}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <Link to="/billing" className="hidden border px-2.5 py-1 text-[10px] font-mono transition-colors sm:inline" style={{ color: "var(--muted)", borderColor: "var(--line)", background: "var(--bg)" }}>
            {user.role === "admin" ? "ADMIN / unlimited" : `${user.tokenBalance ?? 0} tokens`}
          </Link>
        )}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
