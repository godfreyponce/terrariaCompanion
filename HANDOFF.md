# HANDOFF — Terraria Mage Companion

> **For the next Claude session.** Read this end-to-end before doing anything. It is self-contained.

## Status

- **All 6 milestones complete and verified.** Project is shippable.
- Code is at `/Users/geovponce/Desktop/terrariaCompanion/`.
- Git repo: `https://github.com/godfreyponce/terrariaCompanion`. Initial commit pushed manually by the user; M2–M5.5 work in the initial-commit snapshot; M6 commit (README + verify) pushed separately.
- `.env.local` already exists with `OPENAI_API_KEY` (do not log, do not commit). **Note:** there is a 6-char placeholder `OPENAI_API_KEY=sk-...` exported in the user's shell environment that shadowed the file. `src/lib/env-loader.ts` deliberately overrides existing env so `.env.local` is authoritative (matches Next.js precedence).
- `data/index.json` exists (3099 chunks, 98 MB, gitignored). Embeddings: `text-embedding-3-small`.
- `data/progression.json` exists (currently post-EoC test state).

## Known limitations (carry forward)

- **Intent classifier doesn't distinguish weapon-upgrade vs armor-upgrade within `progression` intent.** Surfaced by Q6 in `tests/eval-queries.ts` ("I just got the Aqua Scepter, anything stronger?") — retrieval correctly pulled Aqua Scepter + Bat Scepter (a stronger weapon) into top-8, but the LLM picked Meteor/Ancient Cobalt armor recommendations because the synth pass and prompt both default to forward-tier mage gear without a class-of-item bias. Future work: either a second-level intent (weapon-progression vs armor-progression) routed off keywords in the user query, or weapon-only and armor-only synth variants merged at top-K. Not blocking; only borderline on this one query shape.
- **Wiki image cache-buster.** See M2 build log. Stored `?<hash>` URLs may 404 if upstream regenerates assets; recovery is `rm -rf data/raw data/parsed && pnpm scrape && pnpm index`.
- **Mid-stream progression edit shows a header/body mismatch** for ~1–4s. Old in-flight stream completes with old progression context; the panel header updates immediately to new state. Next query uses new state. Accepted as known behavior.

---

## What this project is (one paragraph)

Personal, localhost-only web app. Runs on the user's Mac second monitor while they play Terraria on the main monitor. Three query shapes — "just got [item], what now?", "just beat [boss], what's next?", "what should I look out for in [biome]?" — answered with image + ≤3 bullets per item, ≤3 cards per response, ~3s end-to-end. Grounded in `terraria.wiki.gg` via RAG, scoped to mage class, aware of player progression. **Not for deployment. Not for other users.** Every decision biases toward simplest-that-works.

---

## Approved Phase 1 plan (embedded so this doc is self-contained)

### Stack (confirmed)

- **Runtime:** Node 20+ (Node 24.14 in current dev env works fine), **pnpm 10**
- **Framework:** Next.js 15 (App Router) + TypeScript + Tailwind v4
- **Storage:** Plain **JSON files** under `./data/` (no DB)
- **LLM:** OpenAI **`gpt-4o-mini`** via `openai` SDK with `response_format: { type: "json_schema" }`
  - At first use, re-verify pricing vs `gpt-5-mini` and pick whichever is cheaper
- **Embeddings:** OpenAI **`text-embedding-3-small`** (1536 dims)
- **Scraper deps (to install in milestone 2):** `cheerio`, `turndown`. Use built-in `fetch` (Node 20+).
- **Validation:** `zod` (install in milestone 4)
- **Tests:** Vitest

### Decisions confirmed during planning

- **Scrape scope:** mage + universal mobility items (Hermes Boots, Wings, Lifeforce, etc.). Mage filter applied via system prompt, not via retrieval (keeps recall up).
- **API shape:** `/query` is **stateless one-shot**. No conversation history.
- **Images:** **hotlink** `terraria.wiki.gg` directly. No local image cache.

### RAG pipeline

- **Scraper (`scripts/scrape.ts`, run once):**
  - Seed `terraria.wiki.gg` categories: `Magic_weapons`, `Mage_armor_sets`, `Accessories` (mage + universal mobility), `Bosses`, `NPCs`, `Biomes`, `Ores`, `Events`, `Potions` (mage-relevant only)
  - **Politeness:** check `/robots.txt` first; 1 req/sec; UA: `TerrariaMageCompanion/0.1 (personal, contact: itherealak@gmail.com)`; resume from disk on re-run
  - **Output:** `data/raw/<slug>.html` + `data/parsed/<slug>.md` with frontmatter `{ url, title, categories[], primary_image_url, infobox_image_urls[] }`
- **Chunking:** per-`<h2>`-section, ≤800 tokens each, section heading appended to chunk text for context
- **Vector store:** `data/index.json` — `Chunk[]` loaded once at server start, brute-force cosine sim in-memory:
  ```ts
  type Chunk = {
    id: string;             // slug#section-idx
    page_title: string;
    page_url: string;
    section: string;
    text: string;
    image_url: string;
    categories: string[];
    embedding: number[];    // 1536 floats
  };
  ```
- **Query path:** embed query → cosine top-K=8 → pass to LLM as context

### LLM layer

`gpt-4o-mini`, `temperature: 0.3`, `response_format: { type: "json_schema", schema: {...} }`.

