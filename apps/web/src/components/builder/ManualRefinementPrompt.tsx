import { useState } from "react";

interface ManualRefinementPromptProps {
  disabled?: boolean;
  isLoading?: boolean;
  onSubmit: (instruction: string) => Promise<void> | void;
}

export function ManualRefinementPrompt({
  disabled,
  isLoading,
  onSubmit,
}: ManualRefinementPromptProps) {
  const [instruction, setInstruction] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = instruction.trim();
    if (!trimmed || disabled || isLoading) return;
    await onSubmit(trimmed);
    setInstruction("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 px-4 py-3"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex flex-col gap-0.5 shrink-0">
        <span className="text-xs font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>
          Refine
        </span>
        <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
          Prompt fix
        </span>
      </div>
      <input
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        disabled={disabled || isLoading}
        placeholder="Describe what to improve, e.g. make the corners softer and add stroke detail..."
        className="min-w-0 flex-1 border px-3 py-2 text-xs font-mono outline-none disabled:opacity-50"
        style={{
          borderColor: "var(--line)",
          background: "var(--bg)",
          color: "var(--ink)",
        }}
      />
      <button
        type="submit"
        disabled={disabled || isLoading || instruction.trim().length === 0}
        className="px-3 py-2 text-xs font-mono font-semibold disabled:opacity-50"
        style={{
          background: "var(--blueprint)",
          color: "#fff",
        }}
      >
        {isLoading ? "Refining..." : "Apply"}
      </button>
    </form>
  );
}
