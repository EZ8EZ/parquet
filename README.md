# Parquet - Dynasty Memory

Your league has a group chat with a bad memory. Parquet is the one with a good one.

A mobile-first dynasty **fantasy basketball** companion, built for one real 14-team
Sleeper league (NSL Fantasy Hoops) and the people who actually play in it - not a
product pitched at the dynasty-fantasy market in general. It defaults to the owner's
own team and that league's real history, and any other manager in the league can open
`/teams` and run the whole app as themselves instead.

Most fantasy tools sell _information_ (rankings, grades, a number with a vibe attached).
Parquet sells something rarer: **memory and self-knowledge**. It remembers the reasoning
behind your decisions, catches you when what you say and what you actually did don't
match, and quietly keeps a book on how everyone else in your league behaves under
pressure - who folds after a loss, who never answers a text about a trade.

**The house rule, stated plainly rather than left as a footnote: Parquet shows the
data, never a verdict.** The trade evaluator's output is a thesis - what each side is
betting on, and what your own history says about that kind of bet - never a letter
grade (D6). And it does not paper over a real gap with a plausible-sounding guess:
where the record genuinely can't answer a question, the app says so instead of
speculating past what the data supports (D19). That restraint - not any single
feature - is the actual point of difference from a generic trade-value tool. See the
anti-sycophancy callout further down for how far it goes.

> Repo name: **`parquet`** (the Celtics floor + a nod to columnar data). It was
> available, so the fallbacks `hardwood-ledger` / `glasshouse-hoops` were not used.

Live against your own Sleeper league, or run instantly on realistic synthetic data
with zero setup.

## What makes it different

Table-stakes features (roster view, asset values, trade evaluator, league view)
exist because the product isn't credible without them - the boring floor, not the
pitch. The actual pitch is the four things **no competitor builds** (see
[RESEARCH.md](RESEARCH.md)):

1. **Decision Ledger** - capture your reasoning at the moment of conviction. New
   transactions surface as an "unannotated decisions" badge; two taps from badge to
   typed thought. Backfill historical moves newest-first.
2. **Revealed vs Stated Strategy** - your actual strategy is _derived from your
   transaction history_ and contrasted with what you said. When they disagree, the
   home screen says so first. (e.g. _"You said rebuild. You bought win-now."_)
3. **Manager Dossiers** - behavioral profiles of every leaguemate (who trades most,
   who panics after losses, who overpays for names, who hoards picks, who never
   responds) with a plain-language read on how to approach them. Private to you.
4. **Game Plan** (`/plan`) - the prescriptive counterpart to all that diagnosis. It
   reads your window (contend / ascend / rebuild / retool), names your actual
   structural problem, and proposes specific moves with specific managers, chosen by
   their dossier behavior, each with its honest cost.

There were five. **The fifth was an LLM "Analyst"**, and it is shelved - the app's
direction is statistical, derived from this league's own real history, rather than
generated prose over it. Nothing was lost in the removal: every read its offline
half computed already renders on a page that survives. See
[SHELVED.md](SHELVED.md) S7 for what it was and what would bring it back. Parquet
now makes **no outbound LLM call from anywhere** and needs no inference key.

**Draft picks are treated as first-class assets throughout** - valued, counted in
roster value, tradeable in the evaluator, and traced to the players they became
(`/drafts`). In dynasty a pick stockpile is a real asset, so it is never invisible.

**A manager is a person, not a seat.** Teams change hands in long-running dynasty
leagues, so identity is the platform user account (a **principal**) and history is a
**tenure**: one principal, one roster, a contiguous span of seasons. Succession is
*detected* from each season's own `owner_id`, never inferred, so a manager's drafts and
trades stay theirs after they hand the team over, and a manager who has left the league
keeps credit for the seasons they were here. The real league is 15 principals over 14
rosters, one of them former. See `lib/principals.js` and DECISIONS D22.

