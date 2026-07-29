# Parquet - Dynasty Memory

A mobile-first dynasty **fantasy basketball** companion. Most fantasy tools sell
_information_ (rankings, grades). Parquet sells **memory and self-knowledge**: it
remembers the reasoning behind your decisions, audits your stated strategy against
what you actually did, and scouts how your leaguemates behave.

> Repo name: **`parquet`** (the Celtics floor + a nod to columnar data). It was
> available, so the fallbacks `hardwood-ledger` / `glasshouse-hoops` were not used.

Live against your own Sleeper league, or run instantly on realistic synthetic data
with zero setup.

## What makes it different

Table-stakes features (roster view, asset values, trade evaluator, league view)
exist because the product isn't credible without them. The reason to use it is the
four things **no competitor builds** (see [RESEARCH.md](RESEARCH.md)):

1. **Decision Ledger** - capture your reasoning at the moment of conviction. New
   transactions surface as an "unannotated decisions" badge; two taps from badge to
   typed thought. Backfill historical moves newest-first.
2. **Revealed vs Stated Strategy** - your actual strategy is _derived from your
   transaction history_ and contrasted with what you said. When they disagree, the
   home screen says so first. (e.g. _"You said rebuild. You bought win-now."_)
3. **Manager Dossiers** - behavioral profiles of every leaguemate (who trades most,
   who panics after losses, who overpays for names, who hoards picks, who never
   responds) with a plain-language read on how to approach them. Private to you.
4. **The Analyst** - an LLM over your full annotated corpus, prompted to be an
   **adversarial auditor**, not a cheerleader. It leads with the case against you
   and cites your own moves. Degrades to a deterministic audit with no API key.
5. **Game Plan** (`/plan`) - the prescriptive counterpart to all that diagnosis. It
   reads your window (contend / ascend / rebuild / retool), names your actual
   structural problem, and proposes specific moves with specific managers, chosen by
   their dossier behavior, each with its honest cost. Ends in copyable text.

**Draft picks are treated as first-class assets throughout** - valued, counted in
roster value, tradeable in the evaluator, and traced to the players they became
(`/drafts`). In dynasty a pick stockpile is a real asset, so it is never invisible.

> **Anti-sycophancy is the core design constraint.** Every analytical surface is
> tuned to disagree with you when the record warrants it. See
> `lib/analyst/system-prompt.ts` - sycophancy is named there as the product's
> primary failure mode.

## Quick start

```bash
pnpm install
pnpm setup        # prisma db push + seed a demo annotation (fixture data)
pnpm dev          # http://localhost:3000
```

That's it - the app runs end to end on the **fixture provider** (a deterministic,
realistic 5-season synthetic league) with **zero external dependencies**. No API
keys required.

### Point it at your real Sleeper league

```bash
# .env.local
LEAGUE_PROVIDER=sleeper
SLEEPER_USERNAME=EZ8
SLEEPER_LEAGUE_ID=1347007735815766016   # NSL Fantasy Hoops (resolved; see API_NOTES.md)
```

Then pull the full multi-season history:

```bash
pnpm ingest       # walks previous_league_id back to the start; idempotent, re-runnable
```

### Enable the conversational analyst (optional, free / open-source)

The Analyst talks to **any OpenAI-compatible chat endpoint** - no paid vendor:

```bash
# .env.local - pick ONE
# a) Groq (free hosted open models):
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_...            # free key from console.groq.com
LLM_MODEL=llama-3.3-70b-versatile
# b) Local Ollama (fully offline, no key):
# LLM_BASE_URL=http://localhost:11434/v1
# LLM_MODEL=llama3.1
```

With nothing set, the Analyst still works - it runs a deterministic, still-adversarial
audit. The rest of the app never needs any key.

## Environment variables

All documented in [`.env.example`](.env.example):

| Var | Default | Purpose |
|---|---|---|
| `LEAGUE_PROVIDER` | `fixture` | `fixture` \| `sleeper` \| `csv` |
| `DATABASE_URL` | `file:./dev.db` | SQLite locally; swap to `postgres://` for prod |
| `SLEEPER_USERNAME` | `EZ8` | resolves your roster ("you") |
| `SLEEPER_LEAGUE_ID` | - | current-season league id (Sleeper mode) |
| `LLM_BASE_URL` | - | OpenAI-compatible endpoint (Groq/OpenRouter/Ollama); enables conversational analyst |
| `LLM_API_KEY` | - | key for that endpoint (none needed for local Ollama) |
| `LLM_MODEL` | `llama-3.3-70b-versatile` | analyst model |
| `NEXT_PUBLIC_USE_PLAYER_PHOTOS` | `false` | real NBA headshots (licensing caveat, see DECISIONS D8) |
| `CSV_DIR` | - | directory of CSVs when `LEAGUE_PROVIDER=csv` |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next dev server |
| `pnpm build` | `prisma generate` + production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (valuation, strategy, dossier, trade, Sleeper + CSV parsers) |
| `pnpm db:push` | apply the Prisma schema to SQLite |
| `pnpm ingest [leagueId]` | full historical pull, idempotent upserts |
| `pnpm seed` | seed the demo ledger annotation (fixture) |
| `pnpm gen:icons` | regenerate the PWA icon set from `public/icon.svg` |