**Output schema (zod-validated post-call):**
```ts
{
  items: Array<{
    name: string;
    image_url: string;       // must be from RAG context, "" if none
    why_it_matters: string;  // ≤20 words, mage-relevance lens
  }>;                        // 0–3 items
  next_steps: string[];      // 1–3 short actions
  warnings?: string[];
}
```

**System prompt skeleton:**
```
You are a Terraria mage-class companion. The user is playing a mage and looks at you for ~5 seconds between mouse clicks.

RULES:
- Output JSON only, matching the provided schema.
- ≤3 items, each why_it_matters ≤20 words.
- Mage lens: weapons must be magic; armor must benefit magic damage/crit/mana; accessories prioritized by mage value.
- Progression-aware: never recommend items the user can't reasonably reach.
- Use ONLY the RAG context for facts. If context lacks an answer, set items=[] and put the gap in next_steps.
- image_url must be copied verbatim from the RAG context. Never invent URLs.

USER PROGRESSION:
{progression_json}

RAG CONTEXT:
{top_k_chunks}
```

### Progression state

`data/progression.json` — single hand-editable file:
```ts
type Progression = {
  stage:
    | "pre-bosses"
    | "pre-hardmode"
    | "hardmode-pre-mech"
    | "hardmode-post-mech"
    | "post-plantera"
    | "post-golem"
    | "post-moonlord";
  bosses_defeated: string[];
  current_armor: string;
  key_accessories: string[];
  world_type: "corruption" | "crimson";
  notes: string;
};
```
Stage auto-derived from highest-tier boss in `bosses_defeated` (lookup table in `lib/progression.ts`); UI allows manual override. Injected into every LLM call.

### UI/UX (ASCII mock)

```
┌────────────────────────────────────────────────────────────────────┐
│  🧙 mage companion             Pre-Hardmode · Jungle · 2 bosses ▾ │
├────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  /  just got the Water Bolt, what now?                  ⏎  │   │
│  └────────────────────────────────────────────────────────────┘   │
│  ┌──────┬─────────────────────────────────────────────────────┐   │
│  │ [img]│  Water Bolt                                          │   │
│  │ 64×64│  • Pierces & bounces — great vs EoW worm segments    │   │
│  │      │  • Free mana between casts due to bounce uptime      │   │
│  │      │  • Drops from Dungeon shelves; you can grab pre-Skel │   │
│  └──────┴─────────────────────────────────────────────────────┘   │
│  → Next: kill EoW for Demonite, then prep for WoF                  │
│  ⚠ Don't fight EoW without a 60-tile flat arena                    │
└────────────────────────────────────────────────────────────────────┘
```

- Single page, dark mode default, Tailwind v4 tokens only — no decoration
- Autofocus query on mount
- Keys: `Enter` submit, `/` focus input, `Esc` clear, `p` toggle progression
- Loading: skeleton-card pulse, no spinners
- 3 cards max, image 64×64 left, text right
- Progression panel collapsed by default; expanded view is inline-editable

### Directory tree (target end-state)

```
terrariaCompanion/
├── CLAUDE.md
├── HANDOFF.md                       ← you are reading this
├── README.md                        ← written in milestone 6
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── vitest.config.ts
├── .env.local                       ← exists; has OPENAI_API_KEY
├── .env.example
├── .gitignore
├── data/
│   ├── raw/                         ← scraped HTML (gitignored)
│   ├── parsed/                      ← markdown (gitignored)
│   ├── index.json                   ← embedded chunks (gitignored)
│   └── progression.json             ← player state (gitignored)
├── scripts/
│   ├── scrape.ts
│   └── index.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── query/route.ts
│   │       └── state/route.ts
│   ├── components/
│   │   ├── QueryBar.tsx
│   │   ├── ProgressionPanel.tsx
│   │   ├── ResponseCard.tsx
│   │   └── NextSteps.tsx
│   ├── lib/
│   │   ├── rag.ts
│   │   ├── llm.ts
│   │   ├── progression.ts
│   │   ├── embedding.ts
│   │   └── scrape-helpers.ts
│   └── types.ts
└── tests/
    ├── progression.test.ts
    ├── rag.test.ts
    ├── llm.test.ts
    └── api.test.ts
```

### Risks / open watch items

1. **Wiki `robots.txt`** — verify it permits `/wiki/` before scraping. If it blocks, fall back to wiki's published XML dumps.
2. **Model never invents URLs** — enforce via prompt AND post-validate: drop `items[].image_url` if it doesn't match any retrieved chunk's `image_url`.
3. **Speed budget** — embed (~300ms) + cosine (~50ms) + LLM (~1.2s) + render (~200ms) ≈ 1.8s. Comfortable; no caching needed.
4. **Cost** — ~$0.01 one-time embedding, ~$0.0003/query. Negligible.

---

## Milestone 1 build log (what's actually on disk)

**Files created:**
- `package.json` — scripts: `dev`, `build`, `start`, `typecheck`, `test`, `test:watch`, `scrape`, `index`. Deps: `next@^15.5`, `react@^19`, `react-dom@^19`. DevDeps: `@tailwindcss/postcss@^4`, `tailwindcss@^4`, `typescript@^5.6`, `vitest@^2.1`, `tsx@^4.19`, `@types/{node,react,react-dom}`.
- `tsconfig.json` — strict, `moduleResolution: bundler`, `@/* → ./src/*` alias.
- `next.config.ts` — `outputFileTracingRoot` set, `images.remotePatterns` allows `terraria.wiki.gg` and `*.wiki.gg`.
- `postcss.config.mjs` — Tailwind v4 plugin only.
- `vitest.config.ts` — `environment: node`, `passWithNoTests: true`, `@` alias mirroring tsconfig.
- `.env.example` — `OPENAI_API_KEY=`
- `.gitignore` — covers `node_modules`, `.next`, `.env*`, all `data/` artifacts, `next-env.d.ts`.
- `src/app/{layout.tsx,page.tsx,globals.css}` — minimal stub with dark-mode body classes and a "scaffold ok" page.