**Two proprietary metrics, both published rather than hidden:**
- **Dynasty Duration and the Timeline Coherence Index** (`lib/metrics/duration.js`) -
  Macaulay duration applied to dynasty assets. It answers *when* a roster's value arrives,
  and TCI answers whether the assets agree about it. Coherence is direction-free: a good
  rebuild and a good contender both score high, and the only bad quadrant is straddling.
- **Roster Fragility Index** (`lib/metrics/fragility.js`) - the other half of that
  question: *how much of this season is load-bearing on a handful of assets, and what
  breaks first*. Exact leave-one-out damage (delete a player, re-solve the optimal lineup
  with a DP over subsets of lineup slots rather than greedily, so positional eligibility is
  priced) plus starter-weighted HHI concentration plus availability exposure, weighted 0.45
  / 0.35 / 0.20 into a 0-100 index where higher means more fragile. Names the single point
  of failure. Surfaced as the **House of Cards** award. Low fragility is not the same as
  good, and the copy says so: a roster with nothing to lose loses nothing.

**Awards are graded on behaviour and, separately, on merit.** The "On the merits" group
adds seven performance awards; 22 awards are defined and 20 appear on live data. Three of
the underlying metrics name their baseline: start rate against the platform's own optimal
lineup, draft capture against the pool still on the board, and trade value added at today's
value. All three are hindsight and every subtitle says so, because we hold no historical
ranking snapshots and a process-fair version is not available. See DECISIONS D23. The
draft-steal award is a worked example of a metric caught measuring the wrong thing, twice:
D26 and D27.

> **Anti-sycophancy is the core design constraint.** Every analytical surface is
> tuned to disagree with you when the record warrants it. It used to be enforced
> loudest in a system prompt; now it is enforced structurally, which is the harder
> and better place for it. Home leads with the stated-vs-revealed contradiction
> rather than with the four numbers, `/plan` opens its caveats with that same gap
> before it proposes anything, `/trade` says so on the receipt, and no surface
> anywhere issues a grade. A prompt can be softened by an edit; a page that puts the
> disconfirming case above the fold cannot be softened without deleting it.

## Quick start

**With zero setup, `pnpm install && pnpm dev` loads the real league** - Eric's own
NSL Fantasy Hoops (`LEAGUE_PROVIDER` defaults to `sleeper`, D21), live from Sleeper's
public API, reads never touch a database (D18). That is genuinely all it takes:

```bash
pnpm install
pnpm dev          # http://localhost:3000 - the real NSL Fantasy Hoops league
```

### Try it on synthetic data instead (no real league, no network calls)

```bash
# .env.local
LEAGUE_PROVIDER=fixture
```

```bash
pnpm dev          # a deterministic, realistic 5-season synthetic league
```

The fixture provider ships one Decision Ledger annotation seeded directly in code
(`FIXTURE_SEED_ANNOTATIONS` in `lib/history.js`), so the revealed-vs-stated
contradiction has something to show on the very first load - still true with no
database configured at all. `pnpm seed` only matters once you want that same
annotation persisted to a real Postgres instead of held in code, or want your own
notes to survive a restart.

**One collision worth knowing:** `pnpm setup` used to be the one-command bootstrap
(`db:push` + `seed`) - except `setup` is pnpm's OWN reserved subcommand (it
provisions your global pnpm home, not this project), and it silently shadows a
same-named script in `package.json`. Rather than tell everyone to remember `pnpm
run setup` forever, the script is just named `pnpm bootstrap` now - no builtin to
collide with, nothing to remember.

### Point it at a different real Sleeper league

`LEAGUE_PROVIDER=sleeper` is already the default (D21) - only set it explicitly if
you're overriding a `.env.local` that changed it. To run the app as a different
league or user, override the committed defaults instead:

```bash
# .env.local
SLEEPER_USERNAME=EZ8
SLEEPER_LEAGUE_ID=1347007735815766016   # NSL Fantasy Hoops (resolved; see API_NOTES.md)
```

