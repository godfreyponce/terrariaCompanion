import OpenAI from "openai";
import { z } from "zod";
import type { Chunk, Progression, ProgressionStage, QueryResponse } from "../types.js";
import type { Intent } from "./intent.js";

export const LLM_MODEL = "gpt-4o-mini";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  _client = new OpenAI({ apiKey: key });
  return _client;
}

const QueryItemSchema = z.object({
  name: z.string().min(1),
  image_url: z.string(),
  why_it_matters: z.string(),
});

export const QueryResponseSchema = z.object({
  items: z.array(QueryItemSchema).max(3),
  next_steps: z.array(z.string()).min(1).max(3),
  warnings: z.array(z.string()),
});

export const JSON_RESPONSE_SCHEMA = {
  name: "MageCompanionResponse",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            image_url: { type: "string" },
            why_it_matters: { type: "string" },
          },
          required: ["name", "image_url", "why_it_matters"],
        },
      },
      next_steps: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: ["items", "next_steps", "warnings"],
  },
} as const;

const STAGE_HINTS: Record<ProgressionStage, string> = {
  "pre-bosses": "",
  "pre-hardmode":
    "pre-hardmode mage weapons armor demon scythe space gun water bolt meteor staff meteor armor jungle armor ancient cobalt armor",
  "hardmode-pre-mech":
    "early hardmode mage weapons armor crystal storm cursed flames frost staff cobalt armor mythril armor adamantite armor forbidden armor crystal assassin armor",
  "hardmode-post-mech":
    "post mech hardmode mage weapons armor magnet sphere golden shower cursed flames hallowed armor chlorophyte armor forbidden armor",
  "post-plantera":
    "post plantera mage weapons armor spectre staff bat scepter rainbow gun spectre armor chlorophyte armor hallowed armor",
  "post-golem":
    "post golem mage weapons armor nebula blaze razorblade typhoon inferno fork nebula armor spectre armor chlorophyte armor",
  "post-moonlord":
    "endgame mage weapons armor last prism nebula blaze lunar flare nebula armor spectre armor",
};

// Returns a forward-progression query (hints only, no user-query bleed) for the
// synth pass of dual retrieval, or null when the player is pre-bosses.
export function buildSynthRetrievalQuery(progression: Progression): string | null {
  return STAGE_HINTS[progression.stage] || null;
}

function formatChunk(c: Chunk): string {
  return `[${c.page_title} > ${c.section}]
url: ${c.page_url}
image_url: ${c.image_url || "(none)"}
categories: ${c.categories.join(", ")}

${c.text}`;
}

const RECOMMEND_RULE_STRICT =
  "- Use ONLY the RAG context for facts. If context lacks an answer, set items=[] and put the gap in next_steps.";

const RECOMMEND_RULE_PERMISSIVE =
  "- Use ONLY the RAG context for facts. The user asked about progression — when the chunks contain mage-relevant items at a tier beyond the user's current gear, recommend them even if no direct generic-tier successor is in the chunks. Bridge to the mage-relevant next tier. Set items=[] only when chunks truly contain no applicable mage item.";

const WARNING_FOCUS_NOTE =
  "- This is a warning/hazard query. Prioritize warnings about enemies, environmental dangers, or progression risks from the chunks. items=[] is typically correct here unless the chunks describe defensive gear specifically suited to the danger.";

export function buildSystemPrompt(
  progression: Progression,
  chunks: Chunk[],
  intent: Intent = "general",
): string {
  const recommendRule =
    intent === "progression" ? RECOMMEND_RULE_PERMISSIVE : RECOMMEND_RULE_STRICT;
  const intentNote = intent === "warning" ? `\n${WARNING_FOCUS_NOTE}` : "";

  return `You are a Terraria mage-class companion. The user is playing a mage and looks at you for ~5 seconds between mouse clicks.

RULES:
- Output JSON only, matching the provided schema.
- ≤3 items, each why_it_matters ≤20 words.
- Mage lens: weapons must be magic; armor must benefit magic damage/crit/mana; accessories prioritized by mage value.
- Progression-aware: never recommend items the user can't reasonably reach.
${recommendRule}
- next_steps MUST contain at least 1 entry — never return an empty array. If you have no item recommendations, state the gap as a next_step (e.g. "ask the wiki about X" or "explore Y biome").
- image_url must be copied verbatim from the RAG context. Never invent URLs. If the chunk has no image_url, use "" for that item.
- warnings: include only when the chunks describe a real risk; otherwise return [].${intentNote}

USER PROGRESSION:
${JSON.stringify(progression, null, 2)}

RAG CONTEXT (top retrieved chunks):
${chunks.map(formatChunk).join("\n\n---\n\n")}`;
}

export function filterInventedImageUrls(
  response: QueryResponse,
  chunks: Chunk[],
): QueryResponse {
  const allowed = new Set(chunks.map((c) => c.image_url).filter(Boolean));
  return {
    ...response,
    items: response.items.map((item) =>
      item.image_url && !allowed.has(item.image_url)
        ? { ...item, image_url: "" }
        : item,
    ),
  };
}

export async function answer(
  userQuery: string,
  progression: Progression,
  chunks: Chunk[],
  intent: Intent = "general",
): Promise<QueryResponse> {
  const system = buildSystemPrompt(progression, chunks, intent);
  const completion = await client().chat.completions.create({
    model: LLM_MODEL,
    temperature: 0.3,
    response_format: { type: "json_schema", json_schema: JSON_RESPONSE_SCHEMA },
    messages: [
      { role: "system", content: system },
      { role: "user", content: userQuery },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("LLM returned no content");
  const parsed = QueryResponseSchema.parse(JSON.parse(raw));
  return filterInventedImageUrls(parsed, chunks);
}

export async function* answerStream(
  userQuery: string,
  progression: Progression,
  chunks: Chunk[],
  intent: Intent = "general",
): AsyncIterable<string> {
  const system = buildSystemPrompt(progression, chunks, intent);
  const stream = await client().chat.completions.create({
    model: LLM_MODEL,
    temperature: 0.3,
    response_format: { type: "json_schema", json_schema: JSON_RESPONSE_SCHEMA },
    stream: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userQuery },
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