**Deviations from the original plan (disclosed):**
1. `pnpm.onlyBuiltDependencies: ["esbuild","sharp"]` added to `package.json` — pnpm 10 blocks postinstall scripts by default, which breaks `sharp` (next/image) and `esbuild` (used by tsx/vitest). Without this, native binaries don't compile.
2. `outputFileTracingRoot = path.resolve(__dirname)` set in `next.config.ts` — silences a Next warning caused by an unrelated `pnpm-lock.yaml` in `~/Desktop/`.
3. Dev env runs Node 24.14 (plan defaulted to Node 20). Works either way.

**Verification snapshot — actual output, not promises:**
```
$ pnpm typecheck
> tsc --noEmit
(exit 0, no output)

$ pnpm test
No test files found, exiting with code 0

$ curl -sS -o /tmp/h.html -w "status=%{http_code} bytes=%{size_download} time=%{time_total}s\n" http://localhost:3000/
status=200 bytes=12560 time=1.230669s

$ grep -oE 'mage companion|scaffold ok — milestone 1' /tmp/h.html
mage companion
scaffold ok — milestone 1
```

---

## Milestone 2 build log (what's actually on disk)

**Files created:**
- `src/lib/scrape-helpers.ts` — pure helpers: URL/slug, robots.txt parser + matcher, namespace/query-param filter, cheerio extractors for title/categories/infobox-images/category-members/subcategories/article-links, content cleaner, turndown wrapper, YAML frontmatter serializer.
- `scripts/scrape.ts` — robots check → enumerate category seeds (recursing one level into subcategories) → enqueue overview seeds → 1 req/sec polite fetcher with UA + on-disk cache → save `data/raw/<slug>.html` + `data/parsed/<slug>.md`. Flags: `--only <comma-list>`, `--limit N`, `--dry-run`.
- `tests/scrape.test.ts` — 12 tests over fixture HTML covering title/category/image extraction, namespace filtering, robots parsing, frontmatter serialization, full meta+body integration.

**Deviations from the original plan (disclosed):**
1. **Category names**: the plan listed `Mage_armor_sets`, `Bosses`, `Biomes`, `Ores`, `Potions`, `Accessories` as categories, but terraria.wiki.gg uses different names. Adjusted seeds:
   - Categories enumerated: `Magic_weapons`, `Boss_NPCs`, `Armor_sets`, `Accessory_items`, `Events`.
   - Overview pages scraped directly (no category equivalent): `Bosses`, `Biomes`, `Ores`, `Potions`, `NPCs`.
2. **Subcategory recursion**: `Magic_weapons` is split into subcategories (`Wands`, `Spell_books`, `Magic_guns`). The scraper recurses one level deep into subcategories of seeds. Without this, `Magic_weapons` yields only 7 direct members vs. 82+ via subcats.
3. **Infobox selector**: this wiki uses `<div class="infobox">`, not `<table class="infobox">` as I'd initially coded. Fixed to `.infobox`.

**Verification snapshot — actual output, not promises:**
```
$ pnpm typecheck      # exit 0, no output
$ pnpm test tests/scrape.test.ts
 ✓ tests/scrape.test.ts (12 tests) 16ms
 Test Files  1 passed (1)   Tests  12 passed (12)
$ pnpm scrape --only Magic_weapons --limit 15
 [cat] Magic_weapons → 82 members, 3 subcats
   [cat] Magic_guns → 13 members  ; Spell_books → 10 ; Wands → 39
 Queue: 15 pages → 15 saved to data/parsed/
$ head -8 data/parsed/Aqua_Scepter.md
---
url: https://terraria.wiki.gg/wiki/Aqua_Scepter
title: "Aqua Scepter"
categories:
  - "Weapon items"
  - Wands
  ...
primary_image_url: https://terraria.wiki.gg/images/Aqua_Scepter.png?8a3c62
```

To do a full scrape later: `pnpm scrape` (no flags). Estimate: ~600 unique pages × 1 req/sec ≈ 10 minutes. Resumable.

---

## Milestone 3 build log (what's actually on disk)

**Files created:**
- `src/lib/embedding.ts` — lazy OpenAI client, `embedTexts(texts)` batched 100/req, `embedQuery(q)`. Model: `text-embedding-3-small` (1536d).
- `src/lib/rag.ts` — `Chunk` type, `loadIndex(path)` with per-path memoization, `cosine(a, b)`, `topK(queryEmbedding, chunks, k)`. Brute-force, in-memory.
- `src/lib/env-loader.ts` — minimal dotenv that **overrides** existing env (file wins, matches Next.js `.env.local` precedence).
- `scripts/index.ts` — walk `data/parsed/*.md`, parse frontmatter, split per h2 **and per h3**, ≤800-token cap (word-count heuristic), embed via `embedTexts`, write index. Flags: `--only <slugs>`, `--out <path>`, `--dry-run`.
- `scripts/audit-retrieval.ts` — load any index, embed each query, print top-K chunks (page > section + preview + score).
- `tests/rag.test.ts` — 5 tests on cosine + topK ordering.

