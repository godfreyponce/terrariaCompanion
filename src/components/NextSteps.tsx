"use client";

export function NextSteps({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <section aria-label="next steps" className="pt-1">
      <h2 className="text-xs uppercase tracking-wider text-[var(--color-text-mute)]">
        next
      </h2>
      <ul className="mt-1 space-y-1">
        {steps.map((s, i) => (
          <li key={i} className="text-sm text-[var(--color-text-dim)] leading-snug">
            <span aria-hidden className="text-[var(--color-text-mute)] mr-2">→</span>
            {s}
          </li>
        ))}
      </ul>
    </section>
  );
}
