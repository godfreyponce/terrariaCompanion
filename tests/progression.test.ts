import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  deriveStage,
  mergeProgression,
  readProgression,
  writeProgression,
  SEED_PROGRESSION,
  PROGRESSION_FILE,
} from "@/lib/progression";
import type { Progression } from "@/types";

describe("deriveStage", () => {
  it("returns pre-bosses for empty list", () => {
    expect(deriveStage([])).toBe("pre-bosses");
  });

  it.each([
    [["Eye of Cthulhu"], "pre-hardmode"],
    [["King Slime"], "pre-hardmode"],
    [["Skeletron"], "pre-hardmode"],
    [["Wall of Flesh"], "hardmode-pre-mech"],
    [["The Destroyer"], "hardmode-post-mech"],
    [["The Twins"], "hardmode-post-mech"],
    [["Skeletron Prime"], "hardmode-post-mech"],
    [["Plantera"], "post-plantera"],
    [["Golem"], "post-golem"],
    [["Duke Fishron"], "post-golem"],
    [["Lunatic Cultist"], "post-golem"],
    [["Moon Lord"], "post-moonlord"],
  ])("single boss %j maps to %s", (bosses, stage) => {
    expect(deriveStage(bosses as string[])).toBe(stage);
  });

  it("highest-tier boss wins regardless of order", () => {
    expect(
      deriveStage(["Eye of Cthulhu", "Moon Lord", "King Slime"]),
    ).toBe("post-moonlord");
    expect(
      deriveStage(["Plantera", "Eye of Cthulhu", "Wall of Flesh"]),
    ).toBe("post-plantera");
  });

  it("unknown boss names are ignored, not crashed on", () => {
    expect(deriveStage(["NotARealBoss"])).toBe("pre-bosses");
    expect(deriveStage(["NotARealBoss", "Plantera"])).toBe("post-plantera");
  });
});

describe("mergeProgression", () => {
  const base: Progression = {
    stage: "pre-bosses",
    bosses_defeated: [],
    current_armor: "",
    key_accessories: [],
    world_type: "corruption",
    notes: "",
  };

  it("rederives stage when bosses_defeated changes", () => {
    const next = mergeProgression(base, { bosses_defeated: ["Wall of Flesh"] });
    expect(next.stage).toBe("hardmode-pre-mech");
  });

  it("preserves explicit stage override even if bosses changed", () => {
    const next = mergeProgression(base, {
      bosses_defeated: ["Wall of Flesh"],
      stage: "pre-hardmode",
    });
    expect(next.stage).toBe("pre-hardmode");
  });

  it("merges scalar fields and preserves untouched arrays", () => {
    const start: Progression = {
      ...base,
      bosses_defeated: ["Eye of Cthulhu"],
      key_accessories: ["Hermes Boots"],
    };
    const next = mergeProgression(start, {
      current_armor: "Meteor armor",
      notes: "trying space gun build",
    });
    expect(next.current_armor).toBe("Meteor armor");
    expect(next.notes).toBe("trying space gun build");
    expect(next.bosses_defeated).toEqual(["Eye of Cthulhu"]);
    expect(next.key_accessories).toEqual(["Hermes Boots"]);
    expect(next.stage).toBe("pre-hardmode");
  });
});

describe("readProgression / writeProgression", () => {
  const TMP = path.join(path.dirname(PROGRESSION_FILE), "progression.test-tmp.json");
  let original: string | null = null;

  beforeEach(async () => {
    try {
      original = await fs.readFile(PROGRESSION_FILE, "utf8");
    } catch {
      original = null;
    }
    try {
      await fs.unlink(PROGRESSION_FILE);
    } catch {
      /* missing is fine */
    }
  });

  afterEach(async () => {
    if (original !== null) {
      await fs.writeFile(PROGRESSION_FILE, original);
    } else {
      try {
        await fs.unlink(PROGRESSION_FILE);
      } catch {
        /* fine */
      }
    }
    try {
      await fs.unlink(TMP);
    } catch {
      /* fine */
    }
  });

  it("readProgression seeds the file if missing", async () => {
    const p = await readProgression();
    expect(p).toEqual(SEED_PROGRESSION);
    const raw = await fs.readFile(PROGRESSION_FILE, "utf8");
    expect(JSON.parse(raw)).toEqual(SEED_PROGRESSION);
  });

  it("write then read roundtrips", async () => {
    const updated: Progression = {
      ...SEED_PROGRESSION,
      bosses_defeated: ["Eye of Cthulhu"],
      stage: "pre-hardmode",
      current_armor: "Jungle armor",
      notes: "post-EoC, pre-WoF",
    };
    await writeProgression(updated);
    const read = await readProgression();
    expect(read).toEqual(updated);
  });
});