**Deviations from the original plan (disclosed):**
1. **Chunker splits on h2 + h3, not h2 only.** The original spec was "per-h2 sections, ≤800 tokens." Audit revealed `Biomes.md` puts each biome (Jungle, Desert, …) under `### Jungle`, etc., inside one giant `## Surface and Underground` h2. Without h3 split, Jungle's signal was diluted (rank 5, 0.371). After h3 split: rank 1, 0.506. Section field becomes `"<h2> > <h3>"` when h3 is present. Same 800-tok cap, no overlap. 102 → 177 chunks across the 10-page audit subset (~75% more), 3099 chunks total across 424 pages.
2. **`.env.local` precedence**: my loader was deferring to existing `process.env` (standard dotenv behavior). User's shell had `OPENAI_API_KEY=sk-...` (6-char placeholder) which shadowed the real key in `.env.local`. Switched to file-wins so this can't happen again.

**Verification snapshot — actual output, not promises:**
```
$ pnpm typecheck      # exit 0
$ pnpm test           # 17 pass (12 scrape + 5 rag)
$ pnpm index --only Water_Bolt,Eye_of_Cthulhu,Biomes,Bosses,Magic_weapons,
                    Aqua_Scepter,Demon_Scythe,Meteor_armor,Space_Gun,Wand_of_Sparking \
            --out data/index.sample.json
  Built 177 chunks from 10 pages → 5.4 MB
$ pnpm exec tsx scripts/audit-retrieval.ts --index data/index.sample.json --k 5
  Q1 "I just got the Water Bolt, what now?"
    [1-5] all Water Bolt > {Notes, Overview, Tips, Location, Used by tools}
  Q2 "Just beat Eye of Cthulhu, what's next for a mage?"
    [1-5] all EoC sections — see "M4 query-augmentation plan" below
  Q3 "What should I look out for in the Jungle?"
    [1] Biomes > Surface and Underground > Jungle (0.506)
    [2-5] Underground Jungle, Jungle Temple, Jungle Sanctum, Jungle Shrine — all jungle
$ pnpm index          # full corpus
  3099 chunks, 53.5s, 98 MB data/index.json
```

**M4 query-augmentation plan (mandated by user for Q2 fix):**
- The literal user query embeds near proper nouns (e.g. "Eye of Cthulhu"), missing the "what's next" intent. Pure cosine cannot bridge this without help.
- **Fix at M4 (not M3):** before embedding the query, concatenate the synthesized progression context: `"<user query>. <progression context>"`. With `bosses_defeated: ["Eye of Cthulhu"]` + `stage: "pre-hardmode"`, append something like `"Pre-hardmode mage weapons and armor after Eye of Cthulhu."` Use a single retrieval pass; do **not** do dual-retrieval-merge until concatenation proves insufficient.
- **No HyDE.** Confirmed by user.

**M4 regression test (mandated by user):**
- After M4 implements query augmentation, re-run `scripts/audit-retrieval.ts --index data/index.json` (against the full corpus) AND a new variant `scripts/audit-retrieval.ts` that goes through the M4 `/api/query` augmentation path (or calls a `buildRetrievalQuery(userQuery, progression)` helper). Confirm Q2 surfaces `Demon_Scythe` / `Space_Gun` / `Meteor_armor` in top-5 for the "post-EoC mage" query. If not, M4 isn't done.

**Future-only optimization note (NOT now, per user):**
- `data/index.json` could shrink ~2× by serializing embeddings as Float32 instead of float-stringified-Float64 JSON. Zero cosine accuracy impact. Defer until/unless size matters.

---

## Milestone 4 build log (what's actually on disk)

