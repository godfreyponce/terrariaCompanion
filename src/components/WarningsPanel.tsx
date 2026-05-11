"use client";

export function WarningsPanel({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <section
      className="rounded-md border bg-[var(--color-warn-bg)] border-[var(--color-warn-border)] p-3"
      aria-label="warnings"
    >
      <ul className="space-y-1">
        {warnings.map((w, i) => (
          <li key={i} className="flex gap-2 text-sm text-[var(--color-warn-text)] leading-snug">
            <span aria-hidden className="flex-none mt-[1px]">⚠</span>
            <span>{w}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
