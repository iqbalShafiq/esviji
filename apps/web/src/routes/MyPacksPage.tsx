import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StudioFrame } from "../components/layout/StudioFrame.js";
import { listPacks } from "../lib/api.js";

export default function MyPacksPage() {
  const { data: packs = [], isLoading, error } = useQuery({
    queryKey: ["packs", "list"],
    queryFn: listPacks,
  });

  return (
    <StudioFrame>
      <main className="h-[calc(100vh-56px)] overflow-y-auto" style={{ background: "var(--bg)" }}>
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                Library
              </p>
              <h1 className="mt-2 text-3xl font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>
                My Packs
              </h1>
            </div>
            <Link
              to="/assets/new"
              className="px-4 py-2.5 text-sm font-semibold transition-colors"
              style={{ background: "var(--blueprint)", color: "#ffffff" }}
            >
              New SVG
            </Link>
          </div>

          {isLoading && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-72 animate-pulse" style={{ background: "var(--surface-2)" }} />
              ))}
            </div>
          )}

          {error && (
            <div className="border p-5" style={{ borderColor: "var(--red)", background: "var(--surface)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--red)" }}>
                Failed to load packs
              </p>
            </div>
          )}

          {!isLoading && packs.length === 0 && (
            <div className="flex min-h-[420px] flex-col items-center justify-center border text-center" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                No packs yet
              </p>
              <p className="mt-2 max-w-sm text-xs leading-5" style={{ color: "var(--muted)" }}>
                Add generated SVGs into a pack from the asset builder, then continue the family here.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {packs.map((pack) => (
              <Link
                key={pack.id}
                to={`/packs/${pack.id}`}
                className="group flex min-h-[280px] flex-col border p-4 transition-all hover:-translate-y-0.5"
                style={{ borderColor: "var(--line)", background: "var(--surface)" }}
              >
                <div className="grid aspect-[16/9] grid-cols-4 grid-rows-2 gap-2 overflow-hidden" style={{ background: "var(--bg)" }}>
                  {(pack.thumbnails ?? []).slice(0, 8).map((asset, index) => (
                    <div
                      key={asset.id}
                      className={index === 0 ? "col-span-2 row-span-2 flex items-center justify-center" : "flex items-center justify-center"}
                      style={{ background: "var(--surface-2)" }}
                    >
                      {asset.finalPngPath ? (
                        <img
                          src={asset.finalPngPath}
                          alt={asset.name ?? asset.prompt}
                          className="h-3/4 w-3/4 object-contain transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="h-8 w-8" style={{ background: "var(--line)" }} />
                      )}
                    </div>
                  ))}
                  {(pack.thumbnails?.length ?? 0) === 0 && (
                    <div className="col-span-4 row-span-2 flex items-center justify-center text-xs font-mono" style={{ color: "var(--muted)" }}>
                      Empty pack
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-1 flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="line-clamp-2 text-base font-semibold leading-5" style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>
                      {pack.prompt}
                    </h2>
                    <span className="shrink-0 border px-2 py-1 text-[10px] font-mono" style={{ borderColor: "var(--line)", color: "var(--muted)", background: "var(--bg)" }}>
                      {pack.assetCount ?? pack.quantity}
                    </span>
                  </div>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
                      {pack.assetType.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: "var(--blueprint)" }}>
                      Open
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </StudioFrame>
  );
}
