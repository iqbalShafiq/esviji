import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";

export default function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);
    try {
      await register(username, email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return <main className="flex min-h-screen items-center justify-center px-4" style={{ background: "radial-gradient(circle at 80% 10%, rgba(245,158,11,.16), transparent 32%), var(--bg)" }}>
    <section className="w-full max-w-md border p-8" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>New Studio Account</p>
      <h1 className="mt-3 text-3xl font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>Register</h1>
      <p className="mb-6 mt-2 text-sm leading-6" style={{ color: "var(--muted)" }}>Every new account starts with 50 generation tokens.</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Username" value={username} onChange={setUsername} placeholder="your_username" />
        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@example.com" />
        <Field label="Password" value={password} onChange={setPassword} type="password" placeholder="Minimum 8 characters" />
        {error && <p className="text-xs" style={{ color: "var(--red)" }}>{error}</p>}
        <button disabled={isSubmitting} className="px-4 py-3 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--blueprint)", color: "#fff" }}>{isSubmitting ? "Creating..." : "Create Account"}</button>
        <p className="text-xs" style={{ color: "var(--muted)" }}>Already registered? <Link to="/login" style={{ color: "var(--blueprint)" }}>Login</Link></p>
      </form>
    </section>
  </main>;
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
    {label}
    <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--bg)", borderColor: "var(--line)", color: "var(--ink)", fontFamily: "var(--font-body)" }} required />
  </label>;
}
