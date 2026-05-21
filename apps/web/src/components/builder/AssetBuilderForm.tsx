import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ASSET_TYPES } from "@svg-builder/shared";
import type { BuildSvgAssetRequest } from "@svg-builder/shared";
import { buildSvgAsset } from "../../lib/api.js";
import { DropdownSelect } from "../common/DropdownSelect.js";

interface AssetBuilderFormProps {
  onJobCreated: (jobId: string) => void;
  onSubmitStart?: () => void;
  onBuildError?: () => void;
  isSubmitting?: boolean;
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

const QUALITY_PRESET_OPTIONS = [
  {
    value: "fast",
    label: "Fast Draft",
    description: "2 passes, clean silhouette, quick exploration",
    tone: "cyan" as const,
  },
  {
    value: "balanced",
    label: "Balanced Studio",
    description: "4 passes, stable structure and readable detail",
    tone: "blueprint" as const,
  },
  {
    value: "high_fidelity",
    label: "High Fidelity",
    description: "6 passes, refined composition and consistency",
    tone: "amber" as const,
  },
];

const ASSET_TYPE_OPTIONS = [
  {
    value: "",
    label: "Auto Detect",
    description: "Let Esviji classify the asset from your prompt",
    tone: "blueprint" as const,
  },
  ...ASSET_TYPES.map((type) => ({
    value: type,
    label: formatAssetTypeLabel(type),
    description: getAssetTypeDescription(type),
    tone: getAssetTypeTone(type),
  })),
];

const MODE_OPTIONS = [
  {
    value: "direct",
    label: "Direct Build",
    description: "Prompt-first SVG generation",
    tone: "blueprint" as const,
  },
  {
    value: "reference",
    label: "Reference Guided",
    description: "Use an image URL as visual direction",
    tone: "cyan" as const,
  },
  {
    value: "premium",
    label: "Premium Studio",
    description: "More deliberate art direction and polish",
    tone: "amber" as const,
  },
];

const ASSET_BUILDER_DRAFT_KEY = "vectorlab.assetBuilderDraft.v1";

export function AssetBuilderForm({
  onJobCreated,
  onSubmitStart,
  onBuildError,
  isSubmitting = false,
}: AssetBuilderFormProps) {
  const [form, setForm] = useState<BuildSvgAssetRequest>(() => readDraft()?.form ?? {
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
  const [preset, setPreset] = useState<QualityPreset>(() => readDraft()?.preset ?? "balanced");

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
    if (isLoading || !form.prompt.trim()) return;
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
  const isLoading = mutation.isPending || isSubmitting;

  useEffect(() => {
    sessionStorage.setItem(
      ASSET_BUILDER_DRAFT_KEY,
      JSON.stringify({ form, preset }),
    );
  }, [form, preset]);

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

        <div className="mt-4">
          <DropdownSelect
            id="quality-preset"
            label="Quality Preset"
            value={preset}
            options={QUALITY_PRESET_OPTIONS}
            onValueChange={(value) => {
              const next = value as QualityPreset;
              setPreset(next);
              updateField("maxIterations", PRESET_CONFIG[next].maxIterations);
            }}
          />
        </div>

        <div className="mt-4">
          <DropdownSelect
            id="asset-type"
            label="Asset Type"
            value={form.assetType || ""}
            options={ASSET_TYPE_OPTIONS}
            onValueChange={(value) => updateField("assetType", value || undefined)}
          />
        </div>

        <div className="mt-4">
          <DropdownSelect
            id="asset-mode"
            label="Mode"
            value={form.mode}
            options={MODE_OPTIONS}
            onValueChange={(value) =>
              updateField(
                "mode",
                value as BuildSvgAssetRequest["mode"]
              )
            }
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

function formatAssetTypeLabel(type: string): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getAssetTypeDescription(type: string): string {
  if (type.includes("pack") || type.includes("set")) {
    return "Cohesive multi-asset family";
  }
  if (type.includes("logo") || type.includes("monogram") || type.includes("app_icon")) {
    return "Identity-focused vector mark";
  }
  if (type.includes("illustration") || type.includes("empty_state")) {
    return "Larger narrative SVG artwork";
  }
  if (type.includes("pattern") || type.includes("background")) {
    return "Surface asset for layouts and scenes";
  }
  return "Single polished SVG asset";
}

function getAssetTypeTone(type: string): "default" | "blueprint" | "cyan" | "amber" {
  if (type.includes("pack") || type.includes("set")) return "cyan";
  if (type.includes("logo") || type.includes("monogram") || type.includes("app_icon")) return "amber";
  if (type.includes("illustration") || type.includes("diagram") || type.includes("infographic")) {
    return "blueprint";
  }
  return "default";
}

function readDraft(): { form: BuildSvgAssetRequest; preset: QualityPreset } | undefined {
  try {
    const raw = sessionStorage.getItem(ASSET_BUILDER_DRAFT_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as { form: BuildSvgAssetRequest; preset: QualityPreset };
  } catch {
    return undefined;
  }
}
