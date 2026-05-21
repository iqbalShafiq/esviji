import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  tone?: "default" | "blueprint" | "cyan" | "amber";
}

interface DropdownSelectProps {
  id: string;
  label?: string;
  value: string;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  trailingAction?: {
    label: string;
    icon: ReactNode;
    disabled?: boolean;
    onClick: () => void;
  };
  onValueChange: (value: string) => void;
}

export function DropdownSelect({
  id,
  label,
  value,
  options,
  placeholder = "Select an option",
  disabled = false,
  trailingAction,
  onValueChange,
}: DropdownSelectProps) {
  const generatedId = useId();
  const listboxId = `${id}-${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  useEffect(() => {
    if (!open) return;

    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, options, value]);

  const selectOption = (option: DropdownOption) => {
    onValueChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return (next + options.length) % options.length;
      });
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        const option = options[activeIndex];
        if (option) selectOption(option);
      } else {
        setOpen(true);
      }
    }
  };

  return (
    <div ref={rootRef} className="relative flex flex-col gap-2">
      {label && (
        <label
          id={`${id}-label`}
          className="text-xs font-medium"
          style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
        >
          {label}
        </label>
      )}
      <div
        className="flex w-full items-stretch border transition-all"
        style={{
          background: "var(--bg)",
          borderColor: open ? "var(--blueprint)" : "var(--line)",
          color: "var(--ink)",
          boxShadow: open ? "0 0 0 3px rgba(20, 87, 217, 0.10)" : undefined,
        }}
      >
        <button
          ref={buttonRef}
          id={id}
          type="button"
          className="flex min-w-0 flex-1 items-center px-3 py-2.5 text-left text-sm transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          style={{ color: "var(--ink)" }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={label ? `${id}-label ${id}` : undefined}
          aria-controls={listboxId}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={handleKeyDown}
        >
          <span className="min-w-0">
            <span
              className="block truncate font-medium"
              style={{ color: selectedOption ? "var(--ink)" : "var(--muted)" }}
            >
              {selectedOption?.label ?? placeholder}
            </span>
          </span>
        </button>
        {trailingAction && (
          <button
            type="button"
            className="flex w-9 shrink-0 items-center justify-center transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: "var(--muted)" }}
            title={trailingAction.label}
            aria-label={trailingAction.label}
            disabled={disabled || trailingAction.disabled}
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              trailingAction.onClick();
            }}
          >
            {trailingAction.icon}
          </button>
        )}
        <button
          type="button"
          className="flex w-9 shrink-0 items-center justify-center transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setOpen((current) => !current)}
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4 shrink-0 transition-transform duration-150"
            viewBox="0 0 16 16"
            fill="none"
            style={{
              color: open ? "var(--blueprint)" : "var(--muted)",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div
        id={listboxId}
        role="listbox"
        aria-hidden={!open}
        aria-labelledby={label ? `${id}-label` : undefined}
        className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto border p-1 transition-all duration-150"
        style={{
          background: "var(--surface)",
          borderColor: "var(--line)",
          boxShadow: "var(--shadow-soft)",
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0) scale(1)" : "translateY(-4px) scale(0.985)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          const active = index === activeIndex;
          return (
            <button
              key={option.value}
              id={`${listboxId}-${option.value || "empty"}`}
              type="button"
              role="option"
              aria-selected={selected}
              className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors"
              tabIndex={open ? 0 : -1}
              style={{
                background: selected
                  ? "var(--bg)"
                  : active
                    ? "rgba(238, 243, 248, 0.72)"
                    : "transparent",
                boxShadow: selected ? `inset 2px 0 0 ${toneColor(option.tone)}` : undefined,
                color: "var(--ink)",
              }}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectOption(option)}
            >
              <span
                className="mt-1 h-1.5 w-1.5 shrink-0"
                style={{ background: toneColor(option.tone) }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{option.label}</span>
                {option.description && (
                  <span className="mt-0.5 block text-[10px] leading-4" style={{ color: "var(--muted)" }}>
                    {option.description}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function toneColor(tone: DropdownOption["tone"] = "default"): string {
  switch (tone) {
    case "blueprint":
      return "var(--blueprint)";
    case "cyan":
      return "var(--cyan)";
    case "amber":
      return "var(--amber)";
    default:
      return "var(--muted)";
  }
}