## Architecture

```
app/                      Next.js App Router (all data pages force-dynamic)
  page.tsx                Home: revealed strategy + contradiction + ledger badge
  plan/                   Game Plan: how to improve this team (prescriptive)
  teams/                  Enter a Sleeper username, or run the app as any team
  roster/ league/ trade/   table-stakes surfaces
  managers/[rosterId]/    manager dossiers
  drafts/[season]/        pick lineage + draft boards
  awards/                 league superlatives
  web/                    trade web (beta)
  ledger/ analyst/ values/ methodology/
  api/{annotations,analyst,trade,viewing-as,resolve-user}/route.ts

lib/
  providers/              PLATFORM-AGNOSTIC data layer
    types.ts              LeagueProvider + StatsProvider interfaces, domain model
    sleeper/              real provider - Zod-validated (schemas.ts)
    csv/                  documented CSV importer (no-API platforms)
    fixture/              deterministic 5-season synthetic corpus (the default)
    stats/                StatsProvider (fixture + external stub)
  valuation/              transparent model; every weight in config.ts
  picks.ts                draft-pick capital: full holdings, valued as assets
  gameplan/               diagnosis + concrete prescribed moves
  lineage/                traded pick -> the player it actually became
  superlatives/           league awards
  sleeperLinks.ts         verified deep links back into the Sleeper app
  derive/                 per-manager behavioral derivation, descriptions, and
                          coalesce.ts (rebuilds commissioner-executed trades)
  strategy/               revealed-vs-stated engine (contradiction detection)
  dossier/                manager dossiers
  trade/                  trade evaluator (thesis, not a grade)
  analyst/                system-prompt.ts (adversarial) + corpus builder + runner
  history.ts              LeagueHistory: the corpus object every engine consumes
  ingest.ts               chain walk + idempotent persistence + ensureIngested()
  ledger.ts  roster.ts    ledger + roster/league analysis
prisma/schema.prisma      Postgres-portable (no SQLite-only types)
scripts/                  ingest, seed, gen-icons
```

**Data flow.** A provider normalizes any platform into the domain model. `ingest`
walks the `previous_league_id` chain to assemble the full multi-season corpus and
upserts it to the DB (idempotent). Pages build a `LeagueHistory` (transactions +
annotations from the DB, current league state live from the provider) and the pure
derivation engines run over it. `ensureIngested()` lazily populates the DB on first
read, so a fresh clone works with no manual ingest against fixtures.

**The Analyst is a prompt over a text corpus - not fine-tuning, not a vector DB.**
~20-40 transactions/season × a few seasons of annotated history fits comfortably in
one context window (see DECISIONS D7).

**No write access.** Sleeper is read-only; Parquet advises but can't act. Every
recommendation ends in a copyable summary you paste into Sleeper yourself.

## Stack
Next.js 16 (App Router, TS strict) · Tailwind v4 · Prisma 6 (SQLite → Postgres) ·
Zod 4 · Vitest · Anthropic SDK · deployable to Vercel · installable PWA.

## Deploy (Vercel)
**Zero configuration required.** No database, no environment variables. Just connect
the repo and deploy: the real league and player photos are the committed defaults, so
production serves live data out of the box. The first request after a cold start
assembles 5 seasons from Sleeper (~1.5s), then it is cached. `pnpm build` runs
`prisma generate` first.

Set env vars only to override: `LEAGUE_PROVIDER=fixture` for the offline demo, or
`SLEEPER_LEAGUE_ID` / `SLEEPER_USERNAME` to point at a different league.

**Persisting ledger annotations** is the one feature that needs a database (SQLite
can't persist on serverless). To enable it: add a Vercel Postgres / Neon store, set
`DATABASE_URL`, change `provider = "postgresql"` in `prisma/schema.prisma`, and run
`prisma db push`. Until then, annotation writes degrade gracefully (they don't error;
they just aren't saved), and the rest of the app is fully functional.

Optional: set `LLM_BASE_URL` + `LLM_API_KEY` (e.g. a free Groq key) to turn on the
conversational analyst.

## Project docs
- [RESEARCH.md](RESEARCH.md) - competitor teardown, feature matrix, the "is there a
  crowd-vote-for-NBA?" verdict, ranked v1 features, and what we deliberately did NOT build.
- [DECISIONS.md](DECISIONS.md) - every non-obvious choice, with rejected alternatives.
- [API_NOTES.md](API_NOTES.md) - empirically observed Sleeper API behavior/shapes.
- [DESIGN.md](DESIGN.md) - the design system and tokens.
- [QUESTIONS.md](QUESTIONS.md) - decisions only the owner can make.
- [PROGRESS.md](PROGRESS.md) - build log; what works / what's stubbed / next steps.

## Current state
v1 is feature-complete and runs end to end on fixtures with zero external deps.
Build, typecheck, lint, and 37 tests are green. See PROGRESS.md for the honest
what-works / what's-stubbed / next-steps rundown.

## License
MIT - see [LICENSE](LICENSE).
