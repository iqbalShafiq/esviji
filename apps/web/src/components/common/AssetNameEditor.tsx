import { useEffect, useState } from "react";

interface AssetNameEditorProps {
  value: string;
  isPending?: boolean;
  disabled?: boolean;
  onSave: (name: string) => void;
}

export function AssetNameEditor({
  value,
  isPending = false,
  disabled = false,
  onSave,
}: AssetNameEditorProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const trimmed = draft.trim();
  const normalizedCurrent = value.trim();
  const canSave = !disabled && !isPending && Boolean(trimmed) && trimmed !== normalizedCurrent;

  return (
    <form
      className="border p-3"
      style={{ borderColor: "var(--line)", background: "var(--bg)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        onSave(trimmed);
      }}
    >
      <label className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
        Asset name
      </label>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full border px-2 py-1.5 text-xs outline-none focus:ring-2"
          style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
          disabled={disabled || isPending}
        />
        <button
          type="submit"
          className="px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--blueprint)", color: "#fff" }}
          disabled={!canSave}
        >
          Save
        </button>
      </div>
    </form>
  );
}
