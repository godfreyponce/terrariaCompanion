export type Intent = "warning" | "progression" | "general";

// "just got" intentionally NOT in PROGRESSION_RE — queries like
// "I just got the Water Bolt, what now?" anchor on a specific item
// the user already has (general), not on broadcasting forward-tier
// recommendations. Progression triggers on explicit forward-pivot
// language: "what's next", "after X", "stronger", etc.
const WARNING_RE = /\b(look out|watch out|dangerous|hazards?|what enemies|safe to|risky)\b/i;
const PROGRESSION_RE =
  /\b(what'?s? next|after|just beat|now what|stronger|upgrade|better than|next tier)\b/i;

export function classifyIntent(query: string): Intent {
  if (WARNING_RE.test(query)) return "warning";
  if (PROGRESSION_RE.test(query)) return "progression";
  return "general";
}
