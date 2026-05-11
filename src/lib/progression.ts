import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Progression, ProgressionStage } from "../types.js";

export const PROGRESSION_FILE = path.resolve("data/progression.json");

const STAGE_ORDER: ProgressionStage[] = [
  "pre-bosses",
  "pre-hardmode",
  "hardmode-pre-mech",
  "hardmode-post-mech",
  "post-plantera",
  "post-golem",
  "post-moonlord",
];

// Boss → minimum stage placed in after defeat.
// Higher-tier boss wins via STAGE_ORDER comparison.
const BOSS_STAGE: Record<string, ProgressionStage> = {
  "King Slime": "pre-hardmode",
  "Eye of Cthulhu": "pre-hardmode",
  "Eater of Worlds": "pre-hardmode",
  "Brain of Cthulhu": "pre-hardmode",
  "Queen Bee": "pre-hardmode",
  "Skeletron": "pre-hardmode",
  "Deerclops": "pre-hardmode",
  "Wall of Flesh": "hardmode-pre-mech",
  "Queen Slime": "hardmode-pre-mech",
  "The Destroyer": "hardmode-post-mech",
  "The Twins": "hardmode-post-mech",
  "Skeletron Prime": "hardmode-post-mech",
  "Plantera": "post-plantera",
  "Golem": "post-golem",
  "Duke Fishron": "post-golem",
  "Empress of Light": "post-golem",
  "Lunatic Cultist": "post-golem",
  "Moon Lord": "post-moonlord",
};

export function deriveStage(bossesDefeated: string[]): ProgressionStage {
  let highest: ProgressionStage = "pre-bosses";
  for (const b of bossesDefeated) {
    const s = BOSS_STAGE[b];
    if (s && STAGE_ORDER.indexOf(s) > STAGE_ORDER.indexOf(highest)) highest = s;
  }
  return highest;
}

export const SEED_PROGRESSION: Progression = {
  stage: "pre-bosses",
  bosses_defeated: [],
  current_armor: "",
  key_accessories: [],
  world_type: "corruption",
  notes: "",
};

export async function readProgression(): Promise<Progression> {
  try {
    const raw = await fs.readFile(PROGRESSION_FILE, "utf8");
    return JSON.parse(raw) as Progression;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      await writeProgression(SEED_PROGRESSION);
      return { ...SEED_PROGRESSION };
    }
    throw err;
  }
}

export async function writeProgression(p: Progression): Promise<void> {
  await fs.mkdir(path.dirname(PROGRESSION_FILE), { recursive: true });
  await fs.writeFile(PROGRESSION_FILE, JSON.stringify(p, null, 2));
}

export const ProgressionInputSchema = z.object({
  stage: z
    .enum([
      "pre-bosses",
      "pre-hardmode",
      "hardmode-pre-mech",
      "hardmode-post-mech",
      "post-plantera",
      "post-golem",
      "post-moonlord",
    ])
    .optional(),
  bosses_defeated: z.array(z.string()).optional(),
  current_armor: z.string().nullable().optional(),
  key_accessories: z.array(z.string()).optional(),
  world_type: z.enum(["corruption", "crimson"]).optional(),
  notes: z.string().optional(),
});

export type ProgressionInput = z.infer<typeof ProgressionInputSchema>;

export function normalizeProgressionInput(input: ProgressionInput, base = SEED_PROGRESSION): Progression {
  return {
    stage: input.stage ?? base.stage,
    bosses_defeated: input.bosses_defeated ?? base.bosses_defeated,
    current_armor: input.current_armor ?? base.current_armor ?? "",
    key_accessories: input.key_accessories ?? base.key_accessories,
    world_type: input.world_type ?? base.world_type,
    notes: input.notes ?? base.notes,
  };
}

export function mergeProgression(current: Progression, patch: Partial<Progression>): Progression {
  const next: Progression = {
    ...current,
    ...patch,
    bosses_defeated: patch.bosses_defeated ?? current.bosses_defeated,
    key_accessories: patch.key_accessories ?? current.key_accessories,
  };
  if (!patch.stage) next.stage = deriveStage(next.bosses_defeated);
  return next;
}
