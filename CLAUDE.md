# CLAUDE.md

> This file is read by Claude Code at the start of every session in this project. Keep it lean — every rule competes for attention.

## Project

Personal Terraria mage companion web app. Runs on localhost on a Mac's second monitor while I play Terraria on my main monitor. RAG over `terraria.wiki.gg`, OpenAI-powered, mage-class-filtered. Fast glance-and-go: image + ≤3 bullets per item, ≤3 cards per response. Not for deployment, not for other users.

## Stack

To be confirmed in phase 1 of the build prompt. Defaults I'll accept:
- Runtime: Node 20 / pnpm
- Framework: Next.js 15 (App Router) + Tailwind + TypeScript
- DB / Storage: SQLite via `better-sqlite3` (or JSON file if simpler suffices)
- LLM: OpenAI API (`gpt-4o-mini` or `gpt-5-mini`, whichever is cheaper per token)
- Embeddings: OpenAI `text-embedding-3-small`
- Tests: Vitest

Update this section once phase 1 is approved.

## How to verify your changes

Run these yourself before claiming "done."

```bash
pnpm typecheck    # must pass
pnpm test         # must pass — single test preferred over full suite while iterating
pnpm dev          # smoke test in browser when relevant
```

## Workflow rules

- **Plan before code.** For any task bigger than a one-file change, output the plan first and wait for approval.
- **Verify, don't claim.** "Done" means `typecheck` + `test` are green AND smoke-tested where relevant. Never say "this should work" — run it.
- **Surgical edits.** Smallest change that solves the problem. No incidental refactors. No reformatting unrelated files.
- **Ask before installing.** New dependencies need approval with one-line justification.
- **Stop and ask** when scope grew, or when two reasonable approaches exist with real tradeoffs.

## Hard nos

- No `console.log` left in committed code.
- No commented-out code in commits.
- No `TODO` / `FIXME` without a follow-up note.
- No silent error swallowing (`catch {}` empty).
- No hardcoded secrets. Use `.env.local` and `.env.example`.

## Git commit policy

- Commits are authored by me directly using my git config. Use my
  identity, not a Claude identity.
- Never add `Co-Authored-By: Claude` trailers.
- Never add `🤖 Generated with Claude Code` footers or any
  AI-attribution text.
- Commit messages are plain conventional commits (feat:, fix:, chore:,
  refactor:, docs:, test:) without emoji.
- Sign nothing. No GPG signing required.


## Communication style

- Direct. No "Great question!" or "Let me know if you need anything else!"
- If I'm wrong, tell me. Cite file:line.
- If you were wrong, acknowledge in one line and move on.
- Slide / spec content beats your assumptions. When in doubt, reread what I gave you.

## Pointers

- **Resume here:** @HANDOFF.md — status, embedded plan, and next-milestone checklist. Read first on every new session.
- README: @README.md (once written)
- Scripts: @package.json
- **Retrieval architecture:** dual-pass cosine retrieval + regex intent classifier (`warning` / `progression` / `general`). See HANDOFF M5.5 build log for the design rationale.