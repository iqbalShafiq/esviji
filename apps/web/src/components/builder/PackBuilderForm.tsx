import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ASSET_TYPES } from "@svg-builder/shared";
import type { BuildSvgPackRequest } from "@svg-builder/shared";
import { buildSvgPack } from "../../lib/api.js";

const PACK_ASSET_TYPES = ["icon_pack", "sticker_pack", "illustration_set"];

interface PackBuilderFormProps {
  onJobCreated: (jobId: string) => void;
  onSubmitStart?: () => void;
  onBuildError?: () => void;
}

export function PackBuilderForm({ onJobCreated, onSubmitStart, onBuildError }: PackBuilderFormProps) {
  const [form, setForm] = useState<BuildSvgPackRequest>({
    prompt: "",
    assetType: "icon_pack",
    quantity: 12,
    style: "",
    output: {
      width: 48,
      height: 48,
      formats: ["svg", "png"],
    },
    items: [],
    maxIterations: 3,
  });

  const [itemsText, setItemsText] = useState("");

  const mutation = useMutation({
    mutationFn: buildSvgPack,
    onSuccess: (data) => {
      onJobCreated(data.jobId);
    },
    onError: () => {
      onBuildError?.();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedItems = itemsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const request: BuildSvgPackRequest = {
      ...form,
      items: parsedItems.length > 0 ? parsedItems : undefined,
    };

    onSubmitStart?.();
    mutation.mutate(request);
  };

  const updateField = <K extends keyof BuildSvgPackRequest>(
    key: K,
    value: BuildSvgPackRequest[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateOutput = (
    key: keyof BuildSvgPackRequest["output"],
    value: unknown
  ) => {
    setForm((prev) => ({
      ...prev,
      output: { ...prev.output, [key]: value },
    }));
  };

  const isLoading = mutation.isPending;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col h-full overflow-hidden"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex-1 overflow-y-auto p-6 pb-0">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
          >
            Pack Command
          </h2>
          {isLoading && (
            <span
              className="text-xs font-mono animate-pulse"
              style={{ color: "var(--blueprint)" }}
            >
              building pack...
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
          >
            Prompt
          </label>
          <textarea
            rows={4}
            placeholder="Describe the icon pack or sticker set..."
            className="w-full px-3 py-2.5 text-sm border resize-none focus:outline-none focus:ring-2 transition-shadow"
            style={{
              background: "var(--bg)",
              borderColor: "var(--line)",
              color: "var(--ink)",
              fontFamily: "var(--font-body)",
            }}
            value={form.prompt}
            onChange={(e) => updateField("prompt", e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5 mt-4">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
          >
            Asset Type
          </label>
          <select
            className="w-full px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 transition-shadow appearance-none"
            style={{
              background: "var(--bg)",
              borderColor: "var(--line)",
              color: "var(--ink)",
            }}
            value={form.assetType}
            onChange={(e) => updateField("assetType", e.target.value)}
          >
            {PACK_ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 mt-4">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
          >
            Quantity
          </label>
          <input
            type="number"
            min={1}
            max={50}
            className="w-full px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 transition-shadow"
            style={{
              background: "var(--bg)",
              borderColor: "var(--line)",
              color: "var(--ink)",
            }}
            value={form.quantity}
            onChange={(e) => updateField("quantity", Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5 mt-4">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
          >
            Items (one per line or comma-separated)
          </label>
          <textarea
            rows={3}
            placeholder="home, search, settings, profile..."
            className="w-full px-3 py-2.5 text-sm border resize-none focus:outline-none focus:ring-2 transition-shadow"
            style={{
              background: "var(--bg)",
              borderColor: "var(--line)",
              color: "var(--ink)",
              fontFamily: "var(--font-body)",
            }}
            value={itemsText}
            onChange={(e) => setItemsText(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 mt-4">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
          >
            Style
          </label>
          <input
            type="text"
            placeholder="e.g. flat minimal, 3D isometric..."
            className="w-full px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 transition-shadow"
            style={{
              background: "var(--bg)",
              borderColor: "var(--line)",
              color: "var(--ink)",
            }}
            value={form.style || ""}
            onChange={(e) => updateField("style", e.target.value || undefined)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            >
              Width
            </label>
            <input
              type="number"
              className="w-full px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 transition-shadow"
              style={{
                background: "var(--bg)",
                borderColor: "var(--line)",
                color: "var(--ink)",
              }}
              value={form.output?.width}
              onChange={(e) => updateOutput("width", Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            >
              Height
            </label>
            <input
              type="number"
              className="w-full px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 transition-shadow"
              style={{
                background: "var(--bg)",
                borderColor: "var(--line)",
                color: "var(--ink)",
              }}
              value={form.output?.height}
              onChange={(e) => updateOutput("height", Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 mt-4">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
          >
            Max Iterations
          </label>
          <input
            type="number"
            min={1}
            max={8}
            className="w-full px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 transition-shadow"
            style={{
              background: "var(--bg)",
              borderColor: "var(--line)",
              color: "var(--ink)",
            }}
            value={form.maxIterations}
            onChange={(e) => updateField("maxIterations", Number(e.target.value))}
          />
        </div>
      </div>

      <div className="shrink-0 p-6 pt-4">
        <button
          type="submit"
          disabled={isLoading || !form.prompt.trim()}
          className="w-full py-3 px-4 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "var(--blueprint)",
            color: "#ffffff",
          }}
        >
          {isLoading ? "Building Pack..." : "Generate Pack"}
        </button>

        {mutation.error && (
          <p className="text-xs mt-2" style={{ color: "var(--red)" }}>
            {mutation.error instanceof Error
              ? mutation.error.message
              : "Pack build failed"}
          </p>
        )}
      </div>
    </form>
  );
}
