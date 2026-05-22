import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StudioFrame } from "../components/layout/StudioFrame.js";
import { useAuth } from "../auth/AuthContext.js";
import {
  createPaymentOrder,
  getPaymentConfig,
  listPaymentOrders,
  listTokenPackages,
  syncPaymentOrder,
} from "../lib/api.js";
import type { PaymentOrder, TokenPackage } from "../lib/api.js";

export default function BillingPage() {
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const configQuery = useQuery({ queryKey: ["payments", "config"], queryFn: getPaymentConfig });
  const packagesQuery = useQuery({ queryKey: ["payments", "packages"], queryFn: listTokenPackages });
  const ordersQuery = useQuery({ queryKey: ["payments", "orders"], queryFn: listPaymentOrders });

  const checkoutMutation = useMutation({
    mutationFn: createPaymentOrder,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["payments", "orders"] });
      if (result.redirectUrl) window.location.assign(result.redirectUrl);
    },
  });

  const syncMutation = useMutation({
    mutationFn: syncPaymentOrder,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments", "orders"] }),
        refreshUser({ silent: true }),
      ]);
    },
  });

  const packages = packagesQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const isConfigured = configQuery.data?.isConfigured ?? false;
  const isLoading = packagesQuery.isLoading || ordersQuery.isLoading || configQuery.isLoading;

  return (
    <StudioFrame>
      <main className="h-[calc(100vh-56px)] overflow-y-auto" style={{ background: "var(--bg)" }}>
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0">
            <div className="flex flex-col gap-3 border-b pb-6 md:flex-row md:items-end md:justify-between" style={{ borderColor: "var(--line)" }}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Billing</p>
                <h1 className="mt-2 text-3xl font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>Top up tokens</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "var(--muted)" }}>
                  Pay with QRIS or credit card through Midtrans Snap. Tokens are added only after payment confirmation.
                </p>
              </div>
              <div className="flex min-w-[220px] items-center justify-between gap-5 border px-4 py-3" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Current balance</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Available generation tokens</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-3xl font-semibold leading-none tabular-nums" style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>
                    {user?.role === "admin" ? "∞" : `${user?.tokenBalance ?? 0}`}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                    {user?.role === "admin" ? "unlimited" : "tokens"}
                  </p>
                </div>
              </div>
            </div>

            {!isConfigured && (
              <div className="mt-6 border px-4 py-3 text-sm leading-6" style={{ borderColor: "var(--amber)", background: "#fff7df", color: "var(--ink)" }}>
                Midtrans belum dikonfigurasi. Tambahkan `MIDTRANS_SERVER_KEY` di API environment untuk mengaktifkan checkout.
              </div>
            )}

            {isLoading ? (
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((item) => <div key={item} className="h-52 animate-pulse" style={{ background: "var(--surface-2)" }} />)}
              </div>
            ) : packages.length === 0 ? (
              <EmptyState title="No packages yet" body="Token packages have not been configured." />
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {packages.map((pkg) => (
                  <PackageOption
                    key={pkg.id}
                    tokenPackage={pkg}
                    disabled={!isConfigured || checkoutMutation.isPending}
                    isPending={checkoutMutation.isPending && checkoutMutation.variables === pkg.id}
                    onCheckout={() => checkoutMutation.mutate(pkg.id)}
                  />
                ))}
              </div>
            )}

            {checkoutMutation.error && (
              <p className="mt-4 text-sm" style={{ color: "var(--red)" }}>
                {checkoutMutation.error instanceof Error ? checkoutMutation.error.message : "Failed to start checkout"}
              </p>
            )}
          </section>

          <aside className="min-w-0">
            <div className="border" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
              <div className="border-b p-4" style={{ borderColor: "var(--line)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Recent payments</p>
                <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>Pending payments can be refreshed after you return from Snap.</p>
              </div>
              {ordersQuery.isLoading ? (
                <div className="h-48 animate-pulse" style={{ background: "var(--surface-2)" }} />
              ) : orders.length === 0 ? (
                <EmptyState title="No payments" body="Your checkout history will appear here." compact />
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--line)" }}>
                  {orders.map((order) => (
                    <PaymentOrderRow
                      key={order.id}
                      order={order}
                      isSyncing={syncMutation.isPending && syncMutation.variables === order.id}
                      onSync={() => syncMutation.mutate(order.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </StudioFrame>
  );
}

function PackageOption({
  tokenPackage,
  disabled,
  isPending,
  onCheckout,
}: {
  tokenPackage: TokenPackage;
  disabled: boolean;
  isPending: boolean;
  onCheckout: () => void;
}) {
  const value = tokenPackage.priceIdr / Math.max(1, tokenPackage.tokenAmount);
  return (
    <article className="flex min-h-[220px] flex-col border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{tokenPackage.name}</p>
      <p className="mt-4 text-4xl font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>{tokenPackage.tokenAmount}</p>
      <p className="mt-1 text-xs uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>tokens</p>
      <p className="mt-4 min-h-[40px] text-sm leading-5" style={{ color: "var(--muted)" }}>{tokenPackage.description}</p>
      <div className="mt-auto pt-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-lg font-semibold" style={{ color: "var(--ink)" }}>{formatIdr(tokenPackage.priceIdr)}</p>
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>{formatIdr(Math.round(value))} / token</p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={onCheckout}
            className="px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--blueprint)", color: "#ffffff" }}
          >
            {isPending ? "Opening..." : "Checkout"}
          </button>
        </div>
      </div>
    </article>
  );
}

function PaymentOrderRow({ order, isSyncing, onSync }: { order: PaymentOrder; isSyncing: boolean; onSync: () => void }) {
  const canSync = order.status === "pending" || order.status === "review";
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>{order.package.name}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{formatIdr(order.amountIdr)} / {order.tokenAmount} tokens</p>
        </div>
        <StatusBadge status={order.status} needsManualReview={order.needsManualReview} />
      </div>
      {order.failureReason && <p className="mt-2 text-xs leading-5" style={{ color: "var(--red)" }}>{order.failureReason}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px]" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{formatDate(order.createdAt)}</p>
        {canSync && (
          <button
            type="button"
            disabled={isSyncing}
            onClick={onSync}
            className="border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
            style={{ borderColor: "var(--line)", color: "var(--ink)", background: "var(--bg)" }}
          >
            {isSyncing ? "Checking..." : "Check status"}
          </button>
        )}
      </div>
      {order.status === "pending" && order.snapRedirectUrl && (
        <a className="mt-3 inline-block text-xs font-semibold" style={{ color: "var(--blueprint)" }} href={order.snapRedirectUrl}>
          Continue payment
        </a>
      )}
    </div>
  );
}

function StatusBadge({ status, needsManualReview }: { status: string; needsManualReview?: boolean }) {
  const tone = status === "paid" ? "var(--green)" : status === "pending" ? "var(--amber)" : status.includes("refund") || status === "chargeback" ? "var(--red)" : "var(--muted)";
  return (
    <span className="shrink-0 border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ borderColor: tone, color: tone, fontFamily: "var(--font-mono)" }}>
      {needsManualReview ? "review" : status.replace(/_/g, " ")}
    </span>
  );
}

function EmptyState({ title, body, compact }: { title: string; body: string; compact?: boolean }) {
  return (
    <div className={compact ? "p-6" : "mt-6 border p-8"} style={{ borderColor: "var(--line)", background: compact ? "transparent" : "var(--surface)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{title}</p>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{body}</p>
    </div>
  );
}

function formatIdr(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
