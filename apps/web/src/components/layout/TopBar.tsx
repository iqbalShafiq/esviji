import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "../../lib/api.js";

export function TopBar() {
  const location = useLocation();
  const [apiStatus, setApiStatus] = useState<"connected" | "offline">("offline");

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        await api.get("/health", { timeout: 3000 });
        if (mounted) setApiStatus("connected");
      } catch {
        if (mounted) setApiStatus("offline");
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

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
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 border"
          style={{
            color: apiStatus === "connected" ? "var(--green)" : "var(--red)",
            borderColor:
              apiStatus === "connected" ? "var(--green)" : "var(--red)",
            background:
              apiStatus === "connected"
                ? "rgba(47,158,68,0.08)"
                : "rgba(214,69,69,0.08)",
          }}
        >
          <span
            className="w-1.5 h-1.5"
            style={{
              background:
                apiStatus === "connected" ? "var(--green)" : "var(--red)",
            }}
          />
          {apiStatus === "connected" ? "API Connected" : "Offline"}
        </span>
      </div>
    </header>
  );
}
