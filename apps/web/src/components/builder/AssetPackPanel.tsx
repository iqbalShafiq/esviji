import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignAssetToPack,
  createPack,
  listPacks,
} from "../../lib/api.js";
import { DropdownSelect } from "../common/DropdownSelect.js";
import type { AssetResponse } from "../../types/index.js";

interface AssetPackPanelProps {
  asset: AssetResponse;
  onAssetUpdated: (asset: AssetResponse) => void;
  onNewAsset?: () => void;
}

export function AssetPackPanel({
  asset,
  onAssetUpdated,
  onNewAsset,
}: AssetPackPanelProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedPackId, setSelectedPackId] = useState(asset.packId ?? "");
  const [newPackName, setNewPackName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    setSelectedPackId(asset.packId ?? "");
    setErrorMessage(undefined);
  }, [asset.id, asset.packId]);

  const { data: packs = [], isLoading } = useQuery({
    queryKey: ["packs", "list"],
    queryFn: listPacks,
  });

  const assignMutation = useMutation({
    mutationFn: (packId: string | null) =>
      assignAssetToPack(asset.id, packId),
    onSuccess: async (updatedAsset) => {
      setErrorMessage(undefined);
      setSelectedPackId(updatedAsset.packId ?? "");
      onAssetUpdated(updatedAsset);
      await queryClient.invalidateQueries({ queryKey: ["packs", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["assets", "list"] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update pack");
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createPack({
        prompt: newPackName.trim(),
        assetType: inferPackType(asset.assetType),
        style: asset.style,
      }),
    onSuccess: async (pack) => {
      setNewPackName("");
      await queryClient.invalidateQueries({ queryKey: ["packs", "list"] });
      const updatedAsset = await assignAssetToPack(asset.id, pack.id);
      setSelectedPackId(updatedAsset.packId ?? "");
      onAssetUpdated(updatedAsset);
      await queryClient.invalidateQueries({ queryKey: ["assets", "list"] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create pack");
    },
  });

  const isBusy = assignMutation.isPending || createMutation.isPending;
  const currentPack = asset.pack ?? packs.find((pack) => pack.id === asset.packId);
  const canAssign = Boolean(selectedPackId) && selectedPackId !== asset.packId;

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            >
              SVG Pack
            </p>
            <h2
              className="mt-2 text-base font-semibold"
              style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}
            >
              {currentPack ? currentPack.prompt : "Unassigned asset"}
            </h2>
          </div>
          {currentPack && (
            <Link
              to={`/packs/${currentPack.id}`}
              className="text-xs font-semibold hover:underline"
              style={{ color: "var(--blueprint)" }}
            >
              Open
            </Link>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <MetaPill label={asset.assetType} />
          <MetaPill label={`${asset.output.width}x${asset.output.height}`} />
          <MetaPill label={asset.status} />
        </div>

        <div
          className="mt-5 border p-3"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        >
          <p className="text-xs font-semibold" style={{ color: "var(--ink)" }}>
            {asset.prompt}
          </p>
          <p className="mt-2 text-[10px] font-mono" style={{ color: "var(--muted)" }}>
            Created {formatDate(asset.createdAt)}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <DropdownSelect
            id="asset-pack-select"
            label="Add to existing pack"
            value={selectedPackId}
            placeholder="Select a pack"
            options={[
              {
                value: "",
                label: "Select a Pack",
                description: "Choose where this SVG should live",
                tone: "blueprint",
              },
              ...packs.map((pack) => ({
                value: pack.id,
                label: pack.prompt,
                description: `${pack.assetCount ?? pack.quantity} assets / ${pack.assetType.replace(/_/g, " ")}`,
                tone: "cyan" as const,
              })),
            ]}
            disabled={isLoading || isBusy}
            trailingAction={{
              label: "Open selected pack",
              icon: <OpenIcon />,
              disabled: !selectedPackId,
              onClick: () => {
                if (selectedPackId) navigate(`/packs/${selectedPackId}`);
              },
            }}
            onValueChange={setSelectedPackId}
          />
          <button
            type="button"
            className="w-full px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--blueprint)", color: "#ffffff" }}
            disabled={!canAssign || isBusy}
            onClick={() => assignMutation.mutate(selectedPackId)}
          >
            {assignMutation.isPending ? "Adding..." : "Add to Pack"}
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            htmlFor="asset-new-pack"
          >
            Create new pack
          </label>
          <input
            id="asset-new-pack"
            className="w-full border px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
            style={{
              background: "var(--bg)",
              borderColor: "var(--line)",
              color: "var(--ink)",
            }}
            placeholder="e.g. Finance dashboard icons"
            value={newPackName}
            disabled={isBusy}
            onChange={(event) => setNewPackName(event.target.value)}
          />
          <button
            type="button"
            className="w-full border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: "var(--line)",
              background: "var(--surface)",
              color: "var(--ink)",
            }}
            disabled={!newPackName.trim() || isBusy}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Creating..." : "Create Pack and Add"}
          </button>
        </div>

        {asset.packId && (
          <button
            type="button"
            className="mt-4 w-full border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: "var(--line)",
              background: "var(--surface)",
              color: "var(--red)",
            }}
            disabled={isBusy}
            onClick={() => assignMutation.mutate(null)}
          >
            Remove from Pack
          </button>
        )}

        {errorMessage && (
          <p className="mt-3 text-xs" style={{ color: "var(--red)" }}>
            {errorMessage}
          </p>
        )}
      </div>

      <div className="shrink-0 p-5 pt-4">
        <Link
          to="/assets/new"
          onClick={onNewAsset}
          className="block w-full px-4 py-3 text-center text-sm font-semibold transition-colors"
          style={{ background: "var(--blueprint)", color: "#ffffff" }}
        >
          Add New Asset
        </Link>
      </div>
    </div>
  );
}

function OpenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 4H4.5C3.67157 4 3 4.67157 3 5.5V11.5C3 12.3284 3.67157 13 4.5 13H10.5C11.3284 13 12 12.3284 12 11.5V10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8.5 3H13V7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 8.5L12.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MetaPill({ label }: { label: string }) {
  return (
    <span
      className="border px-2 py-1 text-[10px] font-mono"
      style={{
        borderColor: "var(--line)",
        color: "var(--muted)",
        background: "var(--bg)",
      }}
    >
      {label}
    </span>
  );
}

function inferPackType(assetType: string): string {
  if (assetType.endsWith("_pack")) return assetType;
  if (assetType === "sticker") return "sticker_pack";
  return "icon_pack";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
