"use client";

const GROUPS = [
  {
    label: "Progression",
    items: [
      "I just got the Wand of Sparking, what should I look for next?",
      "Just beat Eye of Cthulhu — what's next for a mage?",
    ],
  },
  {
    label: "Biome · Danger",
    items: [
      "What should I watch out for in the Jungle?",
      "Anything dangerous in the Dungeon?",
    ],
  },
  {
    label: "Item Lookup",
    items: ["Tell me about the Aqua Scepter", "What does Mana Flower do?"],
  },
] as const;

export function QueryExamples({ onPick }: { onPick: (q: string) => void }) {
  return (
    <section
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-4"
      aria-label="example queries"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
        {GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
            <h2
              className="text-[9px] uppercase tracking-widest text-[var(--color-text-mute)] leading-tight"
              style={{ fontFamily: "var(--font-pixel), monospace" }}
            >
              {group.label}
            </h2>
            <ul className="space-y-1.5">
              {group.items.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => onPick(q)}
                    className="group flex w-full items-start gap-2 text-left text-sm leading-snug text-[var(--color-text-dim)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    <span
                      aria-hidden
                      className="flex-none text-[var(--color-text-mute)] group-hover:text-[var(--color-accent)] transition-colors"
                    >
                      →
                    </span>
                    <span>{q}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
