import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? "/"} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);
    try {
      await login(identifier, password);
      navigate((location.state as { from?: string } | null)?.from ?? "/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return <AuthScreen title="Welcome back" subtitle="Login to build, clone, and refine your SVG library.">
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Email or username" value={identifier} onChange={setIdentifier} placeholder="admin@esviji.id" />
      <Field label="Password" value={password} onChange={setPassword} type="password" placeholder="Enter your password" />
      {error && <p className="text-xs" style={{ color: "var(--red)" }}>{error}</p>}
      <button disabled={isSubmitting} className="px-4 py-3 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--blueprint)", color: "#fff" }}>
        {isSubmitting ? "Logging in..." : "Login"}
      </button>
      <p className="text-xs" style={{ color: "var(--muted)" }}>No account yet? <Link to="/register" style={{ color: "var(--blueprint)" }}>Register</Link></p>
    </form>
  </AuthScreen>;
}

function AuthScreen({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center px-4" style={{ background: "radial-gradient(circle at 20% 20%, rgba(0,168,200,.18), transparent 35%), var(--bg)" }}>
    <section className="w-full max-w-md border p-8" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Esviji Studio</p>
      <h1 className="mt-3 text-3xl font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>{title}</h1>
      <p className="mb-6 mt-2 text-sm leading-6" style={{ color: "var(--muted)" }}>{subtitle}</p>
      {children}
    </section>
  </main>;
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
    {label}
    <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--bg)", borderColor: "var(--line)", color: "var(--ink)", fontFamily: "var(--font-body)" }} required />
  </label>;
}
