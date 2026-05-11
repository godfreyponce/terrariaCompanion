import { describe, it, expect } from "vitest";
import { classifyIntent } from "@/lib/intent";

describe("classifyIntent", () => {
  it.each([
    ["I just got the Water Bolt, what now?", "general"],
    ["Just beat Eye of Cthulhu, what's next for a mage?", "progression"],
    ["What should I look out for in the Jungle?", "warning"],
    ["what is the next armour i can get after silver armor", "progression"],
    ["what should I watch out for in the Underworld", "warning"],
    ["I just got the Aqua Scepter, anything stronger?", "progression"],
    ["tell me about the Wand of Sparking", "general"],
  ])("classifies %j as %s", (q, expected) => {
    expect(classifyIntent(q)).toBe(expected);
  });

  it("warning beats progression when both match", () => {
    // hypothetical "what's next after the dangerous biome" — warning wins
    // because hazard-related queries should always go to the strict path.
    expect(classifyIntent("what's next after the dangerous part")).toBe("warning");
  });
});
