import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  intent?: "danger" | "primary";
  isPending?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  intent = "primary",
  isPending = false,
  onConfirm,
  onOpenChange,
}: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    lastActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = originalOverflow;
      lastActiveElementRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) {
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPending, onOpenChange, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-hidden={false}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(7, 17, 31, 0.48)" }}
        aria-label="Close confirmation dialog"
        disabled={isPending}
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-md border p-5 shadow-2xl"
        style={{
          background: "var(--surface)",
          borderColor: "var(--line)",
          color: "var(--ink)",
        }}
      >
        <div className="flex flex-col gap-2">
          <h2
            id={titleId}
            className="text-base font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h2>
          <p id={descriptionId} className="text-sm leading-6" style={{ color: "var(--muted)" }}>
            {description}
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            className="px-4 py-2 text-sm font-semibold border transition-colors disabled:opacity-60"
            style={{
              borderColor: "var(--line)",
              color: "var(--ink)",
              background: "var(--surface)",
            }}
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: intent === "danger" ? "var(--red)" : "var(--blueprint)",
              color: "#ffffff",
            }}
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
