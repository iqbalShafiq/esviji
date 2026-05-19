import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ASSET_TYPES } from "@svg-builder/shared";
import type { BuildSvgAssetRequest } from "@svg-builder/shared";
import { buildSvgAsset } from "../../lib/api.js";

interface AssetBuilderFormProps {
  onJobCreated: (jobId: string) => void;
  onSubmitStart?: () => void;
  onBuildError?: () => void;
}

type QualityPreset = "fast" | "balanced" | "high_fidelity";

const PRESET_CONFIG: Record<QualityPreset, { maxIterations: number; constraint: string }> = {
  fast: {
    maxIterations: 2,
    constraint:
      "Keep it simple and fast to generate. Prioritize clear silhouette and avoid complex details.",
  },
  balanced: {
    maxIterations: 4,
    constraint:
      "Balance speed and quality. Use clear hierarchy, stable layer grouping, and good readability at target size.",
  },
  high_fidelity: {
    maxIterations: 6,
    constraint:
      "Prioritize visual quality and consistency. Enforce precise composition, strong readability, and refined layer structure.",
  },
};

export function AssetBuilderForm({ onJobCreated, onSubmitStart, onBuildError }: AssetBuilderFormProps) {
  const [preset, setPreset] = useState<QualityPreset>("balanced");
  const [form, setForm] = useState<BuildSvgAssetRequest>({
    prompt: "",
    assetType: undefined,
    mode: "direct",
    style: "",
    output: {
      formats: ["svg", "png"],
      width: 512,
      height: 512,
    },
    referenceImageUrl: "",
    maxIterations: PRESET_CONFIG.balanced.maxIterations,
  });

  const mutation = useMutation({
    mutationFn: buildSvgAsset,
    onSuccess: (data) => {
      onJobCreated(data.jobId);
    },
    onError: () => {
      onBuildError?.();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitStart?.();

    const presetConfig = PRESET_CONFIG[preset];
    const request: BuildSvgAssetRequest = {
      ...form,
      maxIterations: presetConfig.maxIterations,
      prompt: `${form.prompt.trim()}\n\nQuality constraints: ${presetConfig.constraint}`,
    };

    mutation.mutate(request);
  };

  const updateField = <K extends keyof BuildSvgAssetRequest>(
    key: K,
    value: BuildSvgAssetRequest[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateOutput = (
    key: keyof BuildSvgAssetRequest["output"],
    value: unknown
  ) => {
    setForm((prev) => ({
      ...prev,
      output: { ...prev.output, [key]: value },
    }));
  };

  const currentStage: string | undefined = undefined;
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
            Command
          </h2>
          {isLoading && currentStage && (
            <span
              className="text-xs font-mono animate-pulse"
              style={{ color: "var(--blueprint)" }}
            >
              {currentStage}
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
            placeholder="Describe the SVG asset you want to create..."
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
            Quality Preset
          </label>
          <select
            className="w-full px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 transition-shadow appearance-none"
            style={{
              background: "var(--bg)",
              borderColor: "var(--line)",
              color: "var(--ink)",
            }}
            value={preset}
            onChange={(e) => {
              const next = e.target.value as QualityPreset;
              setPreset(next);
              updateField("maxIterations", PRESET_CONFIG[next].maxIterations);
            }}
          >
            <option value="fast">Fast</option>
            <option value="balanced">Balanced</option>
            <option value="high_fidelity">High Fidelity</option>
          </select>
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
            value={form.assetType || ""}
            onChange={(e) =>
              updateField("assetType", e.target.value || undefined)
            }
          >
            <option value="">Auto detect</option>
            {ASSET_TYPES.map((t) => (
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
            Mode
          </label>
          <select
            className="w-full px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 transition-shadow appearance-none"
            style={{
              background: "var(--bg)",
              borderColor: "var(--line)",
              color: "var(--ink)",
            }}
            value={form.mode}
            onChange={(e) =>
              updateField(
                "mode",
                e.target.value as BuildSvgAssetRequest["mode"]
              )
            }
          >
            <option value="direct">Direct</option>
            <option value="reference">Reference</option>
            <option value="premium">Premium</option>
          </select>
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
              onChange={(e) =>
                updateOutput("width", Number(e.target.value))
              }
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
              onChange={(e) =>
                updateOutput("height", Number(e.target.value))
              }
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
            onChange={(e) =>
              updateField("maxIterations", Number(e.target.value))
            }
          />
        </div>

        <div className="flex flex-col gap-1.5 mt-4">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
          >
            Reference Image URL
          </label>
          <input
            type="url"
            placeholder="https://..."
            className="w-full px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 transition-shadow"
            style={{
              background: "var(--bg)",
              borderColor: "var(--line)",
              color: "var(--ink)",
            }}
            value={form.referenceImageUrl || ""}
            onChange={(e) =>
              updateField("referenceImageUrl", e.target.value || undefined)
            }
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
          {isLoading ? "Building..." : "Generate Asset"}
        </button>

        {mutation.error && (
          <p className="text-xs mt-2" style={{ color: "var(--red)" }}>
            {mutation.error instanceof Error
              ? mutation.error.message
              : "Build failed"}
          </p>
        )}
      </div>
    </form>
  );
}
