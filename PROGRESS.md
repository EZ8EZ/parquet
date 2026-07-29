# PROGRESS.md - Running log

> **Pushing from a different machine?** The repo is live at
> https://github.com/EZ8EZ/parquet (public, MIT). If `gh` isn't authenticated where
> you're reading this:
> ```
> git remote add origin https://github.com/EZ8EZ/parquet.git
> git push -u origin main
> ```

---

## Phase 0 - Setup & Phase 1 kickoff (complete)
- Environment verified: node 22.23, pnpm 11.5, gh authed as `EZ8EZ`.
- Scaffolded Next 16 (App Router) + TS strict + Tailwind v4. Added Prisma 6, Zod 4,
  `@anthropic-ai/sdk`, shadcn utils, Vitest, tsx, sharp.
- **Resolved the full Sleeper corpus empirically** (API_NOTES.md): EZ8 → user_id
  `882695796544577536`; league "NSL Fantasy Hoops"; 5-season chain 2022→2026;
  `SLEEPER_LEAGUE_ID=1347007735815766016`. Full NFL-parity transactions confirmed;
  `/players/nba` = 2105 rich records.
- Created public GitHub repo `parquet` (name was available), MIT license.

## Phase 1 - Research (complete)
- RESEARCH.md: teardowns of 6 basketball tools + 5 football UX patterns + the direct
  competitor. Feature matrix, ranked v1 features, explicit "not building" list.
- **Key finding that changed a decision:** the "no crowd-vote-for-NBA" hypothesis was
  REFUTED (crowd-value NBA entrants do exist) - but all are thin/low-liquidity, so
  building our own transparent model is still right. Updated DECISIONS D5.

## Phase 2 - Data layer (complete)
- Platform-agnostic `LeagueProvider` + `StatsProvider` interfaces + domain model.
- SleeperProvider (Zod-validated), CsvProvider (documented importer), FixtureProvider
  (deterministic 5-season corpus with a scripted rebuild→win-now arc + 7 manager
  archetypes). Fixture built FIRST; it's the default so nothing is ever blocked.
- Prisma 6 SQLite (Postgres-portable). Idempotent `ingest` walks the
  `previous_league_id` chain; lazy `ensureIngested()`.
- Verified: ingest persists 359 transactions (138 trades) across 5 seasons.

## Phase 3 - Table stakes (complete)
- Transparent, league-aware valuation model (reads `scoring_settings`; every weight
  in `lib/valuation/config.ts`); published on `/methodology`.
- Roster view (age curve, positional value, contend/rebuild window).
- Trade evaluator - outputs a thesis (bets / key assumption / history check), not a
  grade, with a copyable summary.
- League view (power ranking, contender/rebuilder map, pick capital).

## Phase 4 - Differentiated features (complete)
- Decision Ledger: diff-based unannotated badge, two-tap capture, backfill.
- Revealed-vs-stated strategy engine with contradiction detection (the headline).
- Manager dossiers with plain-language approach reads (private-by-default warning).
- The Analyst: adversarial system prompt (`lib/analyst/system-prompt.ts`), corpus
  builder, Anthropic call + deterministic rules fallback.

## Phase 5 - Design & polish (complete)
- Bespoke dark editorial "parquet" design system (DESIGN.md); Fraunces/Inter/
  JetBrains Mono; gold accent. Fixed bottom tab nav; no floating overlays; stacked
  cards. Hand-rolled SVG charts. Geometric herringbone logo + generated PWA icon set
  + manifest. Skeletons, empty-state-as-onboarding, focus states, 44px targets.
- Verified in-browser at 390px: Home, Ledger (annotate save round-trips), Roster,
  League, Managers, Trade (full evaluate flow), Analyst (rules mode), Methodology.

---

