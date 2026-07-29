# PROGRESS.md — Running log

> **Pushing from a different machine?** The repo is live at
> https://github.com/EZ8EZ/parquet (public, MIT). If `gh` isn't authenticated where
> you're reading this:
> ```
> git remote add origin https://github.com/EZ8EZ/parquet.git
> git push -u origin main
> ```

---

## Phase 0 — Setup & Phase 1 kickoff (complete)
- Environment verified: node 22.23, pnpm 11.5, gh authed as `EZ8EZ`.
- Scaffolded Next 16 (App Router) + TS strict + Tailwind v4. Added Prisma 6, Zod 4,
  `@anthropic-ai/sdk`, shadcn utils, Vitest, tsx, sharp.
- **Resolved the full Sleeper corpus empirically** (API_NOTES.md): EZ8 → user_id
  `882695796544577536`; league "NSL Fantasy Hoops"; 5-season chain 2022→2026;
  `SLEEPER_LEAGUE_ID=1347007735815766016`. Full NFL-parity transactions confirmed;
  `/players/nba` = 2105 rich records.
- Created public GitHub repo `parquet` (name was available), MIT license.

## Phase 1 — Research (complete)
- RESEARCH.md: teardowns of 6 basketball tools + 5 football UX patterns + the direct
  competitor. Feature matrix, ranked v1 features, explicit "not building" list.
- **Key finding that changed a decision:** the "no KTC-for-NBA" hypothesis was
  REFUTED (Court Consensus, Dynatyze exist) — but all are thin/low-liquidity, so
  building our own transparent model is still right. Updated DECISIONS D5.

## Phase 2 — Data layer (complete)
- Platform-agnostic `LeagueProvider` + `StatsProvider` interfaces + domain model.
- SleeperProvider (Zod-validated), CsvProvider (documented importer), FixtureProvider
  (deterministic 5-season corpus with a scripted rebuild→win-now arc + 7 manager
  archetypes). Fixture built FIRST; it's the default so nothing is ever blocked.
- Prisma 6 SQLite (Postgres-portable). Idempotent `ingest` walks the
  `previous_league_id` chain; lazy `ensureIngested()`.
- Verified: ingest persists 359 transactions (138 trades) across 5 seasons.

## Phase 3 — Table stakes (complete)
- Transparent, league-aware valuation model (reads `scoring_settings`; every weight
  in `lib/valuation/config.ts`); published on `/methodology`.
- Roster view (age curve, positional value, contend/rebuild window).
- Trade evaluator — outputs a thesis (bets / key assumption / history check), not a
  grade, with a copyable summary.
- League view (power ranking, contender/rebuilder map, pick capital).

## Phase 4 — Differentiated features (complete)
- Decision Ledger: diff-based unannotated badge, two-tap capture, backfill.
- Revealed-vs-stated strategy engine with contradiction detection (the headline).
- Manager dossiers with plain-language approach reads (private-by-default warning).
- The Analyst: adversarial system prompt (`lib/analyst/system-prompt.ts`), corpus
  builder, Anthropic call + deterministic rules fallback.

## Phase 5 — Design & polish (complete)
- Bespoke dark editorial "parquet" design system (DESIGN.md); Fraunces/Inter/
  JetBrains Mono; gold accent. Fixed bottom tab nav; no floating overlays; stacked
  cards. Hand-rolled SVG charts. Geometric herringbone logo + generated PWA icon set
  + manifest. Skeletons, empty-state-as-onboarding, focus states, 44px targets.
- Verified in-browser at 390px: Home, Ledger (annotate save round-trips), Roster,
  League, Managers, Trade (full evaluate flow), Analyst (rules mode), Methodology.

---

## FINAL STATE

### What works (end to end, zero external deps on fixtures)
- Full data layer: 3 providers behind one interface; idempotent multi-season ingest;
  Zod validation on every external response.
- All four differentiators function and are demonstrably non-sycophantic — the home
  screen leads with "You said rebuild. You bought win-now." straight from the data.
- All table-stakes surfaces. Trade evaluator + ledger annotation + analyst all
  round-trip through API routes.
- `pnpm build`, `pnpm typecheck`, `pnpm lint`, and **37 tests** all pass clean.
- Installable PWA (manifest + icons + theme color).

### What is stubbed / intentionally deferred
- **Real stats provider** — `BallDontLieStatsProvider` is a documented stub; the
  fixture stats provider is wired. Valuation deliberately doesn't depend on stats in
  v1 (D4), so this blocks nothing.
- **After-loss behavioral signal on Sleeper** — computed from matchups, which are
  pulled only for the in-memory fixture; live Sleeper matchup ingest is skipped to
  avoid a per-request call storm. Dossiers degrade gracefully without it.
- **Crowdsourced (KTC-style) value voting** — deferred by design until there's user
  liquidity (RESEARCH §6). Values are model-derived.
- **Live Sleeper run not exercised end-to-end** here (built against fixtures per the
  brief); the SleeperProvider is Zod-validated against the real observed shapes and
  the ingest chain-walk is provider-agnostic, but a real `pnpm ingest` against the
  live league hasn't been run in this session.

### What I'd do next, in priority order
1. Run a real `LEAGUE_PROVIDER=sleeper` ingest against NSL Fantasy Hoops and sanity-
   check dossiers/strategy on live data; wire Sleeper matchup ingest (a small table)
   to light up the after-loss signal for real leagues.
2. Wire balldontlie.io behind the existing `StatsProvider` to sharpen valuations
   with real per-game production (age/role already handled).
3. Trade-partner matcher (Yahoo's "top-3 partners" + dossier fit) — the dossiers
   already compute everything needed; it's a synthesis surface.
4. Push notifications / email for new unannotated decisions (v1 relies on the badge).
5. Provision hosted Postgres + deploy to Vercel; run ingest on a cron.

### Top 3 questions blocking further progress (full list in QUESTIONS.md)
1. **Confirm your roster identity** in NSL Fantasy Hoops (co-owner handling) so the
   "you vs them" framing is exact on live data. (QUESTIONS #2)
2. **Anthropic API key + model choice** to switch the Analyst from deterministic to
   conversational. (QUESTIONS #6)
3. **Deployment target** — hosted Postgres (Neon/Vercel) vs stay local SQLite, and
   whether to enable real player photos given the licensing caveat. (QUESTIONS #7, #3)
