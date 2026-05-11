"use client";
import { forwardRef, FormEvent } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (query: string) => void;
  disabled?: boolean;
};

export const QueryBar = forwardRef<HTMLInputElement, Props>(function QueryBar(
  { value, onChange, onSubmit, disabled },
  ref,
) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    onSubmit(q);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <span className="absolute inset-y-0 left-3 flex items-center text-[var(--color-text-mute)] text-sm pointer-events-none">
          /
        </span>
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
          }}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder="just got the Water Bolt, what now?"
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-9 py-3 text-base text-[var(--color-text)] placeholder:text-[var(--color-text-mute)] focus:outline-none focus:border-[var(--color-accent)]/60 disabled:opacity-60"
        />
        <span className="absolute inset-y-0 right-3 flex items-center text-[var(--color-text-mute)] text-xs">
          {disabled ? "…" : "⏎"}
        </span>
      </div>
    </form>
  );
});
