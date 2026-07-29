# PROGRESS.md — Running log

> If `gh` is not authenticated on the machine you're reading this from, push with:
> ```
> git remote add origin https://github.com/EZ8EZ/parquet.git   # or the fallback name in README
> git push -u origin main
> ```

---

## Phase 0 — Setup & Phase 1 kickoff (complete)
- Environment verified: node 22.23, pnpm 11.5, gh authed as `EZ8EZ`.
- Scaffolded Next 16 (App Router) + TS strict + Tailwind v4. Added Prisma 7, Zod 4,
  `@anthropic-ai/sdk`, shadcn utils, Vitest, tsx.
- **Resolved the full Sleeper corpus empirically** (see API_NOTES.md): EZ8 →
  user_id `882695796544577536`; league "NSL Fantasy Hoops"; 5-season
  `previous_league_id` chain 2022→2026; `SLEEPER_LEAGUE_ID=1347007735815766016`.
- Confirmed transaction shape has full NFL parity (adds/drops/draft_picks/
  roster_ids/consenter_ids/creator/status_updated). `/players/nba` = 2105 players,
  rich metadata. League is a 14-team points-scoring dynasty.
- Wrote API_NOTES, DECISIONS, QUESTIONS, .env.example/.env.local.
- Phase 1 competitor research dispatched to a background agent → RESEARCH.md.

## Phase 2 — Data layer (in progress)
(pending)
