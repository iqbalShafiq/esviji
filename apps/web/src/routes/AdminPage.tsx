import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StudioFrame } from "../components/layout/StudioFrame.js";
import { listAdminPaymentOrders, listAdminUsers, updateAdminUserTokens } from "../lib/api.js";
import type { AdminUser, PaymentOrder } from "../lib/api.js";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { data: users = [], isLoading, error } = useQuery({ queryKey: ["admin", "users"], queryFn: listAdminUsers });
  const paymentsQuery = useQuery({ queryKey: ["admin", "payments"], queryFn: listAdminPaymentOrders });
  const mutation = useMutation({
    mutationFn: ({ userId, tokenBalance }: { userId: string; tokenBalance: number }) => updateAdminUserTokens(userId, tokenBalance),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  return <StudioFrame>
    <main className="h-[calc(100vh-56px)] overflow-y-auto p-6" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Admin Console</p>
        <h1 className="mt-2 text-3xl font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>Users & Tokens</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>Admin accounts are unlimited; user token balances can be adjusted here.</p>

        {isLoading && <div className="mt-6 h-40 animate-pulse" style={{ background: "var(--surface-2)" }} />}
        {error && <p className="mt-6 text-sm" style={{ color: "var(--red)" }}>Failed to load users</p>}
        <div className="mt-6 overflow-hidden border" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          {users.map((user) => <UserRow key={user.id} user={user} isPending={mutation.isPending} onSave={(tokenBalance) => mutation.mutate({ userId: user.id, tokenBalance })} />)}
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>Payment Orders</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Latest Midtrans orders, including pending, refund, and manual review states.</p>
          {paymentsQuery.isLoading && <div className="mt-4 h-32 animate-pulse" style={{ background: "var(--surface-2)" }} />}
          {paymentsQuery.error && <p className="mt-4 text-sm" style={{ color: "var(--red)" }}>Failed to load payments</p>}
          {!paymentsQuery.isLoading && (paymentsQuery.data?.length ?? 0) === 0 && <p className="mt-4 border p-4 text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--muted)" }}>No payment orders yet.</p>}
          <div className="mt-4 overflow-hidden border" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            {(paymentsQuery.data ?? []).map((order) => <PaymentRow key={order.id} order={order} />)}
          </div>
        </div>
      </div>
    </main>
  </StudioFrame>;
}

function UserRow({ user, isPending, onSave }: { user: AdminUser; isPending: boolean; onSave: (tokenBalance: number) => void }) {
  const [tokens, setTokens] = useState(user.tokenBalance);
  return <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_120px_160px_120px] md:items-center" style={{ borderColor: "var(--line)" }}>
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>{user.username} <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>{user.role}</span></p>
      <p className="truncate text-xs" style={{ color: "var(--muted)" }}>{user.email}</p>
    </div>
    <div className="text-xs font-mono" style={{ color: "var(--muted)" }}>{user._count?.assets ?? 0} assets / {user._count?.packs ?? 0} packs</div>
    <input type="number" min={0} value={tokens} disabled={user.role === "admin"} onChange={(event) => setTokens(Number(event.target.value))} className="border px-3 py-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--line)", color: "var(--ink)" }} />
    <button disabled={isPending || user.role === "admin"} onClick={() => onSave(tokens)} className="px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ background: "var(--blueprint)", color: "#fff" }}>{user.role === "admin" ? "Unlimited" : "Save"}</button>
  </div>;
}

function PaymentRow({ order }: { order: PaymentOrder }) {
  return <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_120px_120px_120px] md:items-center" style={{ borderColor: "var(--line)" }}>
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>{order.user?.username ?? "Unknown user"} <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>{order.package.name}</span></p>
      <p className="truncate text-xs" style={{ color: "var(--muted)" }}>{order.providerOrderId}</p>
    </div>
    <div className="text-xs font-mono" style={{ color: order.status === "paid" ? "var(--green)" : order.needsManualReview ? "var(--amber)" : "var(--muted)" }}>{order.needsManualReview ? "review" : order.status}</div>
    <div className="text-xs font-mono" style={{ color: "var(--muted)" }}>{order.tokenAmount} tokens</div>
    <div className="text-xs font-mono" style={{ color: "var(--muted)" }}>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(order.amountIdr)}</div>
  </div>;
}