`pnpm dev` alone already shows the current season live. Pulling the full
multi-season history into the database (`pnpm ingest`, which walks
`previous_league_id` back to the start) is purely optional archival persistence -
the live app never depends on it to render correctly.

There is **no LLM step to enable.** A section here used to explain how to point
`LLM_BASE_URL` at Groq, OpenRouter or a local Ollama to turn on a conversational
analyst; that surface is shelved (SHELVED.md, S7) and the app now makes no outbound
inference call from any code path. Nothing in Parquet needs a key of any kind.

## Environment variables

All documented in [`.env.example`](.env.example):

| Var | Default | Purpose |
|---|---|---|
| `LEAGUE_PROVIDER` | `sleeper` | `fixture` \| `sleeper` \| `csv`. Defaults to the real league so a zero-config deploy is never silently fake (D21) |
| `DATABASE_URL` | unset | `postgres://` only (`prisma/schema.prisma` is on the postgresql provider). Unset is supported: reads are DB-free and a ledger write says plainly it was not persisted (D18/D36) |
| `SLEEPER_USERNAME` | `EZ8` | resolves your roster ("you") |
| `SLEEPER_LEAGUE_ID` | committed constant | current-season league id; falls back to `DEFAULT_SLEEPER_LEAGUE_ID` in `lib/providers/index.js` (D21) |
| `NEXT_PUBLIC_USE_PLAYER_PHOTOS` | `false` | real NBA headshots, hotlinked from Sleeper's CDN (licensing caveat, see DECISIONS D8/D39) |
| `CSV_DIR` | - | directory of CSVs when `LEAGUE_PROVIDER=csv` |
| `AUTH_SECRET` | unset | unset = single-user mode, the default. Set it to require a signed seat for private authorship (D35) |
| `PARQUET_DEBUG_TIMINGS` | unset | `1` logs cold-load duration for the two heaviest loaders |
| `PARQUET_ORIGIN` | `http://localhost:3000` | `pnpm claim-links` only - fallback when the origin isn't passed as a CLI arg |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next dev server |
| `pnpm build` | `prisma generate` + production build |
| `pnpm start` | run the production build (after `pnpm build`) |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest run - valuation, strategy, dossier, trade, principals, metrics, awards, Sleeper + CSV parsers (1,059 tests, 62 files, all green as of this writing) |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm e2e` | Playwright smoke suite (`playwright.config.mjs`) |
| `pnpm db:push` | apply the Prisma schema to the Postgres in `DATABASE_URL` |
| `pnpm db:generate` | regenerate the Prisma client after a schema change |
| `pnpm bootstrap` | `db:push` + `seed` in one step - the quick-start path above |
| `pnpm ingest [leagueId]` | full historical pull, idempotent upserts (purely archival - see Architecture) |
| `pnpm seed` | seed the demo ledger annotation to a real Postgres (fixture only) |
| `pnpm claim-links [origin]` | print one seat-claim link per manager, once `AUTH_SECRET` is set |
| `pnpm gen:icons` | regenerate the PWA icon set from `public/icon.svg` |

There is no `typecheck` script - see [Stack](#stack) below on why.

## Architecture

Plain JavaScript throughout (see [Stack](#stack) below) - every path below is `.js`/
`.jsx`, not `.ts`/`.tsx`.

```
app/                      Next.js App Router (all data pages force-dynamic)
  page.jsx                Home: revealed strategy + contradiction + ledger badge
  plan/                   Game Plan: how to improve this team (prescriptive)
  teams/                  Enter a Sleeper username, or run the app as any team
  roster/ league/ trade/   table-stakes surfaces (trade/finder/ = auto-suggested deals)
  managers/[rosterId]/    manager dossiers; managers/compare/ + managers/former/
  drafts/[season]/        pick lineage + draft boards; drafts/grades/ = report cards
  awards/                 league superlatives ("House of Cards" and friends)
  deals/                  every deal, and one receipt page per trade
  lineage/                one asset's provenance rail
  ledger/ values/ rank/ recap/ methodology/ commissioner/ settings/ more/
  lab/                    experiments not promoted to the main flow (see below)
  api/{annotations,trade,custom-rank,search,digest-seen,viewing-as,
      resolve-user}/route.js

