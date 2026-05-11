import { describe, it, expect } from "vitest";
import {
  buildSynthRetrievalQuery,
  buildSystemPrompt,
  filterInventedImageUrls,
  QueryResponseSchema,
} from "@/lib/llm";
import type { Chunk, Progression, QueryResponse } from "@/types";

const PROGRESSION_PRE: Progression = {
  stage: "pre-bosses",
  bosses_defeated: [],
  current_armor: "",
  key_accessories: [],
  world_type: "corruption",
  notes: "",
};

const PROGRESSION_POST_EOC: Progression = {
  stage: "pre-hardmode",
  bosses_defeated: ["Eye of Cthulhu"],
  current_armor: "Jungle armor",
  key_accessories: ["Hermes Boots"],
  world_type: "corruption",
  notes: "",
};

function chunk(image_url: string, title = "Water Bolt"): Chunk {
  return {
    id: `${title}#0`,
    page_title: title,
    page_url: `https://terraria.wiki.gg/wiki/${title.replace(/ /g, "_")}`,
    section: "Notes",
    text: `${title} > Notes\n\nbody`,
    image_url,
    categories: ["Magic weapons"],
    embedding: [],
  };
}

describe("buildSynthRetrievalQuery", () => {
  it("returns null when stage is pre-bosses", () => {
    expect(buildSynthRetrievalQuery(PROGRESSION_PRE)).toBeNull();
  });

  it("returns stage-targeted item keywords for non-pre-bosses stages", () => {
    const q = buildSynthRetrievalQuery(PROGRESSION_POST_EOC);
    expect(q).not.toBeNull();
    expect(q!).toContain("pre-hardmode mage weapons");
    expect(q!.toLowerCase()).toContain("space gun");
  });

  it("never includes boss names or current_armor (lessons-learned)", () => {
    const q = buildSynthRetrievalQuery(PROGRESSION_POST_EOC);
    expect(q!).not.toContain("Eye of Cthulhu");
    expect(q!).not.toContain("Jungle armor");
  });
});

describe("buildSystemPrompt", () => {
  it("includes the progression block and at least one chunk", () => {
    const chunks: Chunk[] = [chunk("https://terraria.wiki.gg/images/Water_Bolt.png")];
    const sys = buildSystemPrompt(PROGRESSION_POST_EOC, chunks);
    expect(sys).toContain("Terraria mage-class companion");
    expect(sys).toContain("USER PROGRESSION");
    expect(sys).toContain("Eye of Cthulhu");
    expect(sys).toContain("RAG CONTEXT");
    expect(sys).toContain("Water Bolt > Notes");
    expect(sys).toContain("https://terraria.wiki.gg/images/Water_Bolt.png");
  });
});

describe("QueryResponseSchema (zod)", () => {
  it("accepts a valid response", () => {
    const ok: QueryResponse = {
      items: [
        {
          name: "Water Bolt",
          image_url: "https://terraria.wiki.gg/images/Water_Bolt.png",
          why_it_matters: "Pierces and bounces.",
        },
      ],
      next_steps: ["kill EoW"],
      warnings: [],
    };
    expect(() => QueryResponseSchema.parse(ok)).not.toThrow();
  });

  it("rejects more than 3 items", () => {
    const bad = {
      items: Array.from({ length: 4 }, () => ({
        name: "x",
        image_url: "",
        why_it_matters: "y",
      })),
      next_steps: ["s"],
      warnings: [],
    };
    expect(() => QueryResponseSchema.parse(bad)).toThrow();
  });

  it("rejects an empty next_steps array", () => {
    expect(() =>
      QueryResponseSchema.parse({ items: [], next_steps: [], warnings: [] }),
    ).toThrow();
  });

  it("requires warnings to be present (empty array allowed)", () => {
    expect(() =>
      QueryResponseSchema.parse({ items: [], next_steps: ["a"] }),
    ).toThrow();
    expect(() =>
      QueryResponseSchema.parse({ items: [], next_steps: ["a"], warnings: [] }),
    ).not.toThrow();
  });
});

describe("filterInventedImageUrls", () => {
  const allowed = "https://terraria.wiki.gg/images/Water_Bolt.png";
  const chunks: Chunk[] = [chunk(allowed)];

  it("keeps image_urls that exist in retrieved chunks", () => {
    const resp: QueryResponse = {
      items: [{ name: "Water Bolt", image_url: allowed, why_it_matters: "x" }],
      next_steps: ["s"],
      warnings: [],
    };
    const out = filterInventedImageUrls(resp, chunks);
    expect(out.items[0].image_url).toBe(allowed);
  });

  it("drops image_urls not in any retrieved chunk", () => {
    const resp: QueryResponse = {
      items: [
        {
          name: "Bogus",
          image_url: "https://example.com/fake.png",
          why_it_matters: "x",
        },
      ],
      next_steps: ["s"],
      warnings: [],
    };
    const out = filterInventedImageUrls(resp, chunks);
    expect(out.items[0].image_url).toBe("");
  });

  it("leaves empty image_url alone", () => {
    const resp: QueryResponse = {
      items: [{ name: "x", image_url: "", why_it_matters: "y" }],
      next_steps: ["s"],
      warnings: [],
    };
    const out = filterInventedImageUrls(resp, chunks);
    expect(out.items[0].image_url).toBe("");
  });
});
