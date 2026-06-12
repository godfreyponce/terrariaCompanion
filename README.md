# Terraria Mage Companion

A personal, localhost only companion app for Terraria specifically for a mage class. It runs on my second monitor and answers three glance speed queries about the game: "I just got [item], what now?", "Just beat [boss], what's next?", and "What should I look out for in [biome]?", answers with image + ≤3 bullets per item, ≤3 cards per response.

## Why it exists

I started playing Terraria for the first time and I felt knowledgeless. Reading the wiki mid play is a context switch tax. The official wiki opens to a huge page, I lose focus, and the answer to "do I keep this item or stash it?" gets lost in twenty paragraphs of crafting recipes and trivia. So I created this app to collapse that tax to a 3 second glance (at max, hopefully..): one input field on a second monitor, an image, three bullets, optional warnings, and a couple of next step nudges. Scoped to mage class, scoped to the player's current progression, scoped to nothing else.

Currently not deployed.

## Architecture

- **Runtime/framework:** Next.js 15, Single-page UI, streaming response, parchment warm dark theme.
- **Storage:** plain JSON files under `data/`. No database.
- **Corpus:** one time scrape of [terraria.wiki.gg](https://terraria.wiki.gg), around 425 pages (mage weapons, armor, accessories, bosses, biomes overview, NPCs, events). 1 req/sec, resumable, robots.txt-aware. Output is in a YAML frontmatter markdown per page.
- **Index:** ~3100 chunks split per h2/h3 section (≤800 tokens, no overlap). Embedded with OpenAI `text-embedding-3-small` (1536d). Brute-force in-memory cosine over the chunk array which is ideal for Mac users since it is fast enough for ~3k chunks.
- **Retrieval:** **dual-pass cosine with intent classification.** A regex classifier (`src/lib/intent.ts`) routes each query to `warning | progression | general`, which picks both a synth-slot share (1/8 / 3/8 / 2/8) and a system-prompt variant. The literal pass embeds the user query; the synth pass embeds stage-targeted progression keywords. Top-K results from each pass are interleaved with dedup. This handles "what should I look out for in [biome]?" (specific heavy constraint, biome anchored) and "what's next for a mage?" (synth-heavy, forward-tier-anchored) without one corrupting the other.
- **LLM:** OpenAI `gpt-4o-mini` (bc cheap) via streaming chat completions with JSON-schema structured output. Strict mode + zod validation. Item `image_url`s are URL-allowlisted server-side to whatever was in the retrieved chunks — the LLM cannot invent image URLs.
- **Streaming protocol:** body framed as `heartbeat \n metadata-json \n llm-json-tokens`. Client (`partial-json`) renders items as they parse. Heartbeat TTFB ~10ms; first content ~0.9–1.5s typical, well under the 3s glance budget.
- **Progression state:** `data/progression.json`. Editable in the UI; `stage` auto-derives from `bosses_defeated` unless explicitly overridden. Sent inline on every `/api/query` so the API stays stateless per-call.

Per-query cost is ~$0.0003. Re-running `pnpm scrape && pnpm index` picks up new wiki content; the scraper skips pages already on disk, so use `pnpm scrape:refresh` for a full refresh (clears `data/raw` + `data/parsed`, re-scrapes, re-indexes).

Useful checks:

```bash
pnpm typecheck
pnpm test
pnpm exec tsx scripts/run-eval.ts --with-llm    # 7-query retrieval + LLM eval
```

## Hotkeys

- `/` focus the query input
- `Enter` submit
- `Esc` clear the response
- `p` toggle the progression panel

## Attribution

Content under `data/raw/` and `data/parsed/` is scraped from [terraria.wiki.gg](https://terraria.wiki.gg) and is licensed by that wiki under [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/). It is stored locally for personal RAG use only — not redistributed, not republished, not used in any service. Image URLs are hotlinked back to the wiki. If image hashes change upstream, re-run the scraper.

_Terraria_ is a trademark of Re-Logic. This is an unofficial, personal fan tool — no affiliation with Re-Logic or the wiki maintainers.

## Status

Personal project. Not deployed. 
