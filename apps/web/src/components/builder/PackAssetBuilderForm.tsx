import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { BuildSvgPackAssetRequest } from "@svg-builder/shared";
import { buildSvgPackAsset } from "../../lib/api.js";
import type { PackResponse } from "../../types/index.js";

interface PackAssetBuilderFormProps {
  pack: PackResponse;
  isSubmitting?: boolean;
  onJobCreated: (jobId: string) => void;
  onSubmitStart?: () => void;
  onBuildError?: () => void;
}

export function PackAssetBuilderForm({
  pack,
  isSubmitting = false,
  onJobCreated,
  onSubmitStart,
  onBuildError,
}: PackAssetBuilderFormProps) {
  const [form, setForm] = useState<BuildSvgPackAssetRequest>({
    prompt: "",
    assetType: inferAssetType(pack.assetType),
    mode: "direct",
    output: {
      width: pack.output?.width ?? pack.assets[0]?.output.width ?? 512,
      height: pack.output?.height ?? pack.assets[0]?.output.height ?? 512,
      formats: ["svg", "png"],
    },
    maxIterations: 4,
  });

  const mutation = useMutation({
    mutationFn: () => buildSvgPackAsset(pack.id, cleanRequest(form)),
    onSuccess: (data) => onJobCreated(data.jobId),
    onError: () => onBuildError?.(),
  });

  const isLoading = mutation.isPending || isSubmitting;

  const updateField = <K extends keyof BuildSvgPackAssetRequest>(
    key: K,
    value: BuildSvgPackAssetRequest[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const updateOutput = (key: keyof BuildSvgPackAssetRequest["output"], value: unknown) => {
    setForm((prev) => ({
      ...prev,
      output: { ...prev.output, [key]: value },
    }));
  };

  return (
    <form
      className="flex h-full flex-col overflow-hidden"
      style={{ background: "var(--surface)" }}
      onSubmit={(event) => {
        event.preventDefault();
        if (isLoading || !form.prompt.trim()) return;
        onSubmitStart?.();
        mutation.mutate();
      }}
    >
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              Pack Command
            </p>
            <h2 className="mt-2 text-base font-semibold leading-5" style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>
              {pack.prompt}
            </h2>
          </div>
          <span className="border px-2 py-1 text-[10px] font-mono" style={{ borderColor: "var(--line)", color: "var(--muted)", background: "var(--bg)" }}>
            {pack.assets.length} SVGs
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
            New SVG prompt
          </label>
          <textarea
            rows={5}
            className="w-full resize-none border px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
            style={{ background: "var(--bg)", borderColor: "var(--line)", color: "var(--ink)" }}
            placeholder="Describe the next SVG for this pack..."
            value={form.prompt}
            onChange={(event) => updateField("prompt", event.target.value)}
            required
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <NumberField label="Width" value={form.output.width} onChange={(value) => updateOutput("width", value)} />
          <NumberField label="Height" value={form.output.height} onChange={(value) => updateOutput("height", value)} />
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
            Max iterations
          </label>
          <input
            type="number"
            min={1}
            max={8}
            className="w-full border px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
            style={{ background: "var(--bg)", borderColor: "var(--line)", color: "var(--ink)" }}
            value={form.maxIterations}
            onChange={(event) => updateField("maxIterations", Number(event.target.value))}
          />
        </div>

        <div className="mt-5 border p-3" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--ink)" }}>
            Consistency context active
          </p>
          <p className="mt-1 text-[10px] leading-4" style={{ color: "var(--muted)" }}>
            New SVGs inherit this pack's shared style system, palette, stroke logic, canvas density, and existing asset rhythm.
          </p>
        </div>

        {mutation.error && (
          <p className="mt-3 text-xs" style={{ color: "var(--red)" }}>
            {mutation.error instanceof Error ? mutation.error.message : "Build failed"}
          </p>
        )}
      </div>

      <div className="shrink-0 p-5 pt-4">
        <button
          type="submit"
          disabled={isLoading || !form.prompt.trim()}
          className="w-full px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--blueprint)", color: "#ffffff" }}
        >
          {isLoading ? "Generating..." : "Add SVG to Pack"}
        </button>
      </div>
    </form>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
        {label}
      </label>
      <input
        type="number"
        className="w-full border px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
        style={{ background: "var(--bg)", borderColor: "var(--line)", color: "var(--ink)" }}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function cleanRequest(form: BuildSvgPackAssetRequest): BuildSvgPackAssetRequest {
  return {
    ...form,
    prompt: form.prompt.trim(),
  };
}

function inferAssetType(packAssetType: string): string {
  if (packAssetType.endsWith("_pack")) return packAssetType.replace(/_pack$/, "");
  if (packAssetType.endsWith("_set")) return packAssetType.replace(/_set$/, "");
  return packAssetType || "icon";
}