## Post-v1 iteration - live data, serverless, open LLM, photos (complete)
Driven by owner feedback ("no Anthropic key - use a free/open alternative", "my team
is 5-Year Plan", "include images, private use", "deploying with Vercel"):
- **Analyst is now provider-agnostic** (OpenAI-compatible via plain fetch) - works
  with a free hosted open model (Groq/OpenRouter) OR local Ollama, and still falls
  back to the deterministic audit. Removed the `@anthropic-ai/sdk` dependency.
- **Reads are now DB-free** - the corpus is read live from the provider (Sleeper
  fetches cached by Next), so the app deploys on Vercel serverless with no database.
  The DB is used only to persist annotations, best-effort (degrades gracefully).
- **Verified live against the real league** (`LEAGUE_PROVIDER=sleeper`): team
  resolves to "5-Year Plan" (EZ8), real 5-season transactions, pick capital (+6
  firsts), revealed posture, dossiers, values - all rendering. Fixed two real-data
  bugs found in the process: transaction `type` widened (live API emits
  `commissioner`), and the 3.3MB `/players/nba` payload is now memoized in-process
  (it exceeds Next's 2MB fetch-cache limit).
- **Player photos on** via Sleeper's own CDN keyed by `player_id` (Sleeper returns
  null `espn_id` for NBA), with monogram fallback on missing images.

## Post-v1 iteration 2 - picks, prescription, identity (complete)
Driven by owner feedback in session:
- **Draft picks are first-class assets.** `lib/picks.ts` reconstructs each team's full
  holdings (own picks + trades) and values them; roster value is now players + picks.
  Previously a rebuild stockpile was invisible: EZ8 went 36,835 -> 63,169 total and
  from 3rd to 1st in the league once 12 picks worth 26,334 were counted.
  `collectTradedPicks()` reads every league in the chain, since the current league
  only knows about future picks.
- **Commissioner trades reconstructed.** `lib/derive/coalesce.ts` rebuilds
  hand-executed multi-team trades from loose `commissioner` rows (verified against the
  real 2023-07-03 Booker/Poole/Klay/Ayton three-teamer). Two real bugs fixed on the
  way: the transaction `type` enum rejected `commissioner` outright (whole weeks of
  history were failing), and `/players/nba` at 3.3MB exceeds Next's 2MB fetch cache so
  it is now memoized in-process.
- **Pick attribution: chose honesty over coverage.** Inferring which trade moved an
  unrecorded pick FAILED on real data (six unrelated hops across three seasons blamed
  on one 2023 deal), so it is deliberately not wired in. See API_NOTES. Verified along
  the way that the NSLKB 2025+2026 firsts came from a separate recorded trade
  (2024-01-07), not the commissioner three-teamer.
- **`/plan` Game Plan** - the prescriptive surface answering "how do I improve my
  team?": diagnoses window (contend / ascend / rebuild / retool), names the structural
  problem, proposes concrete moves matched to leaguemate dossiers, states the cost of
  each, and ends in copyable text. Testing caught it telling a 23-year-old core to
  "cash picks and push", which is how the `ascend` state came to exist.
- **`/teams` identity** - enter a real Sleeper username (or team name) to load your
  team, or click any of the 14 teams to run the whole app as them. Cookie-scoped, with
  the heavy corpus cached independently so switching is cheap.
- **`/drafts` pick lineage** - every traded pick traced to the player it actually
  became, deep-linking into that draft board to see the surrounding picks. NBA draft
  API verified end to end (the `slot_to_roster_id` join validated 42/42 picks).
- **`/awards`** - 15 league superlatives derived from real behavior.
- **Sleeper companion links** across roster/league/trade, since the user constantly
  flips between the two apps. URL patterns verified against Sleeper's own route table
  rather than status codes (their SPA returns 200 for nonsense paths).
- **Perf**: transaction fetching parallelized per season; corpus cold load 15.7s ->
  1.4s, which matters for serverless timeouts.
- **Copy**: em dashes removed from all user-facing text, per owner preference.

## FINAL STATE

### What works (end to end, zero external deps on fixtures)
- Full data layer: 3 providers behind one interface; idempotent multi-season ingest;
  Zod validation on every external response.
- All four differentiators function and are demonstrably non-sycophantic - the home
  screen leads with "You said rebuild. You bought win-now." straight from the data.
- All table-stakes surfaces. Trade evaluator + ledger annotation + analyst all
  round-trip through API routes.
- `pnpm build`, `pnpm typecheck`, `pnpm lint`, and **37 tests** all pass clean.
- Installable PWA (manifest + icons + theme color).

### What is stubbed / intentionally deferred
- **Real stats provider** - `ExternalStatsProvider` is a documented stub; the
  fixture stats provider is wired. Valuation deliberately doesn't depend on stats in
  v1 (D4), so this blocks nothing.
- **After-loss behavioral signal on Sleeper** - computed from matchups, which are
  pulled only for the in-memory fixture; live Sleeper matchup ingest is skipped to
  avoid a per-request call storm. Dossiers degrade gracefully without it.
- **Crowdsourced (crowd-vote-style) value voting** - deferred by design until there's user
  liquidity (RESEARCH §6). Values are model-derived.
- **Annotation persistence on Vercel** needs a Postgres store (SQLite can't persist
  on serverless). Writes degrade gracefully without one; add Vercel Postgres/Neon +
  flip the Prisma provider to enable. Local dev persists fine (SQLite).
- **Tilt signal (trades after a loss) is fixture-only by choice.** It works on live
  data (measured: 1232 matchups, 4 managers flagged) but costs ~110 requests and ~15s
  of cold start, and the owner judged the question not worth answering. One flag in
  `loadMatchups()` turns it back on. Two awards ("Panic Button", and "Big FAAB Energy"
  since this league doesn't use FAAB) therefore self-omit on live data.
- **Pick components of commissioner-executed trades are unrecoverable**, not stubbed -
  Sleeper simply doesn't record them. Documented rather than guessed.

### What I'd do next, in priority order
1. Add Vercel Postgres/Neon so ledger annotations persist in production (the only
   feature gated on it). Then Eric can start annotating real moves → the
   revealed-vs-stated contradictions light up on his actual history.
2. Wire Sleeper matchup ingest (small addition) to light up the "trades-after-losses"
   tilt signal for real leagues (currently fixture-only).
3. Wire a free external stats API behind the existing `StatsProvider` to sharpen valuations
   with real per-game production (age/role already handled).
4. Trade-partner matcher (a "top-3 partners" surface + dossier fit) - the dossiers
   already compute everything needed; it's a synthesis surface.

### Top questions blocking further progress (full list in QUESTIONS.md)
1. **Persist annotations in prod?** If yes, add a Vercel Postgres/Neon store - that's
   the one thing standing between the live deploy and a fully-functional ledger.
2. **Free LLM endpoint** - want the conversational analyst? A free Groq key (or a
   local Ollama) in `LLM_BASE_URL`/`LLM_API_KEY` turns it on; otherwise the
   deterministic audit ships as-is.
3. **External stats feed** - worth wiring real per-game production into valuations?
