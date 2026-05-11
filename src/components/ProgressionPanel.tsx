"use client";
import { useState } from "react";
import type { Progression, ProgressionStage, WorldType } from "@/types";

const STAGE_LABELS: Record<ProgressionStage, string> = {
  "pre-bosses": "Pre-bosses",
  "pre-hardmode": "Pre-Hardmode",
  "hardmode-pre-mech": "Hardmode · pre-mech",
  "hardmode-post-mech": "Hardmode · post-mech",
  "post-plantera": "Post-Plantera",
  "post-golem": "Post-Golem",
  "post-moonlord": "Post-Moonlord",
};

const STAGE_OPTIONS: ProgressionStage[] = [
  "pre-bosses",
  "pre-hardmode",
  "hardmode-pre-mech",
  "hardmode-post-mech",
  "post-plantera",
  "post-golem",
  "post-moonlord",
];

type Props = {
  progression: Progression;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Progression>) => Promise<void>;
};

export function ProgressionPanel({ progression, expanded, onToggle, onChange }: Props) {
  const [bossesText, setBossesText] = useState(progression.bosses_defeated.join(", "));
  const [accessoriesText, setAccessoriesText] = useState(
    progression.key_accessories.join(", "),
  );
  const [armor, setArmor] = useState(progression.current_armor);

  async function commitBosses() {
    const list = bossesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await onChange({ bosses_defeated: list });
  }

  async function commitAccessories() {
    const list = accessoriesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await onChange({ key_accessories: list });
  }

  async function commitArmor() {
    await onChange({ current_armor: armor });
  }

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
        aria-expanded={expanded}
      >
        <span className="text-[var(--color-accent)]">{STAGE_LABELS[progression.stage]}</span>
        <span className="text-[var(--color-text-mute)]">·</span>
        <span>{progression.world_type}</span>
        <span className="text-[var(--color-text-mute)]">·</span>
        <span>{progression.bosses_defeated.length} bosses</span>
        <span className="text-[var(--color-text-mute)] text-xs ml-1">{expanded ? "▴" : "▾"}</span>
      </button>

      {expanded ? (
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 min-w-[300px]">
          <Field label="stage">
            <select
              value={progression.stage}
              onChange={(e) => onChange({ stage: e.target.value as ProgressionStage })}
              className="bg-[var(--color-card-warm)] border border-[var(--color-border)] rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-[var(--color-accent)]/60"
            >
              {STAGE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--color-text-mute)]">
              auto-derived from bosses; override if needed
            </p>
          </Field>
          <Field label="world">
            <select
              value={progression.world_type}
              onChange={(e) => onChange({ world_type: e.target.value as WorldType })}
              className="bg-[var(--color-card-warm)] border border-[var(--color-border)] rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-[var(--color-accent)]/60"
            >
              <option value="corruption">corruption</option>
              <option value="crimson">crimson</option>
            </select>
          </Field>
          <Field label="bosses defeated">
            <input
              value={bossesText}
              onChange={(e) => setBossesText(e.target.value)}
              onBlur={commitBosses}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder="Eye of Cthulhu, Skeletron"
              className="bg-[var(--color-card-warm)] border border-[var(--color-border)] rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-[var(--color-accent)]/60"
            />
            <p className="mt-1 text-xs text-[var(--color-text-mute)]">comma-separated</p>
          </Field>
          <Field label="current armor">
            <input
              value={armor}
              onChange={(e) => setArmor(e.target.value)}
              onBlur={commitArmor}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder="Jungle armor"
              className="bg-[var(--color-card-warm)] border border-[var(--color-border)] rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-[var(--color-accent)]/60"
            />
          </Field>
          <Field label="key accessories">
            <input
              value={accessoriesText}
              onChange={(e) => setAccessoriesText(e.target.value)}
              onBlur={commitAccessories}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder="Hermes Boots, Magic Cuffs"
              className="bg-[var(--color-card-warm)] border border-[var(--color-border)] rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-[var(--color-accent)]/60"
            />
            <p className="mt-1 text-xs text-[var(--color-text-mute)]">comma-separated</p>
          </Field>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-[var(--color-text-mute)] mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