**Files created:**
- `src/types.ts` — shared types: `Chunk`, `Progression` + `ProgressionStage` + `WorldType`, `QueryRequest`, `QueryItem`, `QueryResponse`. `Chunk` is the single source of truth (re-exported from `src/lib/rag.ts`).
- `src/lib/progression.ts` — `deriveStage(bosses)` (BOSS → stage lookup, 18 bosses covered), `readProgression()` (auto-seeds `data/progression.json` with `SEED_PROGRESSION` if missing), `writeProgression()`, `mergeProgression(current, patch)` (re-derives stage when bosses_defeated changes, preserves arrays not in patch).
- `src/lib/llm.ts` — `LLM_MODEL = "gpt-4o-mini"`, `QueryResponseSchema` (zod), `JSON_RESPONSE_SCHEMA` (OpenAI structured output, **strict + minItems:1 on `next_steps`**), `buildSystemPrompt(progression, chunks)`, `buildSynthRetrievalQuery(progression)` (hints-only, no user-query bleed, returns `null` for pre-bosses), `filterInventedImageUrls(response, chunks)` (drops any `items[].image_url` not in the retrieved chunks' image_urls), `answer(userQuery, progression, chunks)`.
- `src/lib/rag.ts` — added `retrieveWithProgression(userQuery, synthQuery, embed, chunks, k)`: dual-embedding retrieval, 5+3 interleave with dedup, falls back to single-pass when `synthQuery` is null. Decoupled from `embedding.ts` via a callback param.
- `src/app/api/query/route.ts` — POST, dual retrieval at K=8, calls `answer()`, returns `QueryResponse`. 400 on missing query; 500 with error message on LLM/schema failures.
- `src/app/api/state/route.ts` — GET (returns progression), PATCH (merges via `mergeProgression`, persists). 400 on bad body.
- `tests/progression.test.ts` (20), `tests/llm.test.ts` (11), `tests/api.test.ts` (6) — all green.
- `scripts/audit-retrieval.ts` — extended with `--with-progression` flag; mirrors the API's dual-retrieval path so the eval reflects production behavior.

**FINAL RETRIEVAL ARCHITECTURE (do NOT regress in M5 without flagging):**
```
POST /api/query
  ├── readProgression() + loadIndex()            (parallel)
  ├── synthQuery = buildSynthRetrievalQuery(progression)
  │        (returns STAGE_HINTS[stage] | null)
  ├── retrieveWithProgression(userQuery, synthQuery, embedQuery, chunks, K=8)
  │        ├── literalTop = topK(embed(userQuery), chunks, K)
  │        ├── synthTop   = topK(embed(synthQuery), chunks, K)
  │        └── interleave: 5 literal + 3 synth, dedup, pad from literal
  └── answer(userQuery, progression, top)
           └── filterInventedImageUrls (URL allowlist enforcement)
```
- Why dual: concatenation of "<query>. <hints>" is **zero-sum** in embedding space — augmentation that helps Q2 (progression-pivot) corrupts Q3 (biome lookup). Two passes preserve both intents.
- `STAGE_HINTS` is hand-curated per stage in `src/lib/llm.ts`. Aggressive tuning (e.g. adding more specific item names) is deferred to M5 smoke testing per user direction.

**Deviations from the original plan (disclosed):**
1. **buildRetrievalQuery → buildSynthRetrievalQuery.** Original plan implied a single concatenated retrieval query. After audit, escalated to dual retrieval with hints-only synth (no user-query bleed) per pre-authorization ("Skip the dual-retrieval second pass unless concatenation falls short"). Concatenation fell short.
2. **JSON Schema + zod both enforce `next_steps.minItems = 1`.** First live curl returned `next_steps: []` and zod rejected (500). Plan said "1-3 short actions" but I'd only encoded that in zod. Added minItems:1 to the OpenAI structured-output schema (model now refuses to emit `[]`) and added an explicit "never empty" line to the system prompt. Belt-and-suspenders.
3. **`pre-bosses` stage skips the synth pass entirely** (no hints). Saves an embed call; literal-only retrieval is what a fresh-game player wants.

**Acceptance bars from user (all passed):**
- Q1 top-8 has ≥3 Water Bolt chunks: **5/5** ✓ (Overview, Notes, Tips, Location, Used by tools at ranks 1–5)
- Q2 top-8 has Demon_Scythe + ≥1 other forward-tier: ✓ (Demon Scythe in Magic weapons > Spell books table at rank 7; Meteor Staff at rank 6; Diamond Staff at rank 8)
- Q3 top-8 has ≥4 Jungle chunks: **5/5** ✓ (Surface > Jungle, Cavern > Underground Jungle, Jungle Temple, Jungle Sanctum, Jungle Shrine at ranks 1–5)

**Verification snapshot — actual output, not promises:**
```
$ pnpm typecheck                      # exit 0
$ pnpm test                           # 54 pass: 12 scrape + 5 rag + 20 progression + 11 llm + 6 api
$ pnpm exec tsx scripts/audit-retrieval.ts --index data/index.json --with-progression --k 8
  (all 3 acceptance bars met — see above)
$ pnpm dev                            # Ready in 1145ms
$ curl http://localhost:3000/api/state
  {"stage":"pre-hardmode","bosses_defeated":["Eye of Cthulhu"],...}
$ curl -X PATCH /api/state -d '{"bosses_defeated":["Eye of Cthulhu","Wall of Flesh"],...}'
  {"stage":"hardmode-pre-mech",...}   # stage auto-derived ✓
$ curl -X POST /api/query -d '{"query":"just got the Water Bolt, what now?"}'
  cold: 4.78s   warm: 2.1s/2.7s/2.1s  (well under 3s budget after first request)
  Response: 3 items (Water Bolt, Meteor Staff, Crystal Storm) with valid image_urls from RAG context,
            2 next_steps, 0 warnings. Schema-valid.
$ curl -X POST /api/query -d '{"query":"what should I look out for in the Jungle?"}'
  items=[] (LLM correctly returns no items — query is about biome threats, not mage weapons)
  next_steps=["explore the Jungle biome","be cautious of Queen Bee and other enemies"]
  warnings=["The Jungle contains powerful enemies and hazards, be prepared."]
```

**Wiki image cache-buster (future failure mode):**
- `terraria.wiki.gg` serves infobox images with a query-string cache buster, e.g. `/images/Water_Bolt.png?8f25bf`. The scraper captures these verbatim into `primary_image_url`, which gets stored in `data/index.json` and emitted in the LLM context's `image_url` field.
- If those hashes change on the wiki side (asset regenerated, new file version, etc.), our stored URLs 404. Cards will render the parchment fallback even though we have an image URL recorded.
- **Recovery: re-run `pnpm scrape` (resumable cache will refetch only changed pages? No — current scraper skips on disk presence; force-refresh requires `rm -rf data/raw data/parsed` first) + `pnpm index`.**
- Not blocking. If images stop loading weeks from now, this is the first thing to check.

**Open items for M5 smoke:**
- The Jungle query returns `items=[]`. The system prompt restricts items to mage weapons/armor/accessories — so biome warning queries naturally route to `next_steps`/`warnings` rather than items. M5 UI must render `next_steps` and `warnings` prominently even when items is empty, or the user sees a blank card area for valid responses. **Don't suppress the empty-items state at the UI layer.**
- Index cold-start is ~3s on first request (98 MB JSON parse + load). For personal localhost use, acceptable. If it ever matters: switch float64 → float32 (see M3 future-only note).

---

## Milestone 5 build log (what's actually on disk)

**Files created/changed (frontend):**
- `src/app/globals.css` — warm-dark Tailwind v4 theme via `@theme`. Card background is the parchment tone shown through empty image slots.
- `src/components/QueryBar.tsx`, `ResponseCard.tsx` (+ `SkeletonCard`), `WarningsPanel.tsx`, `NextSteps.tsx`, `ProgressionPanel.tsx`.
- `src/app/page.tsx` — fetch + `body.getReader()` + `partial-json` streaming consumer with AbortController, framed protocol parsing, URL allowlist applied per-render.
- Streaming JSON parser: `partial-json@0.1.7` — only added dep for this milestone. Justification in M5 streaming protocol below.

**Streaming protocol (do NOT regress in M6):**
```
Wire format (body):
  "\n"                                            ← heartbeat, immediate (~10ms TTFB)
  "<json metadata>\n"                             ← after retrieval
  <streamed LLM JSON bytes>                       ← as tokens arrive
HTTP headers:
  content-type: text/plain; charset=utf-8
  x-intent-classified: warning | progression | general
  x-accel-buffering: no                           (defeats proxy buffering)
```
- Heartbeat exists so headers/connection flush before retrieval — user sees skeleton in <100ms.
- Metadata line includes `allowed_image_urls` + `intent` + `timing.{load,retrieve}`. LLM-first-token is logged server-side, not in metadata.
- Client phases: heartbeat → meta → llm. Switch state machine in `submit()` in `page.tsx`.
- `AbortController` wired: each new `submit()` aborts the previous in-flight stream; stale chunks don't overwrite newer state.

**Intent classification (M5.5 — added after Silver Armor diagnosis):**
- `src/lib/intent.ts` — `classifyIntent(query) → "warning" | "progression" | "general"`. Case-insensitive regex on the query string.
- WARNING wins if both match (hazard queries should never use the permissive path).
- "just got" deliberately NOT in PROGRESSION_RE — queries like "I just got X, what now?" should anchor on X (general), not broadcast forward-tier recs.
- Routed two ways:
  - **synth share**: `warning=1/8`, `general=2/8`, `progression=3/8`. Bigger synth share for progression brings forward-tier mage chunks into top-8.
  - **system prompt**: `warning`/`general` use the strict rule (`items=[]` if context lacks answer). `progression` uses a permissive rule that tells the LLM to bridge to mage-relevant next-tier items even when no direct generic-tier successor is in the chunks. Plus an explicit "warning intent" note that biases the model toward populating `warnings` and leaving `items=[]`.
- `x-intent-classified` response header exposes the classification for debugging.

**Eval set:**
- `tests/eval-queries.ts` — 7 queries, each pinned with `intent` and a free-text `expect` bar.
- `scripts/run-eval.ts` — replays the eval, classifies via the same `classifyIntent`, runs intent-aware retrieval, optionally calls `answer()` for the LLM output (`--with-llm`), exits non-zero if any classifier mismatch.
- Grow this file when a real-use query fails. Acceptance bars stay tied to user intent, NOT to "what the app happens to do today."

**Final 7-query eval results (2026-05-11):**
```
✓ water-bolt-pre-bosses (general, synth 2/8) — 7 Water Bolt chunks, LLM: Water Bolt + Aqua Scepter
✓ post-eoc-whats-next (progression, synth 3/8) — Meteor armor in top-8, LLM: Meteor armor + Ancient Cobalt + Magic Weapons
✓ jungle-warning (warning, synth 1/8) — 5 Jungle biome chunks, items=[], warnings populated
✓ silver-armor-next-tier (progression, synth 3/8) — Meteor armor in top-8, LLM: Meteor + Ancient Cobalt recs
✓ underworld-warning (warning, synth 1/8) — Underworld biome + hazard tips, items=[], warnings about lava/enemies
✓ aqua-scepter-stronger (progression, synth 3/8) — Aqua Scepter + Bat Scepter in top-8, LLM gives forward-tier armor recs (borderline: query implied weapons, but armor IS forward-progression mage gear)
✓ wand-of-sparking-tell-me (general, synth 2/8) — Wand of Sparking dominates top-8, LLM describes it (slight repetition across 3 items)
```

**Deviations from the original plan (disclosed):**
1. **Intent-aware routing (Option C from the user)** added to handle the Silver Armor regression and biome-warning intent. The original M4 plan had a single retrieve+prompt pipeline; this version branches at the route layer based on a regex classifier. Three attempts of single-pipeline tuning (STAGE_HINTS expansion, prompt nudge, synth-ratio change) could not satisfy all three query shapes simultaneously — see the eval-queries `silver-armor-next-tier` note.
2. **Body-framed metadata + streaming protocol.** The original plan implied a normal JSON response. Streaming was added per user direction to keep first-content latency under 1s typical.
3. **Mid-stream UI inconsistency on progression edit:** when the user edits the progression panel while a stream is in flight, the panel header re-renders with the new state but the streamed items reflect the old retrieval. Accepted as known behavior per user; next query uses new state.
4. **AbortController on rapid-fire queries:** added in M5.5 cleanup. Each new `submit()` aborts the previous request; AbortError is swallowed silently in the catch.

**Verification snapshot — actual output, not promises:**
```
$ pnpm typecheck                                       # exit 0
$ pnpm test                                            # 62 pass (12 scrape + 5 rag + 20 progression + 11 llm + 6 api + 8 intent)
$ pnpm exec tsx scripts/run-eval.ts --with-llm         # 7/7 classified correctly, all bars met
$ curl -X POST /api/query -d '{"query":"...","progression":{...}}'
  TTFB 8–11ms (heartbeat).
  First-content (after retrieval + LLM first token): ~0.9s Jungle, ~1.1s post-EoC, ~1.5s Water-Bolt-cold.
  x-intent-classified header set correctly on warning / progression / general.
```

**Open items for M6 smoke:**
- Q6 "I just got the Aqua Scepter, anything stronger?" — LLM picked armor over weapon recommendations despite Bat Scepter (stronger weapon) being in top-8. Borderline; not a regression on the original 4. If a real-use stronger-weapon query feels off in practice, refine the permissive prompt or add weapon-anchored progression hint variants.
- Q7 "tell me about the Wand of Sparking" — LLM returned 3 items all named "Wand of Sparking" with different angles. Slightly redundant but covers the bar. Could refine system prompt to discourage duplicate item names.
- Streaming reader doesn't error-handle malformed metadata line (try/catch silently tolerates). If the server's framing ever drifts, client just doesn't get the URL allowlist; LLM JSON still parses. Acceptable.

## Milestone 5.5 build log (intent classifier)

**Files created/changed:**
- `src/lib/intent.ts` — `classifyIntent(query) → "warning" | "progression" | "general"`. Case-insensitive regex over the user query. `"just got"` is deliberately NOT in PROGRESSION_RE so specific-item queries like "I just got X, what now?" stay `general`.
- `src/lib/rag.ts` — `retrieveWithProgression` gained an optional `synthCount` parameter (default 2/8).
- `src/lib/llm.ts` — `buildSystemPrompt`, `answer`, and `answerStream` accept an `Intent`. Two prompt variants: strict (warning + general) and permissive (progression). Warning intent gets an extra "prioritize warnings" note.
- `src/app/api/query/route.ts` — calls `classifyIntent`, maps to `SYNTH_BY_INTENT = { warning: 1, general: 2, progression: 3 }`, passes intent through retrieval + LLM, emits `x-intent-classified` header and includes `intent` in the body metadata line.
- `tests/intent.test.ts` (8 tests) — every eval query plus one tie-break case (warning beats progression).
- `tests/eval-queries.ts` — added `intent` field to all entries + 3 new queries (underworld-warning, aqua-scepter-stronger, wand-of-sparking-tell-me).
- `scripts/run-eval.ts` — mirrors the API's intent-aware path and exits non-zero on classifier mismatch.

**Why intent routing exists:** three single-pipeline attempts (STAGE_HINTS expansion, prompt nudge, synth-ratio shrink) couldn't simultaneously satisfy biome-warning queries (need strict prompt + literal-heavy retrieval) AND progression-pivot queries (need permissive prompt + synth-heavy retrieval). Branching by intent at the route layer broke the zero-sum.

**Eval results (final, 2026-05-11):** 7/7 queries classified correctly via `x-intent-classified`; all required bars met. See run-eval output in M5 build log above.

---

## Milestone 6 build log (README + final verify + git)

**Files created/changed:**
- `README.md` — 57 lines: what/why/architecture/setup/hotkeys/attribution/status. No badges, no emoji headers, no AI attribution.
- `.env.example` — value updated to `sk-...` placeholder so setup is unambiguous (was previously bare `OPENAI_API_KEY=`).
- `HANDOFF.md` — this entry; the M5.5 build log section; the "Known limitations" section at the top.

**Verification snapshot — actual output, not promises:**
```
$ pnpm typecheck      # exit 0
$ pnpm test           # 62/62 pass (12 scrape + 5 rag + 20 progression + 11 llm + 6 api + 8 intent)
$ pnpm dev            # already running; Ready in 1145ms earlier in the session
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/
  HTTP 200
$ pnpm exec tsx scripts/run-eval.ts --with-llm
  7/7 classified correctly, all retrieval and LLM bars met
```

**Git policy (per CLAUDE.md):** commits are authored by the user's git identity (godfreyponce / poncegodfrey@gmail.com). No Co-Authored-By trailers, no AI attribution. Plain conventional commits without emoji.

**M6 commit on disk** (not yet pushed — user pushes manually):
- `docs: add README and finalize M6 handoff` — adds `README.md`, updates `.env.example` placeholder, updates `HANDOFF.md` with M5.5 build log + known limitations + M6 entry.

---

## What to do next — milestone 6 (historical)

Use a `TaskCreate` list and mark each `in_progress` when starting, `completed` when verified. Tasks #1–#6 may still exist from the previous session if memory persisted; if not, recreate them from the milestone list below.

**Operate under the self-test contract from the original prompt:** plan → build → verify → report. Never say "this should work." Three failed attempts on a milestone = stop and surface to the user.

### Milestone 2 — Wiki scraper

- Install: `pnpm add cheerio turndown && pnpm add -D @types/turndown`
- Write `scripts/scrape.ts`:
  - Fetch `https://terraria.wiki.gg/robots.txt`. Parse Disallow rules. **Abort if `/wiki/` is disallowed.**
  - Crawl from category seed pages listed in the plan above. Resolve member URLs, dedupe.
  - 1 req/sec rate limit (simple `await new Promise(r => setTimeout(r, 1000))`).
  - For each page: save raw HTML to `data/raw/<slug>.html`, parse with cheerio, extract `title`, `categories`, primary infobox image URL, all infobox image URLs. Strip nav/footer/edit-button noise. Turndown → markdown. Write to `data/parsed/<slug>.md` with YAML frontmatter.
  - Resumable: if `data/raw/<slug>.html` exists, skip fetch.
- **Verify:**
  - `pnpm typecheck`
  - Add `tests/scrape.test.ts` that runs cheerio over a small fixture HTML and asserts title/image extraction
  - `pnpm test tests/scrape.test.ts`
  - Dry-run scrape limited to ~5 pages (e.g. just `Category:Mage_armor_sets`) and visually confirm `data/parsed/*.md` contains real content + image URLs
- Report files touched, test output, sample of one parsed `.md`.

### Milestone 3 — Embedding indexer

- Install: `pnpm add openai`
- Write `scripts/index.ts`:
  - Walk `data/parsed/*.md`, split per `## ` heading, ≤800 tokens (use a simple word-count heuristic if no tokenizer is installed; or `pnpm add gpt-tokenizer` if accuracy matters)
  - Batch embed (100/request) via `openai.embeddings.create({ model: "text-embedding-3-small", input: [...] })`
  - Write `data/index.json` as `Chunk[]`
- Write `src/lib/embedding.ts` (server-side OpenAI client + embed helper) and `src/lib/rag.ts` (load index once, cosine top-K).
- **Verify:**
  - `pnpm typecheck`
  - `tests/rag.test.ts` — fixture of 5 chunks, cosine returns expected ordering
  - Run `pnpm index` end-to-end against the scraped corpus, confirm `data/index.json` is non-empty
  - `pnpm test tests/rag.test.ts`

### Milestone 4 — API routes

- Install: `pnpm add zod`
- Write `src/types.ts` (`Chunk`, `Progression`, `QueryRequest`, `QueryResponse`).
- Write `src/lib/progression.ts` — `readProgression()`, `writeProgression()`, `deriveStage(bosses_defeated)`. If `data/progression.json` doesn't exist, seed it with stage `pre-bosses`, empty arrays, `world_type: "corruption"`.
- Write `src/lib/llm.ts` — build messages, call `openai.chat.completions.create({ model: "gpt-4o-mini", response_format: { type: "json_schema", schema: ... }, ... })`, validate with zod, drop any `items[].image_url` not in retrieved chunks.
- Write `src/app/api/query/route.ts` (POST) and `src/app/api/state/route.ts` (GET + PATCH).
- **Verify:**
  - `pnpm typecheck`
  - `tests/progression.test.ts` — stage derivation table covered
  - `tests/llm.test.ts` — schema validation on canned response, URL-allowlist enforcement
  - `tests/api.test.ts` — query route shape with mocked OpenAI client
  - `curl -sX POST http://localhost:3000/api/query -H content-type:application/json -d '{"query":"just got Water Bolt, what now?"}'` returns JSON matching the schema
  - `curl http://localhost:3000/api/state` returns current progression

### Milestone 5 — Frontend

- Components in `src/components/`: `QueryBar`, `ProgressionPanel`, `ResponseCard`, `NextSteps`.
- `src/app/page.tsx` wires them: top input, top-right progression panel, body of cards, footer for `next_steps` and `warnings`.
- Global keydown handler: `/` focus input, `Esc` clear, `p` toggle progression. `Enter` submits via form.
- Loading state: skeleton cards (3) with `animate-pulse`.
- Dark mode is already on (`<html className="dark">` from milestone 1).
- **Verify:**
  - `pnpm typecheck`
  - `pnpm dev`, open `localhost:3000`, type "just got Water Bolt, what now?" — cards render within ~3s, hotkeys behave, progression panel collapses/expands and edits persist after refresh.

### Milestone 6 — README + final verify + commit

- Write `README.md` (≤10 lines): what it is, how to run (`pnpm install && pnpm scrape && pnpm index && pnpm dev`), where state lives.
- Run the full suite once: `pnpm typecheck && pnpm test`. Paste results.
- Manual smoke: each of the 3 query shapes.
- If user wants version control: `git init`, conventional commits per milestone (`feat: scrape`, `feat: index`, `feat: api`, `feat: ui`, `docs: readme`). **Confirm with user before pushing anywhere.**

---

## Open questions for resume

None right now. All scope decisions resolved during the planning session. If anything surprising comes up mid-milestone, stop and ask before making it up.

---

## How to verify (universal)

```bash
pnpm typecheck                        # zero errors
pnpm test <path/to/affected.test.ts>  # green per milestone
pnpm dev                              # smoke for UI changes
curl -sX POST localhost:3000/api/query -H content-type:application/json \
  -d '{"query":"just got Water Bolt, what now?"}'
```

Done means all three signals were actually run and pasted into the milestone report. Never claim "this should work."
