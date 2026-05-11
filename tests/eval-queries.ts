// Permanent eval set for retrieval + LLM regression testing.
// NOT a vitest file (no .test.ts suffix) — vitest ignores it.
//
// Each entry pins the expected `intent` classification so the eval set
// also exercises the classifier (src/lib/intent.ts).
//
// Grow this file when a real-use query fails. Each entry should include
// the progression context that exposed the failure and a one-line "expect"
// describing the acceptance bar.

import type { Progression } from "@/types";
import type { Intent } from "@/lib/intent";

export type EvalQuery = {
  name: string;
  query: string;
  progression: Progression;
  intent: Intent;
  expect: string;
  notes?: string;
};

const EOC_PROGRESSION: Progression = {
  stage: "pre-hardmode",
  bosses_defeated: ["Eye of Cthulhu"],
  current_armor: "",
  key_accessories: [],
  world_type: "corruption",
  notes: "",
};

const FRESH_PROGRESSION: Progression = {
  stage: "pre-bosses",
  bosses_defeated: [],
  current_armor: "",
  key_accessories: [],
  world_type: "corruption",
  notes: "",
};

export const EVAL_QUERIES: EvalQuery[] = [
  {
    name: "water-bolt-pre-bosses",
    query: "I just got the Water Bolt, what now?",
    progression: FRESH_PROGRESSION,
    intent: "general",
    expect:
      "Top-8 retrieval has ≥3 Water Bolt chunks; LLM recommends Water Bolt + 1-2 adjacent mage items.",
  },
  {
    name: "post-eoc-whats-next",
    query: "Just beat Eye of Cthulhu, what's next for a mage?",
    progression: EOC_PROGRESSION,
    intent: "progression",
    expect:
      "Top-8 has Demon Scythe (or the Magic-weapons spell-books table chunk that prominently features it) AND ≥1 other forward-tier item (Meteor Staff, Diamond Staff, etc.). LLM returns ≥2 forward-tier mage items.",
  },
  {
    name: "jungle-warning",
    query: "What should I look out for in the Jungle?",
    progression: EOC_PROGRESSION,
    intent: "warning",
    expect:
      "Top-8 has ≥4 Jungle (biome) chunks. items=[] is acceptable; warnings should describe biome hazards. No off-topic armor recs.",
  },
  {
    name: "silver-armor-next-tier",
    query: "what is the next armour i can get after silver armor",
    progression: {
      ...EOC_PROGRESSION,
      current_armor: "Silver",
      key_accessories: ["Hermes Boots", "Magic Cuffs"],
    },
    intent: "progression",
    expect:
      "Top-8 has ≥1 of {Meteor_armor, Jungle_armor, Necro_armor}. LLM recommends a mage-relevant armor as the next tier — items=[] is a failure.",
    notes:
      "Seen failing 2026-05-11. Root cause two-part: STAGE_HINTS pre-hardmode lacked armor keywords (synth surfaced only weapons) AND the strict prompt made the LLM refuse to bridge tier gaps. Fixed by intent-aware routing: progression intent uses synth=3 + permissive prompt.",
  },
  {
    name: "underworld-warning",
    query: "what should I watch out for in the Underworld",
    progression: EOC_PROGRESSION,
    intent: "warning",
    expect:
      "Top-8 has Underworld biome / Hell-related chunks (Demon, Hellstone, Lava, Imp). items=[] is acceptable; warnings should describe hazards. No forward-tier armor recs.",
  },
  {
    name: "aqua-scepter-stronger",
    query: "I just got the Aqua Scepter, anything stronger?",
    progression: EOC_PROGRESSION,
    intent: "progression",
    expect:
      "Top-8 has Aqua Scepter AND ≥1 stronger mage weapon (Demon Scythe, Meteor Staff, Diamond Staff, etc.). LLM recommends ≥1 stronger weapon.",
  },
  {
    name: "wand-of-sparking-tell-me",
    query: "tell me about the Wand of Sparking",
    progression: FRESH_PROGRESSION,
    intent: "general",
    expect:
      "Top-8 dominated by Wand of Sparking content. LLM returns ≥1 item describing the Wand of Sparking.",
  },
];