lib/
  providers/              PLATFORM-AGNOSTIC data layer
    types.js              LeagueProvider + StatsProvider interfaces, domain model
    sleeper/              real provider - Zod-validated (schemas.js)
    csv/                  documented CSV importer (no-API platforms)
    fixture/              deterministic 5-season synthetic corpus (opt-in demo)
  valuation/              transparent model; every weight in config.js
  picks.js                draft-pick capital: full holdings, valued as assets
  principals.js           managers as principals + tenures; succession detection
  metrics/
    duration.js           Dynasty Duration + Timeline Coherence Index
    fragility.js          Roster Fragility Index (leave-one-out, HHI, exposure)
    skill.js              start rate, draft capture, trade value added
  gameplan/               diagnosis + concrete prescribed moves
  lineage/                traded pick -> the player it actually became
  superlatives/           league awards (behavioural + "On the merits")
  sleeperLinks.js         verified deep links back into the Sleeper app
  derive/                 per-manager behavioral derivation, descriptions, and
                          coalesce.js (rebuilds commissioner-executed trades)
  strategy/               revealed-vs-stated engine (contradiction detection)
  dossier/                manager dossiers
  trade/  tradefinder/  tradegraph/   trade evaluator, deal finder, deal graph
  lab/                    THE LAB - registry of experiments (counterfactual roster,
                          the regret ledger, Positional Leverage, the Pulse). Each
                          is a claim the app is testing, not one it has settled -
                          `/lab`'s own copy says so, and none of them is promoted to
                          the primary nav (see `lib/lab/index.js`'s header comment)
  history.js              LeagueHistory: the corpus object every engine consumes
  ingest.js               chain walk + idempotent archival persistence (optional)
  ledger.js  roster.js    ledger + roster/league analysis
prisma/schema.prisma      Postgres-portable (no SQLite-only types)
scripts/                  ingest, seed, claim-links, gen-icons
```

**Data flow.** Reads are DB-free by construction. A provider normalizes any
platform into the domain model, and every request assembles the full corpus
(chain, rosters, players, transactions) **live** from that provider - no lazy
on-first-read database populate step exists anymore (`lib/ingest.js`'s own header
comment is explicit that it once did and no longer does). Pages build a
`LeagueHistory` (`lib/history.js`) over that live corpus, plus whatever
annotations the DB happens to hold - best-effort, since the DB is optional. The
pure derivation engines (strategy, dossier, valuation, metrics, superlatives) run
over that one object. `ingest`/`seed` are the only two callers of `ingestAll()`,
and both are now purely an **optional archival persistence** of raw transaction
payloads and a player cache - a convenience for later, not something the live app
depends on to render correctly.

**Nothing here calls a model.** Every number and every sentence on every surface is
computed by a pure function over that one corpus object, in-process, from this
league's own recorded history. There is no inference dependency, no API key, no
provider to be down, and no non-determinism: the same corpus renders the same page.
That was not always true - D7/D17 describe an LLM analyst that was a prompt over
this same corpus - and SHELVED.md S7 records why it is true now.

**No write access.** Sleeper is read-only; Parquet advises but can't act. A trade,
and a pitch from /plan or a manager dossier, both end at a one-tap link to your
league's trade centre - you carry the thesis over yourself from there.

## Stack
Next.js 16 (App Router, plain JavaScript) · Tailwind v4 · Prisma 6 (Postgres, optional) ·
Zod 4 · Vitest · no LLM (SHELVED.md S7) · deployable to Vercel · installable PWA.

**Plain JavaScript, not TypeScript - by owner request, not by default.** The app
shipped on TypeScript strict through most of its build; D63 mechanically converted
all 249 `.ts`/`.tsx` files to `.js`/`.jsx` (a scripted `ts.transpileModule` + Prettier
pass, not a hand rewrite, to rule out transcription error at that size) and dropped
`typescript`/`@types/*` from `package.json`. There is no `tsconfig.json` - only the
`@/*` path alias survives, carried into `jsconfig.json`. If you're used to reading
this stack with a type layer, there isn't one here; JSDoc-with-`@ts-check` and an
AltJS frontend language were both considered and both declined for the same reason
the removal happened - see D63.

Two themes, not more: **dark** (the default identity) and **light** ("Paper" in the
`/settings` toggle) - the ordinary light/dark pattern, not a second design to choose
between. A high-contrast third theme shipped once and was later removed by owner
request (D69) once dark's own contrast was fixed at the token level, so the toggle
stays a two-way switch. Full tokens in [DESIGN.md](DESIGN.md).

## Deploy (Vercel)
**Zero configuration required for live league data.** No database, no environment
variables needed. Just connect the repo and deploy: the real league is the committed
default, so production serves live data out of the box. The first request after a
cold start assembles 5 seasons from Sleeper (~1.5s), then it is cached. `pnpm build`
runs `prisma generate` first.

**Player photos default OFF**, unlike everything else here (D39): Sleeper's headshots
aren't licensed for redistribution, so a public repo has to default a fork's or a
forgetful deploy's monograms to the licensing-safe answer rather than the convenient
one. Set `NEXT_PUBLIC_USE_PLAYER_PHOTOS=true` explicitly in Vercel to opt in for your
own deploy - including Eric's own production deploy, which needs this set explicitly
now that the default has flipped.

Set env vars only to override: `LEAGUE_PROVIDER=fixture` for the offline demo,
`SLEEPER_LEAGUE_ID` / `SLEEPER_USERNAME` to point at a different league, or
`NEXT_PUBLIC_USE_PLAYER_PHOTOS=true` for real headshots.

**Persisting ledger annotations** is the one feature that needs a database. To enable
it: add a Vercel Postgres / Neon store, set `DATABASE_URL` to it, and run
`prisma db push` (the schema is already on the postgresql provider). Until then,
annotation writes degrade gracefully - with `DATABASE_URL` unset the API answers 200
and says the note was kept for the session but not persisted - and the rest of the app
is fully functional. Note the one case that is NOT graceful on purpose: a
`DATABASE_URL` that is set but rejects the write answers 500 and "Your note was NOT
saved", because pretending otherwise once discarded a real note (D36).

A database is the **only** optional dependency left. There is no key to add for
anything else, and no LLM endpoint to reach.

## Project docs
- [RESEARCH.md](RESEARCH.md) - competitor teardown, feature matrix, the "is there a
  crowd-vote-for-NBA?" verdict, ranked v1 features, and what we deliberately did NOT build.
- [DECISIONS.md](DECISIONS.md) - every non-obvious choice, with rejected alternatives.
- [SHELVED.md](SHELVED.md) - things built and then taken back out of the app, why each
  one went, and the specific condition that would bring it back.
- [API_NOTES.md](API_NOTES.md) - empirically observed Sleeper API behavior/shapes.
- [DESIGN.md](DESIGN.md) - the design system and tokens.
- [QUESTIONS.md](QUESTIONS.md) - decisions only the owner can make.
- [PROGRESS.md](PROGRESS.md) - build log; what works / what's stubbed / next steps.

## Current state
v1 is feature-complete and runs end to end on fixtures with zero external deps.
Build, lint, and **1,054 tests across 63 files** are green (`pnpm test`). See
PROGRESS.md for the honest what-works / what's-stubbed / next-steps rundown.

Known gap worth naming here: **principals are threaded through the awards surface only.**
Dossiers, trade partners, the deal record and the strategy engine are still roster-keyed, so
on the one roster that changed hands they still read two managers as one. QUESTIONS #12.

## License
MIT - see [LICENSE](LICENSE).
