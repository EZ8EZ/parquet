# DECISIONS.md - Non-obvious choices and their rationale

Format: **Decision** - rationale, and rejected alternatives.

## D1. Repo name
Attempting `parquet` (Celtics floor + columnar-data nod) per brief. Fallbacks in
order: `hardwood-ledger`, `glasshouse-hoops`. Final name recorded in README.md.

## D2. Stack confirmed as briefed, versions pinned by scaffold
Next 16.2.12 (App Router), React 19, TypeScript strict, Tailwind v4,
Zod 4, Vitest 4. (No LLM SDK: the analyst speaks OpenAI-compatible HTTP - see D17.)
Tailwind v4 uses CSS-first config (`@theme` in globals.css), not `tailwind.config.js`.

**Pinned Prisma 6 (6.19), not the freshly-released Prisma 7.** Prisma 7 removed
`url = env("DATABASE_URL")` from the datasource block, requiring a `prisma.config.ts`
plus a driver adapter passed to the client. That directly contradicts the brief's
"use a DATABASE_URL env var" + "trivial Postgres swap" requirements and adds
setup/runtime risk for zero v1 benefit. Prisma 6 keeps the exact env-var model the
brief specifies (swap `provider` + `DATABASE_URL` to move to Postgres). Rejected:
adopting Prisma 7's adapter model (more moving parts, less battle-tested).

## D3. Charts hand-rolled as inline SVG (no chart library)
The brief allows "a lightweight library or hand-rolled SVG." Chose hand-rolled.
Rationale: total control of legibility at 390px, zero bundle cost, no dependency
churn, and our charts (age curve, value-over-time, pick capital) are simple enough.
Rejected: Recharts/visx - heavier, harder to make truly thumb-legible, and their
defaults fight our editorial aesthetic.

## D4. Valuation model does NOT use Sleeper stats/projections
Brief flags them as unreliable. v1 model inputs: Sleeper `search_rank` (a decent
consensus proxy that ships free with `/players/nba`), age curve, `years_exp`,
role stability (`depth_chart_order`), injury status, and **league-specific
positional scarcity computed from the actual `scoring_settings`**. A `StatsProvider`
interface isolates any future real stats source (a free external stats API preferred) behind
a fixture so the model can be upgraded without touching callers. Transparency, not
accuracy, is the stated differentiator - every weight lives in `lib/valuation/config.ts`.
Rejected: building on Sleeper stats (unreliable per brief); blocking on a stats API
key (violates NEVER BLOCK).

## D5. Build our own transparent value model (market exists but is thin)
Research (RESEARCH.md §4) **refuted** the "no crowdsourced NBA value market exists"
hypothesis: a few genuine crowd-vote NBA value sites do exist. But all of them are
low-liquidity (the leading one displayed "0 data points collected"), and the
"values derived from real executed trades" approach is entirely unoccupied for the NBA.
Aggregating a thin, unreliable market would inherit its noise. So Phase 3 ships a
**transparent internal model** with a published `/methodology` page - framed as "beat
the thin incumbents on transparency," not "invent a category." Crowd voting is
explicitly a post-v1 feature (it needs participation we can't bootstrap at launch).
Rejected: scraping those sites' values (proprietary, thin, and against project rules);
blocking on building a crowd market first.

## D6. Trade evaluator outputs a thesis, not a letter grade
Per product thesis. Output = what each side is betting on, the single assumption
that must hold for the user, and what the user's own history says about this kind of
bet. A letter grade is explicitly what competitors ship; we do not.

## D7. Analyst is a prompt over a text corpus - not fine-tuning, not a vector DB
~20-40 transactions/season × 3-5 seasons of annotated history fits in one context
window. Implemented as a single well-constructed adversarial prompt. System prompt
lives in `lib/analyst/system-prompt.ts` with a comment naming sycophancy as the
primary failure mode. Degrades to a deterministic rules-based summary when no LLM is
configured; the rest of the app needs no key.

## D8. Player images abstracted behind `<PlayerAvatar>`; monograms by default
Default = generated monogram avatars in team colors (no licensing concern, looks
intentional). Real photos behind `NEXT_PUBLIC_USE_PLAYER_PHOTOS`, which now **defaults ON** (D21).
**Source: Sleeper's own CDN keyed by `player_id`**
(`sleepercdn.com/content/nba/players/thumb/{id}.jpg`). Empirically, Sleeper's `/players/nba` returns
a null external-provider id for every NBA player, so third-party headshot CDNs are unusable. Not every
player has a Sleeper image (some 403/404), so `<PlayerAvatar>` is a client component
that falls back to the monogram on load error. Licensing caveat: these headshots
aren't licensed for redistribution; the flag is opt-in for personal/local use only
(Eric confirmed private use). Background removal not needed (CDN images are already
cleanly cropped). Rejected: third-party headshot CDNs (no usable id); bundling raster assets.

## D9. FixtureProvider built FIRST; still the zero-dependency path
Guarantees no UI work is ever blocked on network/API, and all tests run against it.
`LEAGUE_PROVIDER` selects the provider (`fixture` | `sleeper` | `csv`).
**Superseded in part by D21:** the default is now `sleeper`, and `fixture` is an
explicit opt-in. See D21 for why.

## D10. Prisma with a Postgres-portable schema
SQLite for local dev via `DATABASE_URL="file:./dev.db"`. Avoided SQLite-only types:
JSON blobs stored as `String` (stringified) rather than a native Json column, all
ids `String`, timestamps `DateTime`. Swapping `provider = "postgresql"` + a Postgres
`DATABASE_URL` is the only change needed. Raw transaction payloads persisted as
stringified JSON so re-derivation never needs a re-fetch.

## D11. Decision-ledger annotations keyed by Sleeper `transaction_id`
Annotations are stored locally (DB) against the immutable `transaction_id`, so
re-ingests never orphan them. Transaction bodies are also persisted, so the ledger
works offline and against fixtures.

**Amended by D35's authorship work:** the key is now the composite
`@@unique([transactionId, ownerId])` (`prisma/schema.prisma`), not `transaction_id`
alone. A trade has two sides that share one id, so a single-column key made one
participant's note indistinguishable from the other's - and let one overwrite it.
The transaction id is still the immutable half of the key; the author is the half
that was missing.

## D12. "New transaction" detection via diff of persisted transaction_ids
Ingest is idempotent (upsert by `transaction_id`). The set of transaction_ids with
no annotation and `type in (trade, notable)` drives the home-screen "unannotated
decisions" badge.

## D13. Ingest sweeps weeks 1..25 per season
NBA fantasy weeks empirically run ~1-22. Sweeping to 25 with empty-tolerance is
safely idempotent and future-proofs longer seasons/play-in weeks.

## D15. Design system - dark editorial "parquet", not default shadcn
Committed to a specific aesthetic (financial terminal × sports magazine): near-black
surfaces, one sharp gold accent, Fraunces serif display + Inter + JetBrains Mono for
data. Fixed bottom tab bar with icons+labels, no floating overlays, stacked cards
(the exact opposite of the competitor's mobile mistakes catalogued in RESEARCH §2C).
Full tokens in DESIGN.md. Rejected: installing shadcn's default component look
(generic SaaS); a chart library (hand-rolled SVG instead, D3). Note: shadcn's utility
deps (cva/clsx/tailwind-merge/lucide) are used, but the visual system is bespoke.

## D16. Lazy `ensureIngested()` so a fresh clone needs no manual ingest
The app reads the corpus from the DB, but `ensureIngested()` populates it on first
read if empty. Against fixtures this means `pnpm dev` alone works (no ingest step);
`pnpm ingest` remains the explicit, idempotent path for real Sleeper data. Rejected:
requiring a manual ingest before the UI works (violates "runs end to end with zero
external dependencies"); reading the corpus live from the provider on every request
(a call storm for Sleeper).

## D17. Analyst is provider-agnostic and free/open-source by default
Eric ruled out a paid Anthropic key ("we must find an open source or free
alternative"), so the analyst now speaks to **any OpenAI-compatible
chat-completions endpoint over plain `fetch`**, configured with `LLM_BASE_URL` /
`LLM_API_KEY` / `LLM_MODEL`. That covers free hosted open models (Groq, OpenRouter)
and fully local ones (Ollama, LM Studio) with the same code path, and it removed the
`@anthropic-ai/sdk` dependency entirely. Absent any config it degrades to the
deterministic audit, so the app ships with zero keys and no vendor lock-in.
Rejected: bundling a local model (Vercel serverless can't host one); an Ollama-only
integration (would not work in production).

## D18. Reads are DB-free; the database is optional
Eric deploys on Vercel, where SQLite cannot persist. The corpus is therefore read
live from the provider (Sleeper fetches cached, players memoized in-process), so every
read feature works with no database at all. The DB is used ONLY to persist ledger
annotations, and even that is best-effort. Rejected: requiring Postgres to deploy (a
setup wall for a private app); localStorage-only annotations (lost across devices).

**Amended by D36 - "best-effort" was too broad and it cost a real note.** The
leniency applies to the case this decision was written for and only that case: with
no `DATABASE_URL` at all, a write returns 200 + `persisted: false` + `reason:
"no-database"` and says so in its own copy. A database that is CONFIGURED and then
throws is a different answer entirely - 500 + `ok: false` + `reason: "db-error"`,
opening "Your note was NOT saved" - because swallowing that error is how the app
once told a user his reasoning was saved and discarded it. Reads still degrade to
empty rather than hard-failing, which is the part of this decision D36 leaves
untouched; they just log loudly now instead of doing it in silence.

## D19. Do not guess the pick component of commissioner trades
Commissioner-executed trades always carry `draft_picks: []`, so their pick component
is unrecoverable. Inferring it from the timestamp-less `traded_picks` snapshot was
implemented, tested against the real league, and **rejected**: it attributed six
unrelated pick hops spanning three seasons to a single 2023 deal, because the only
available signal ("both parties are in this trade") is far too weak. Fabricating trade
contents is worse than an acknowledged gap, especially for a product whose entire
premise is an honest record. Unattributable hops surface separately via
`unrecordedPickMoves()`, and anything inferred is labelled "(inferred)" in the UI.

## D20. Tilt signal (trades after a loss) left fixture-only
Deriving it live requires ~110 matchup requests and measured ~15s of cold start.
It demonstrably works (1232 matchups, 4 managers flagged), but Eric judged "panic
after losses" not a question worth answering, so we don't pay the latency on every
request. `loadMatchups()` has a one-line switch to re-enable. Consequence: two awards
self-omit on live data. Rejected: paying 15s on every cold start for an unwanted read;
deleting the code (the derivation is sound and cheap to re-enable).

## D14. Season labeling
Sleeper labels the league by the calendar year the season ends is ambiguous; Sleeper
uses the start-year convention we mirror verbatim from the `season` field. We never
compute season; we read it.

## D21. Zero-config deploy serves the REAL league (default flipped to `sleeper`)
The Vercel deployment silently served synthetic demo data, because `LEAGUE_PROVIDER`
defaulted to `fixture` and `.env.local` is (correctly) gitignored, so production had
no env vars at all. Plausible-looking fake data is a worse failure than an error:
nothing in the UI said "this is not your league."

Fixed by making the real league the default. The league id and username are committed
constants (`DEFAULT_SLEEPER_LEAGUE_ID` / `DEFAULT_SLEEPER_USERNAME` in
`lib/providers/index.ts`), so a deploy with **zero** environment variables loads NSL
Fantasy Hoops. `NEXT_PUBLIC_USE_PLAYER_PHOTOS` likewise defaults ON, since it is
inlined at BUILD time and a forgotten var would otherwise ship monograms with no
visible cause. `LEAGUE_PROVIDER=fixture` is now the explicit opt-in to the offline
demo, and the demo banner was made loud and unmissable rather than a small tag.

Consequence: tests had to pin `LEAGUE_PROVIDER=fixture` in `vitest.config.ts`, because
several reach a provider and would otherwise start making real HTTP calls (this
actually happened - the suite went from 0.3s to 20s and 11 tests timed out).
Rejected: documenting the env vars harder (the failure mode is silent, so docs don't
prevent it); throwing when unconfigured (a broken deploy is worse than a working one).

## D22. A manager is a PRINCIPAL with TENURES, not a roster
The unit of identity is the platform user account (a **principal**), and the unit of
history is a **tenure**: one (principal, roster, contiguous span of seasons) triple.
`lib/principals.ts` builds the index; `PrincipalIndex.ownerAt(season, rosterId)` is the
only sanctioned way to turn a historical fact into a person.

Succession is **detected, never inferred**. Every league in the chain has its own
`/league/{id}/rosters`, and each roster there carries the `owner_id` of whoever held it
**that** season. Walk the chain, read the owner off each season, and a handover is simply
the season where the id changes. Verified on the real league: 13 of 14 rosters have one
stable owner id across all five seasons (2022-2026), and roster 11 changes owner id
exactly once, between 2024 and 2025. That is **15 principals over 14 rosters, one of them
former**. A provider that returns the same rosters for every season (the fixture) finds no
successions and produces one principal per roster, so nothing throws and the numbers stay
byte-identical to the old roster-keyed output.

What breaks if you key on roster id instead, all three of which we would have shipped:
- **One manager's drafts get credited to another.** The made-pick record carries a roster
  id and no owner id, so every 2022-2024 pick on roster 11 would have been attributed to
  the manager who arrived in 2025.
- **A trade-partner relationship is reported with someone who was never there.** "You
  trade a lot with roster 11" silently merges two different humans into one counterparty.
- **Two risk appetites are averaged into a manager who never existed.** Acquisition age,
  pick flow and posture blend across the handover and describe nobody.

Consequence worth stating: the departing manager's display name survives **only** in the
older seasons' `/league/{id}/users` payloads. The current league's users list does not
contain them, so any name lookup has to fall back through the chain (see API_NOTES.md).
Rejected: matching managers by display name (they differ by platform user id here, not by
a rename, so name matching would both merge and split the wrong people); ignoring the
handover as an edge case (it is 1 of 14 rosters and 3 of 5 seasons of one team's history).

## D23. Performance awards are graded with HINDSIGHT, and say so in their own copy
`lib/metrics/skill.ts` adds the first awards that ask "who is actually good at this"
rather than "what did this manager do". Behaviour needs no counterfactual; performance
always needs a baseline. Each of the three metrics names its baseline out loud:

1. **Start rate** (`fpts / ppts`) is graded against the **platform-supplied optimal
   lineup**. This is the only one whose counterfactual we do not compute ourselves. Live
   spread across managers is 83.2% to 94.8%, so it discriminates.
2. **Draft capture** is graded against **the pool still on the board**: every player taken
   at that slot or later. Draft position and class strength both cancel out because each
   pick is graded only against what sat in front of it. Live spread 13.5% to 41.3%.
3. **Trade value added** is graded at **today's value**. It is a measure of how deals
   turned out, not of how they were reasoned. Verified zero-sum: it sums to exactly 0
   across the league.

The group also carries **House of Cards**, which is the one performance award that is not
hindsight: the Roster Fragility Index reads the roster as it stands today, so it makes a
claim about the present rather than a retrospective grade. Its copy carries a different
caveat instead, and it is the important one: **low fragility is not the same as good.** The
most torn-down roster in the league scores mid-pack, because a roster with nothing to lose
loses nothing when a player goes down.

The other three price assets at what we know now, not at what was knowable then, which is the
correct way to grade an outcome and the wrong way to grade a decision. We hold no
historical ranking snapshots, so a process-fair version is **not available** and we do not
pretend otherwise: every award priced that way carries the hindsight caveat in its own
subtitle, and "Left On The Bench" additionally admits it cannot tell tanking from
inattention.
Rejected: shipping these as skill ratings without the caveat (dishonest); withholding them
until historical rankings exist (the outcome question is worth answering, and stating the
baseline makes it honest).

## D24. Trade value added counts PLAYERS ONLY, and names the bias it creates
Direct consequence of D19. Hand-executed (commissioner) trades arrive with
`draft_picks: []`, which is how every multi-team deal in this league was done, so the pick
side of those trades is simply not in the record. Including picks for the trades that
happen to record them while silently omitting them for the trades that do not would
produce a number that looks complete and is not. Measuring one side completely beats
measuring both sides inconsistently.

The bias direction is stated wherever the number is shown: **a manager who traded picks
for players looks better than they were, and a manager who traded players for picks looks
worse.** Pick capital is reported separately and honestly by `lib/picks.ts`. Rejected:
folding in the picks we do have (produces a confidently wrong total); dropping the metric
(the player side is real and complete).

## D25. Per-season rosters, per-season users and the draft index load OUTSIDE the corpus
`getPrincipals()` costs two requests per season and `loadSeasonRosters()` one, and only
the pages that attribute history to people or grade performance need them. Folding either
into `getLeagueHistory()` would add those requests to **every** cold start in the app,
including pages that never look at them. Corpus cold load is 1.4s (down from 15.7s), and
that number is close enough to serverless execution limits that it is treated as a budget
to protect rather than a benchmark to admire.

So both are loaded on demand and memoized in-process behind a 5 minute TTL, exactly like
the draft index, with `invalidatePrincipals()` / `invalidateSeasonRosters()` as the reload
hooks. A season that fails to load is skipped rather than fatal. Rejected: adding them to
the corpus (a latency tax on every page for two pages' benefit); refetching per request
(the awards page alone would issue them three times).

## D26. "The Steal" was rescored from pool capture to SLOT SURPLUS
Worth recording as a worked example of catching a metric that was measuring the wrong
thing rather than measuring it badly.

The award originally scored on **pool capture** ("did you take the best asset in front of
you"), and on real data it crowned Victor Wembanyama at pick 1.01. That is a correct
answer to the question being asked and a useless answer to the question meant: the first
pick of a draft satisfies capture trivially by taking the consensus number one, which is
the easiest pick in the draft, not a steal.

Rescored on **slot surplus** (`pickNo - valueRank`, where `valueRank` is the player's rank
by today's value inside his own draft class). Both numbers stayed on `GradedPick`, because
capture and slot surplus are genuinely different questions and the aggregate rate (The
Scout) still wants capture. Rejected: gating the award by round (arbitrary, and it would
still crown the best pick of round 5 rather than the biggest surplus); keeping capture and
rewriting the copy to match it (the copy was fine, the metric was answering the wrong
question).

## D27. Slot surplus is NORMALIZED by draft size, and the startup draft is held out
D26 fixed the question and left a second bug behind it, which is why both rounds are
recorded rather than just the outcome.

**Raw slot surplus scales with draft depth.** The 2022 startup draft is 17 rounds and 238
picks against three rounds and 42 picks for a rookie draft, so it can produce surpluses
nearly five times as large for the same quality of decision. Verified on the real league:
the unnormalised version filled **all four places of both The Steal and The Reach** with
picks from that one season. Fixed by ranking on `slotSurplusRate` (`slotSurplus /
draftSize`), so a three-round class is comparable with another three-round class.

**The startup draft is excluded from those two awards entirely.** Normalising makes the
numbers comparable; it does not make the exercise comparable. A startup draft is 17 rounds
over the whole player pool, a rookie draft is three rounds over one class, and a league
holds **exactly one startup ever**, so an award ranked on it would be frozen on 2022
forever. Startup picks still count toward **The Scout**, because those decisions were real
and pool capture is the right lens for them; the profile carries `rookiePicks` and
`startupPicks` so the reader can see what each number is built on.

Startup detection is **self-calibrating rather than a magic threshold**: `startupSeasons()`
takes the median round count across the chain's drafts and flags anything above twice it
(17 rounds against a median of 3 here). Round count is the signal rather than draft format,
because format is a league setting that can change for unrelated reasons (this league runs
its startup as a snake and its rookie drafts as linear, but that pairing is a convention,
not a rule). A chain whose drafts are all the same shape flags nothing, and a chain with a
single draft flags nothing either, because one sample cannot tell you what kind of draft it
is. A league that has only ever held a startup falls back to it rather than reporting no
extremes at all.

Final results after both rounds: **The Steal is Kyshawn George, pick 35 of the 2024 rookie
draft, who became the 7th most valuable player in that class. The Reach is Robert
Dillingham, pick 6 of the same draft, who ended up 27th.** Rejected: hardcoding "2022 is
the startup" (breaks for any other league, and this app is provider-agnostic); detecting the
startup by draft `type` (snake vs linear is a convention, not a definition); excluding
startup picks from every draft metric (their decisions were real and The Scout should see
them).

## D28. `valuePlayer()` was pricing above its own stated ceiling; fixed by RESCALING, not clamping
`maxValue` is documented as the value anchoring the whole scale at rank 1, but
`base(1) * ageMult * injuryMult * roleMult * posMult` can exceed `base(1)` (which equals
`maxValue` exactly) whenever any multiplier is greater than 1.0. `ageAnchors` peaks at
**1.16** for the youngest players (age 19 or under) - it was never capped at 1.0, because
capping it would have contradicted the entire point of an age curve, which is that youth is
worth a premium over a rank-equal older player, not merely worth-no-less. `injury` and
`role` both max out at exactly 1.0 in the current config (the healthy / starter case), so
neither contributes to the overflow today, but nothing in the code asserted that, so a future
edit pushing either above 1.0 would have silently reopened this same bug. `positionMultiplier`
can also exceed 1.0, and by how much depends on the league's live scoring settings, not a
fixed constant - checked against this league's actual scoring, Centers currently multiply by
**1.049** (`ast:1, blk:2, dd:1, pts:0.5, reb:1, stl:2, to:-1, tpm:0.5`, plus double-double and
40/50-point scoring bonuses). Verified live: Victor Wembanyama (rank 1, age 22, Center)
priced at **11,646** before this fix, 1,646 over the documented ceiling of 10,000.

**The true ceiling is `ageMax * injuryMax * roleMax * posMax`, computed programmatically by
`theoreticalMaxMultiplier()` in `lib/valuation/index.ts`, never hand-typed.** `ageMax` is
just the largest anchor value, because linear interpolation between any two anchors can
never exceed the larger of the two endpoints, so the curve's global max is always one of its
anchor points. `roleMax` is a `Math.max` over its config map (including the `unknown` case,
which resolves to 1.0), so if that config ever changes to exceed 1.0 the ceiling calculation
picks it up automatically instead of needing a matching edit somewhere else. `injuryMax` was
the same shape when this was written and is now `maxInjuryMultiplier(cfg)` in
`lib/valuation/injury.ts`, because the injury term was rebuilt as `1 - penalty` and a plain
`Math.max` over the config no longer describes what the function can return: it derives the
ceiling by taking every class penalty against the smallest note and status scales at both
ends of the age scale, through the same `[0, 1]` clamp `injuryAssessment` applies. Same
contract, stricter derivation - it still resolves to exactly 1.0 under the shipped config,
and every number in this entry is unchanged, because it returns 1.0 for the arithmetic's
reasons rather than by assumption. `posMax` is the max of `positionMultipliers()` computed from the league's actual live
scoring, per the existing "never hardcoded" rule for that function. Under this league's
scoring: `1.16 * 1.0 * 1.0 * 1.0491462851868945 = 1.2170096908167976`.

**Rescaled, not clamped.** A clamp (`Math.min(value, maxValue)`) would have flattened every
player above the ceiling onto the same repeated value, destroying the ranking's resolution
in exactly the tier where dynasty decisions get made - the top of the board. A rescale
instead divides the full multiplier product by this one constant before rounding. Because the
constant depends only on config and league scoring, not on any individual player's own age,
injury, role, or position, it is identical for every player valued in the same call, so every
player's value shrinks by the exact same factor and every ratio and every ordering survives
untouched. Verified on the live league: dividing by 1.2170096908167976 brought
Wembanyama's value from 11,646 to **9,569** (at or under the 10,000 ceiling, as required),
while the top-20-by-value ordering was bit-for-bit identical before and after, and the ratio
between two arbitrary real players' values (Luka Dončić / Alperen Şengün) moved from
1.0206162956464524 to 1.020685973575337 - a difference of 0.00007, attributable entirely to
`Math.round()` quantization at two different scales rather than to any distortion introduced
by the rescale.

One consequence worth stating out loud: `maxValue`'s doc comment used to promise it IS the
#1 asset's value. After this fix that is no longer literally true - `maxValue` is now a
reachable ceiling that only a hypothetical player who is simultaneously the youngest,
healthiest, a starter, AND at whichever position the league's scoring currently rewards most
would actually reach. No real player is all four at once, so every real #1 overall prices at
or below 10,000, never exactly at it. The doc comment on `ValuationConfig.maxValue` in
`lib/valuation/config.ts` was rewritten to say this plainly. Rejected: `Math.min`-clamping the
final value (destroys resolution at the top, the one place it matters most); hardcoding the
rescale constant as a literal number (goes stale the moment `ageAnchors` or a canonical scoring
line changes, silently reopening the exact bug this fixes); lowering `ageAnchors`' peak to 1.0
(defeats the purpose of an age curve, which is supposed to reward youth beyond rank parity).

## D29. Two independent bugs were hiding every "win-now" team in the league

The owner reported that real win-now teams were invisible in the app, and it turned out
to be two separate failures that happened to compound.

**First: `record` everywhere read the LIVE season, which is 0-0 for most of a dynasty
league's calendar.** `h.rosters` is always the current league's snapshot, and outside the
few months a season is actually being played, the current league sits in `pre_draft` with
every record at 0-0. A team that just went 18-2 the prior season had no way to show that
anywhere in the app - Home, `/league`, and `/roster` all read the dead live snapshot.
Fixed with `currentFormByRoster()` in `lib/roster.ts`, which walks the season chain newest
to oldest (the same "has this season actually been played" check `strengthRanks` in
`lib/picks.ts` already uses) and falls back to the most recent COMPLETED season when the
live one has not started, carrying an `isLive` flag so the UI can label a fallback record
as "last season's final" rather than passing it off as current. Verified live: the 2026
season is `pre_draft` (0-0 everywhere); the fallback correctly surfaces 2025's final
standings, topped by an 18-2 record that was previously invisible everywhere in the app.

**Second: the separate age-based `window` field used ABSOLUTE thresholds that this
league's core ages never cleared.** `RosterAnalysis.window` classifies a roster as
"win-now" at `coreAge >= 28.5`, but this league's oldest core tops out at 28.2 - so the
league-wide count read "0 WIN-NOW" directly beside a team that had just gone 18-2. This is
the same failure mode the Timeline Coherence Index's posture classification hit earlier
(`lib/metrics/duration.ts` - absolute duration thresholds once classified nobody in this
league as contending, until posture was switched to league-relative percentiles): an
absolute threshold that happened to sit just past every real team in this particular
league. Fixed the same way - classify against the league's OWN core-age distribution
instead of a fixed cutoff (top quartile oldest = win-now, bottom quartile youngest = rebuilding),
implemented in a new `relativeWindow()` in `lib/roster.ts`. The absolute thresholds remain
as the fallback for a standalone `analyzeRoster()` call with no league context to compare
against. `leagueValueRanking()` now overrides every roster's `window` with the
league-relative version at zero extra cost (it already computes every roster's `coreAge`;
this only adds a cheap array filter over values already in hand, not a second valuation
pass). `diagnose()` in `lib/gameplan/index.ts` and `/roster` were both switched from a
standalone `analyzeRoster()` call to reading the ranked entry from `leagueValueRanking()`,
so the same team cannot read "win-now" on one page and "balanced" on another. Verified
live: the league-wide count moved from 0/7/7 (win-now/balanced/rebuilding) to 4/7/3, and
the two teams with the best actual recent records are both now correctly flagged win-now.

## D30. The trade web gets clickability and both proprietary metrics

The trade tree (and web) rendered every manager and player as plain text with no
next step - no avatar, no link to a dossier, no connection to Duration/TCI or the
Fragility Index, which otherwise live only on their own pages. The owner's read: a
great idea whose UI and interactivity had not caught up.

`TradeGraphNode` gained `avatarId`/`teamLogoUrl` so the web can use the same
`TeamAvatar` imagery every other page already uses, sourced from `h.usersById` at
build time rather than a second lookup per render. A new `assetPlayerId()` helper
recovers a player id from a player-kind asset key (`p:<playerId>`), which is what
makes a tree node's CURRENT standing computable at all.

Two new shared pieces carry the actual fix. `ManagerLink` renders a manager as one
unit - avatar, name, dossier link - and is now used everywhere the web or a tree
names a manager: the web's node and edge panels, and both ends of every tree.
`PlayerNowRow` shows a player-kind tree node's CURRENT value, tier, and duration
(priced with the exact `/values` recipe, so it never disagrees with that page),
plus who currently holds them, linking to that manager's dossier. A pick that
became a player still shows only its resolved name - the pick lineage stores a
display string, not a player id, so backfilling one would risk misattribution
for the sake of one more link, and was not worth it.

Both proprietary metrics are computed once per page load (`leagueTimelines` and
`leagueFragility`, already used elsewhere, so this is two cheap synchronous
passes, not new valuation work) and attached to every manager reference as a
pair of pills - TCI/posture and RFI/band, each linking to that metric's home
page. This is the only place in the app a PAST decision (a trade tree) connects
to WHERE THINGS STAND TODAY.

One real bug caught in verification: the metric pills were originally rendered
INSIDE the manager's own dossier link, nesting an `<a>` inside an `<a>`, which
is invalid HTML and threw a hydration error. Fixed by making the dossier link
and the metric pills siblings rather than nesting one inside the other - three
independent tap targets instead of one broken one. Confirmed clean in a fresh
tab with an empty console after the fix; a stale console-log buffer kept
surfacing the old error transcript for several checks after until a fresh tab
finally proved it gone, which is worth remembering: don't trust a persisted
console-log read over a direct DOM query when the two disagree.

## D31. Trade Finder: star protection is deliberately asymmetric by direction

`sideRespectsStars()` (lib/tradefinder) rejects any package where a contending or
ascending side ships out a star (top asset >= `STAR_VALUE`) without receiving a
BIGGER single piece back - a team trying to win that downgrades its best asset is
not consolidating, it is spreading value thinner, and the finder should never
propose it. Rebuilding and retooling sides are exempt on purpose: selling the star
for a bundle of youth and picks is the correct move from there, and applying the
guard symmetrically would hide the only genuinely available star in most leagues.
Their protection is the value band instead, which is what stops a "bundle" from
being scraps. Rejected: a symmetric guard (hides correct rebuild sells); no guard
(recommends contenders trade down, which loses trust in one screen).

## D32. Trade Finder: the consolidation premium only pays UPWARD

A side may pay up to `CONSOLIDATION_PREMIUM` (20%) over the `FAIR_BAND` (12%) only
when it concentrates value upward - fewer pieces in, incoming top asset >=
`STAR_VALUE` AND bigger than anything sent (`withinBand()` in lib/tradefinder).
The premium exists because you cannot start four medium players; trading one
superstar for two lesser stars is the opposite move and gets no such licence.
Rejected: a symmetric premium keyed only on piece count, which would have priced
"split your best player into parts" as a bargain worth paying extra for.

## D33. `stanceOf` duplicates /plan's direction read, pinned by test, instead of calling `diagnose`

The finder rates every leaguemate against one already-computed league ranking;
/plan's `diagnose()` re-runs the whole league ranking internally on every call, so
calling it once per candidate partner would multiply the page's cost by the league
size for identical answers. `stanceOf()` (lib/tradefinder) restates the same
four-way read on the same inputs, and `tradefinder.test.ts` asserts it agrees with
`diagnose` on EVERY roster in the league (same for the hole/surplus definition in
`positionSplit`), so the duplicate cannot drift silently - a change to one without
the other fails the suite. Rejected: refactoring `diagnose` to accept a
pre-computed ranking (touches /plan's contract mid-integration for a perf win the
test-pinned copy already delivers).

## D34. Dark stays sub-AA on faint text; the contrast theme is the AA remedy
The round-5 contrast audit measured the committed dark default at 1,606 AA failures,
dominated by `--color-faint` at 3.75:1 against the 4.5 body-text bar. This is recorded
as a KNOWN, DELIBERATE identity tradeoff, not fixed: faint text is faint because the
dark editorial identity (D15, re-affirmed by four separate votes in round 1) uses
de-emphasis as a design tool, and brightening 1,600+ instances would change what the
app looks like everywhere to serve a need the new high-contrast theme now serves in
one tap. The escape hatch IS the remedy - that is what round 5 shipped it for, and it
is why that theme is more load-bearing than a preference. Two residuals ride along:
translucent accent pills (`text-accent` on `bg-accent/15`) are mathematically unable
to clear 4.5 at current alpha values even in the contrast theme (~8 small pills at
4.08-4.49; the real fix is neutral pill grounds, a structural change to component
markup that belongs to a dedicated pass, not a theme override), and any future
revisiting of the default's own contrast is an owner-level identity question, not an
engineering one.

## D35. The LENS and the SEAT are two mechanisms, because they want opposite properties
Parquet had exactly one notion of "you": the `parquet_roster` cookie. It answered two
questions that only look like one - "whose public data am I looking at" and "whose
private authorship do I hold" - and it was `httpOnly: false` by design, because the
`/rank` board and the digest panel read it client-side. So the author stamped on every
decision-ledger annotation was derived from a string any reader can rewrite in
devtools. Anyone could write, and edit, as anyone. The annotation-authorship work that
landed just before this (the composite `(transactionId, ownerId)` index, author-scoped
reads) fixed WHERE the author is stored; it could not fix where the author came from.

The two jobs cannot share a cookie because they want opposite things. The lens should
be freely switchable - running the whole app as any manager is one of the best things
about it, and every number it moves is public Sleeper data the whole league can
already see. The authorship must be unforgeable. So there are now two mechanisms:

- **The lens** - `parquet_roster`, unchanged in every respect. Still readable, still
  one tap, still what `h.me` resolves from.
- **The seat** - `parquet_seat`, a SIGNED, httpOnly cookie holding
  `s1.<ownerId>.<HMAC-SHA256("s1:"+ownerId, AUTH_SECRET)>`. The commissioner generates
  one claim link per manager (`pnpm claim-links`, or /commissioner once he holds his
  own seat) and hands it out once; opening it sets the cookie. Node's built-in
  `crypto`, no new dependency, no user table, no session store - and crucially no
  database, since D18 makes the DB optional and an identity layer that needed one
  would quietly repeal that.

`lib/auth/seat.ts` holds the whole decision matrix as pure functions.
`writeAuthorId` stamps the SEAT and never consults the lens, so the worst a forged
`parquet_roster` can now do is change which public numbers you read. `viewAuthorId` is
one rule stricter - it additionally requires the lens to AGREE - because a ledger
answering "your notes" while the rest of the page answers "their team" would read two
people's stories into one screen. Consequence, stated plainly: while the lens is on
someone else, multi-user mode shows no private reasoning at all, neither theirs nor
yours. That is the intended shape, not a gap.

**LEGACY MODE IS THE DEFAULT AND IS NOT DEGRADED.** With no `AUTH_SECRET` there is
nothing to sign with, `resolveSeat` reports `enforced: false`, and every function
falls through to the lens - the exact behaviour the app had before any of this. This
is a hard contract, pinned by tests on both the pure matrix and the real route
handler: a single-user deploy (which is every deploy today) never has to know seats
exist. `LeagueHistory.authorId` is optional for the same reason - `undefined` means
"no identity layer ran" (a hand-built fixture corpus, a script) and gets the legacy
answer, while `null` means "an identity layer ran and concluded this view holds no
private authorship" and must NOT collapse back to the lens.

Two smaller repairs ride along, both consequences of the app having had one identity:
a browser with no lens cookie was silently rendered the deploy owner's seat (his
headline, his record, "27 decisions to capture"), and now meets `/teams` instead via
a five-line middleware, deep link preserved through a sanitized `next` param; and the
digest's last-seen marker was ONE global cookie, so switching the lens reported
"nothing has moved since just now" against your own visit thirty seconds earlier - it
is now keyed per identity (seat, else lens roster), derived from cookies alone so the
write path still costs no corpus read. `/teams` also joined `ALL_SURFACES`, which was
claiming completeness while omitting the app's front door.

Rejected: passwords or a user table (a login page nobody in a fourteen-person dynasty
league asked for, and a database dependency D18 forbids); a separate exchange step
between link token and session token (buys revocation we do not have anywhere else,
costs the server-side store we specifically do not get); gating custom-rank writes on
a seat (a ranking board is a per-browser opinion about players carrying no identity
stamp and no cross-user exposure - gating it would break the "pick a team to explore"
path the picker promises without closing any hole); requiring a seat to advance the
digest marker (same reasoning; keying it was the actual fix); scoping annotation READS
to the seat while ignoring the lens (shows your notes attached to someone else's
transactions). Known and accepted: a claim link is a bearer token with no revocation
short of rotating `AUTH_SECRET`, which invalidates every seat at once.

## D36. "No database" and "the database said no" are different answers, and conflating them lost a note
`/api/annotations` degraded every database error into D18's friendly "saved for this
session, but not persisted" and a 200. That is correct for the case it was written for
(Vercel with no Postgres) and catastrophic for the case it silently absorbed: in
production the live Neon database had its `Annotation_transactionId_key` unique index
replaced by the composite `(transactionId, ownerId)` one while deployed code still
upserted on `where: { transactionId }`. Postgres refused (SQLSTATE 42P10, "no unique
or exclusion constraint matching the ON CONFLICT specification"), the catch swallowed
it, the API said the note was saved, and the user's typed reasoning was discarded. For
an app whose entire premise is capturing reasoning while you still remember it, that is
the worst failure available.

The fix is to stop interpreting after the fact and ask BEFORE the query.
`databaseConfigured()` reads `DATABASE_URL` - a configuration fact, knowable with
certainty and with no round trip - so the three outcomes are now three answers: no URL
is 200 + `persisted: false` + `reason: "no-database"` (expected, ephemeral, and says
so); a thrown error is **500** + `ok: false` + `reason: "db-error"` and copy that
opens "Your note was NOT saved"; success is `persisted: true`. The driver's own code
and message are logged server-side, because that incident was diagnosable ONLY from
the driver's text and a generic "db error" line would have said nothing actionable.
`describeDbError` is duck-typed rather than narrowed to
`PrismaClientKnownRequestError` for exactly that reason - the errors that matter most
are the ones nobody anticipated, and narrowing by class drops them in an "unknown"
bucket. `LedgerItem` now stays OPEN with the text still in the textarea on a genuine
failure, so the only copy of that reasoning is still on screen and still selectable.
The read path (`loadAnnotations`) keeps degrading to an empty map, since D18 forbids a
read hard-failing on the DB, but no longer does it in silence: a configured-but-broken
database logs loudly, because "you have captured nothing" is the read-side twin of the
same lie and invites someone to retype what the app merely failed to fetch.
Rejected: retrying (a constraint mismatch is not transient); queueing the write
client-side (durability theatre in an app with no offline story); keeping the 200 and
signalling only in the body (every existing caller treats 200 as success).

## D37. Round 6's `useState`-loses-everything bug got fixed three more times, and search
finally got its missing deep link

D30 moved the trade web's selection from `useState` to the query string because a
great feature's UI hadn't caught up. The same bug shape turned up in three more
places doing real work mid-navigation: `/values`' filters, `/trade`'s give/get
package, and the search box mounted on `/more`. All three now follow D30's exact
division of labour - a dependency-free `lib/*/url.ts` module owns the mapping
between a URL and a state shape, the surface reads it once at mount and writes it
back on every change - but which write primitive each surface uses is not copied
blindly; it is picked from the same reasoning D30 stated, not from the letter of it.

**`history.replaceState`, not `router.replace`, for `/values` and `/trade`.** Both
pages are `force-dynamic` and their server render is the expensive part - `/values`
revalues every player in the league, `/trade` runs `analyzeRoster` and
`leagueValueRanking` over every roster. Routing on every filter tap or every
asset add/remove would pay that whole render again per tap, exactly the cost D30
identified for `/web`. `lib/values/url.ts` and `lib/trade/url.ts` both carry that
comment rather than assuming the reader remembers D30.

**`router.replace` (with `{ scroll: false }`), not `history.replaceState`, for the
search box on `/more`.** `/more`'s own server render does no real work
(`groupedSurfaces()` is a static list, no corpus read), so there is no per-keystroke
cost to dodge, and letting Next own the URL means the same debounce timer that
already gates the `/api/search` fetch can gate the mirror too, at zero added
latency. Doing this one with `history.replaceState` instead would have been cargo
culting the mechanism without the cost that justified it.

**The trade package resolves ids against the UNION of both sides' pools, not
"mine" specifically.** `lib/trade/url.ts` only ever carries ids
(`give`/`get`/`gp`/`rp`, comma-joined) - never names or values - and `TradeBuilder`
looks each one up in `myPlayers ∪ otherPlayers` (same for picks). That is what makes
`/trade?give=...&get=...` a genuinely shareable link: the person who opens it has
their OWN roster as "mine", which is not the roster the ids were built against, so
resolving only against "my" pool would silently drop the sender's own assets on
arrival. Verified live: a package built from Victor Wembanyama (give) and Jabari
Smith (get) round-trips through the URL with both names and Wembanyama's value
(9,569) intact.

**Search's player results finally link somewhere real.** They were the only one of
the four result kinds pointing at a page with nothing selected (`/values`, the full
list, forcing a re-search in that page's own box) - managers, trades and picks all
had real deep links already. `valuesFocusHref` (`lib/values/url.ts`) builds
`/values?focus=<id>`, which `ValuesList` reads to expand that row, scroll it into
view once, and ring it briefly (`ValueAssetRow`'s `focused` prop). Composes with the
filter persistence rather than fighting it: a focus deep link typically carries no
other params, so the defaults (`All`, no query) already make the row visible, and
for the rare case a searched player's value ranks outside the page's normal 260-row
cap, `app/values/page.tsx` appends that one row rather than silently showing
nothing. Verified live via SSR: searching a deep-bench name (value 37, rank 261)
still renders `aria-expanded="true"` and the highlight ring at row 261.

Both new URL modules ship the same untrusted-input posture D30 set for
`lib/tradegraph/url.ts`: nothing throws, a hand-edited or stale param degrades to
its default, and ids this module can't resolve are simply left for the component to
drop rather than validated here (this file only knows strings). `lib/trade/url.ts`
additionally caps id length and count, since a give/get param is otherwise an
unbounded string a hand-edited URL could grow arbitrarily.

One owner-directed removal rode along in the same file: `TradeBuilder`'s "Copyable
summary" block (a copy-to-clipboard `<pre>` of `TradeEvaluation.copyable`) came out
of the UI, since the trade centre link below it already covers "get this trade in
front of Sleeper" and the plain-text summary was redundant with the thesis rendered
above it. `TradeEvaluation.copyable` itself is untouched in `lib/trade` - this was a
UI-only removal, not a data-layer one.

**Amendment (Round 7): the data-layer field did not survive either.** A later round
removed the copyable-Sleeper-text feature root and branch - `TradeEvaluation.copyable`
and `buildCopyable` out of `lib/trade`, `Move.copyable` and `copyBlock` out of
`lib/gameplan`, and `lib/dossier/message.ts` (`generateApproachMessage`) deleted
outright along with its test - so the "UI-only removal" framing above describes only
this decision's own change, not where the field ended up. `components/CopyBlock.tsx`
was not part of that feature (it renders the commissioner's seat-claim link, `app/
commissioner/seats.tsx`) and survives untouched.

Rejected: one shared "URL sync" hook parameterized by write-strategy (the two
strategies exist for opposite reasons - one dodges an expensive render, the other
rides an existing debounce for zero added cost - collapsing them into one knob would
hide that the choice is never arbitrary); pinning the focused player's row into the
URL's own filter defaults so it always survives a filter change (the row is a
one-time deep-link nudge, not a permanent pin - letting a later filter change hide
it again is the expected behaviour, not a bug).

## D38. ONE corpus cache entry for the whole league, and identity resolved outside it
D18 makes reads DB-free by holding the assembled corpus in process, and D35 then gave
the app two per-viewer identities. Those two facts are only compatible because of a
split that is easy to miss when reading either decision alone, so it is recorded here
rather than left to be rediscovered by whoever next edits the cache.

**The cached object is `Corpus`, which is `LeagueHistory` MINUS `me`.** The single-flight
slot in `lib/history.ts` is keyed by nothing at all - one entry, one league, a 5 minute
TTL - because everything in it is public league data that is identical for every viewer.
The two things that are NOT identical per viewer are computed after the await, per
request, from cookies: the lens (`me`, from `parquet_roster`) and the seat-derived
`authorId` (`viewAuthorId`). So multi-user mode needs no per-user cache key, no cache
partitioning, and no second assembly. D18 survives D35 unchanged.

**What the shared entry does hold is every author's annotations**, since
`loadAnnotations` runs inside the assembly. That is deliberate - the map is loaded once
for the league, not once per reader - and it means the cache is not the thing keeping one
manager's reasoning away from another. `myAnnotation()` is: it looks up
`annotationKey(transactionId, viewerAuthorId(h))` and nothing else. The comment on
`h.annotations` and the one above the analyst's corpus builder both say so, because a
future `h.annotations.get(transactionId)` written by someone in a hurry would be a
privacy bug that no test of the cache would catch. If a per-viewer prefilter is ever
wanted, it belongs on the read path, not in the cached object.

One shared entry also means one shared invalidation, which is why the annotation write
path no longer uses it: `invalidateHistory()` drops the WHOLE entry, so one manager
saving one note used to make the next request from ANY manager pay a full reassembly
(~145 Sleeper requests and D25's 1.4s budget, plus a fresh `players` Map that misses
the valuation WeakMap). `publishAnnotation()` sets the one row into the cached map
instead, which is only safe because of the same split this entry is about - the
annotations map is the ONLY part of the corpus this process writes, everything else in
it is Sleeper's and stale on a clock rather than on our own writes. `invalidateHistory`
survives as a test hook and as the last resort for a writer that genuinely changed
something upstream. Rejected: keying the corpus by viewer (multiplies the app's heaviest
object by the league size to vary two fields that cost nothing to compute); moving
annotations out of the corpus so the cache holds only public data (turns every ledger
and recap render into its own DB round trip, which is the read-time DB dependency D18
exists to prevent).

## D39. Player imagery re-audited for the public repo: same source, flipped default, two new placements
The owner asked for photos in more places with transparent backgrounds, and raised two
doubts worth checking before building on them: that the Sleeper CDN might 403 in a real
browser, and that a `.jpg` can't carry transparency. Both were investigated rather than
assumed.

**The CDN works.** All 251 real player ids on the live NSL roster returned 200 from
`sleepercdn.com/content/nba/players/thumb/{id}.jpg`, repeatedly, and `/values` in a real
browser shows real faces, not monograms. The owner's independent 403 was not
reproduced against the same real ids - almost certainly a bad/missing id or a
one-off block, not a systemic CDN failure. The only ids that 403 are ids with no
photo on Sleeper at all (checked against the full ~2,100-player payload, not just the
251 rostered).

**The `.jpg` claim was wrong, in a useful way.** The file at that URL, despite the
extension and an `image/jpeg` response header, is actually a PNG with a genuine alpha
channel - confirmed with `file`, macOS `sips -g all` (`hasAlpha: yes`,
`samplesPerPixel: 4`), and a Pillow alpha histogram on four different players (LeBron
James, Victor Wembanyama, Nikola Jokić, Luka Dončić): 60-70% of pixels are non-fully-
opaque on every one of them, which is what a real cutout looks like, not a rectangle
with alpha=255 everywhere. Browsers sniff image bytes for `<img>` rendering rather than
trust the extension or the declared content-type, so this was already rendering as a
transparent cutout - no source change, no new code, needed for the transparency ask
itself. `cdn.nba.com/headshots/nba/latest/1040x760/{personId}.png` was also checked as
an alternative source and does return a real cutout (verified: LeBron is person id
`2544`, 200 OK, alpha 0-255) - it just isn't reachable by any id Sleeper hands us (next
paragraph), so it was rejected, not adopted.

**The id-mapping problem from D8 is confirmed, not solved.** Sleeper's NBA payload
carries `rotowire_id`, `sportradar_id` (a UUID, not nba.com's numeric scheme),
`swish_id`, `fantasy_data_id`, `kalshi_id`, `oddsjam_id`, `yahoo_id`, `gsis_id`
(NFL), `pandascore_id`, `opta_id`, `stats_id` - and `espn_id`, null for every player
checked including LeBron. None of them is an NBA.com person id; there is no field to
bridge with. `cdn.nba.com/static/json/staticData/PlayersActive.json` 403s (Akamai) and
`stats.nba.com/stats/playerindex` times out outright from this environment - both
well short of "reachable enough to build a crosswalk table from," let alone to call
per-request from a Vercel function. A name+team match against either would be exactly
the fuzzy match the owner asked NOT to ship - a wrong face is worse than a monogram,
and this app has no way to notice it got one wrong. Rejected for that reason, not
attempted as a fallback.

**Net effect: same source, same URLs, nothing to migrate.** What actually changed:
1. `NEXT_PUBLIC_USE_PLAYER_PHOTOS` **flips its default from ON to OFF**
   (`components/PlayerAvatar.tsx`). D21's "defaults ON so a forgetful Vercel deploy
   doesn't silently downgrade" reasoning was written for a private repo; now that the
   repo is public, a fork or a deploy that never touched the var must default to the
   licensing-safe answer, not the convenient one. **This means Eric's own production
   deploy needs `NEXT_PUBLIC_USE_PLAYER_PHOTOS=true` set explicitly in Vercel** - it
   was previously covered by the implicit default and is not anymore. Not verified
   from this environment; flagged for the owner to check.
2. Two new placements, chosen with "fewer, larger, better-placed" in mind rather than
   avatar-on-every-row: the trade builder's give/get columns
   (`components/TradeBuilder.tsx` - `AssetRow` now takes an optional `player` prop,
   set only for player rows, never pick rows) and the roster page's single
   highest-stakes sentence, "season hinges on X" (`app/roster/page.tsx`). Both are
   places where recognizing a specific PERSON, not reading their stat line, is the
   point. Rejected: `/awards` (winners are managers, already carrying `TeamAvatar`;
   a player named inside a stat line like a draft steal isn't the entrant); the
   Analyst's cited players (would need new name-to-id citation parsing against
   free-text model output - the wrong-face risk from the id-mapping problem above,
   at a second location); the ledger's transaction descriptions (a single trade can
   name several players, and this is already the app's densest list - avatars per
   name would be per-line clutter on the one page whose job is the annotation, not
   the roster look). Injury rows have no separate home from the roster/values list,
   which already carries `PlayerAvatar` via `ValueAssetRow`.
3. `components/PlayerAvatar.tsx`'s header comment and `.env.example`'s note were
   rewritten for accuracy - both previously asserted the JPEG-can't-be-transparent
   claim now known to be wrong for this specific source.

`components/TradeWeb.tsx`, `lib/tradegraph/`, `lib/lineage/`, `app/web/`,
`app/drafts/`, and `lib/nav.ts`/`components/BottomNav.tsx` were left alone per the
open work already in flight on each.

## D40. Density is a caveat-placement problem, not a writing problem, and /league was rendering the same fourteen rosters four times
Round 8's density audit was aimed at D15 and did not land there. The dark editorial
identity is working; what was not working is that its best sentences had been copied
across surfaces until several of them were on their fourth appearance, and the app's own
`<details>` idiom - shipped with MetricGloss, and used by the roster timeline, the
commissioner page and the recap - was sitting unused beside them. Editorial writing that
appears once, at the moment of confusion, IS the identity. The same sentence
unconditionally on every revisit is unmaintained copy wearing the identity's clothes.

**Cut, because a repeat visitor learns nothing from it.** The streak panel's 33-word
explanation of how a streak differs from a Superlative (a product-design footnote, new
exactly once - moved to /about, where the app's vocabulary is defined); Home's "Parquet
advises; it can't act. Sleeper has no write API" (a constraint about SENDING trades,
stated on /trade where the evaluation ends at "Open Sleeper to send", and nowhere near
anything Home does); the awards page's `managers*` asterisk (a definition, so it moved
onto the definition as an `<abbr title>`). The fragility board's 55-word caveat about
what a low RFI does not mean was the fifth copy of a paragraph MetricGloss, /about and
/methodology all carry, so it is now `<MetricGloss>` - one faint line, the same words
inside, and `MetricGloss.test.ts` still pins the phrases.

**A zero in the offseason is anti-information.** `StreakPanel` now suppresses any row
that is BOTH idle and zero-valued ("Trades in the last 90 days - idle - 0 trades" in
August). A non-zero idle row still says something and stays.

**Collapsed into the house idiom**, which is now a shared `<Disclosure>` in
`components/ui.tsx` rather than a fifth hand-rolled `<details>`: the digest's first-visit
explanation, the awards page's ties-and-blanks footnote ("How these are settled"), and
/league's axis gloss.

**The award subtitle's `line-clamp-2` was the worst case of all and is gone.** It cost
514px across twenty cards AND cut seven of them off mid-sentence, and what it was cutting
was the D23 honesty caveats - "Hindsight pricing", "the number cannot tell them apart",
"a torn-down roster has little to lose". Those are the point of the subtitle, not its
overflow. The first sentence now renders unclamped, and everything after it is one tap
away instead of deleted by CSS. Single-sentence subtitles render as a plain paragraph and
pay no chrome at all. Page height is unchanged; readability is not.

**/league rendered the same fourteen rosters FOUR times**: a duration x TCI scatter, a
fourteen-row coherence list, a TCI x RFI scatter carrying its own grouped fourteen-row
list, and the power ranking. Measured 3,379px of a 3,900px page at 375px. Nothing was
wrong with any one of them; there were four. Both scatters plot TCI on y and differ only
in what sits on x, so they are one chart with a toggle now (`components/LeagueBoard.tsx`),
addressable as `?board=duration|fragility` through `lib/league/url.ts` -
`history.replaceState` rather than `router.replace`, for D37's reason unchanged: this page
is force-dynamic and its server render walks the whole season chain. The two roster lists
collapse into the power ranking, which grew one mono line carrying `TCI n · RFI n ·
posture`. Numbers first and the word last, deliberately: at 375px that line has no room to
spare, so what truncation eats has to be the half the reader can recover elsewhere.
Verified: **3,879px -> 1,905px at 375, a 51% cut**, and 3,868 -> 1,898 at 390.

What was lost, stated rather than glossed: you can no longer see both axis pairings at
once, and the fragility board's four-way grouped list (with each quadrant's gist) is gone.
The grouped list was also the scatter's only keyboard and screen-reader path, so that part
did NOT go - it is a rail of fourteen 44px labelled buttons, one per dot, at about a
twelfth of the height. All three renderings used to number their rosters differently;
both charts now key to the power ranking's numbering, which is the only way one chart plus
one list can work at all.

**One type scale, six steps.** The app had 17 distinct arbitrary sizes plus Tailwind's
seven defaults - including a half-pixel family (12.5 / 11.5 / 10.5 / 13.5, 37 usages) and
seven sizes used once or twice in the whole codebase. That is a fingerprint of seven
rounds of parallel authorship, not a designed scale, and nothing in the product ever
needed 12.5px to be distinguishable from 12px. `--text-micro/meta/note/body/lede/display`
in `@theme`, named for the job rather than the size. Home went from nine sizes to five.
The half-pixel steps snap DOWN to their integer neighbour and `text-sm` (14/20) lands on
`body` (13) with an explicit `leading-*` wherever the element had none, which is why
/methodology fell 548px and /plan 174px without a word being cut from either.
Rejected: line-heights on the tokens themselves (that would have silently re-spaced every
`text-[11px]` element that currently inherits, growing rows in the name of tidiness);
migrating the sizes inside the components another agent held mid-round (listed in the
round report instead - they are the last arbitrary sizes left in the app).

## D41. THE DESK: the bottom bar became a sheet, League lost its slot, and the search box's URL write flipped because its host changed
The six-tab bar advertised six places you were not, on every screen, and said nothing
about the one place you were. It also had no room to grow: `/more` had already been
bolted on as a sixth tab to hold search plus the surface index, which is how a bar of
tabs admits it has run out of tabs. Three replacements were mocked up at 390pt against
real league content and the owner chose the sheet.

**Two rows at rest, and the top one is not navigation.** 116pt of chrome plus
`env(safe-area-inset-bottom)` - measured at **118pt** in Chromium (116 of rows plus the
two 1pt hairlines the mockup's arithmetic did not count), against the old bar's ~94pt.
Bottom-up: a 53pt destination row (four links), a 44pt CONTEXT row, and a 19pt handle.
The context row is the whole argument for spending the extra 24pt: it names the team on
the lens and states the one thing outstanding, which no bar of tabs can do because a tab
bar's entire vocabulary is "places". Expanded it reaches ~630pt, holding search and the
rest of the registry, with the page still visible above it.

**Expanding moves nothing you can reach, which the mockup got wrong.** In the mockup the
drawer was the last child of the sheet, so opening it pushed the four destinations ~500pt
up the screen and out from under the thumb. In the build the drawer is the FIRST child:
the sheet grows upward and the handle, the context row and the destination row stay
bolted to the bottom in both states. Verified rather than asserted - the destination
row's `top` is byte-identical open and closed at 375, 390, 393, 430 and in landscape,
across all three themes. Muscle memory is the entire budget of a fixed bottom bar, and an
element that jumps when you touch the grip beside it has already spent it. The handle
sits ~117pt above the safe-area inset for the same class of reason: at 24pt it would be
inside the iOS home-indicator swipe.

**LEAGUE LOST ITS SLOT, and so did TRADE.** The four destinations are Today (`/`), Team
(`/roster`), Decide (`/plan`) and Record (`/ledger`). The row asks "what are you here to
do", and standings are a thing you read rather than a thing you do - they move once a
week, Home's Record figure has always linked straight there, and the context row's zero
state links there too. Trade went for the same reason one step further along: it is where
a plan gets executed, so it is reached from /plan, from Home's shortcuts and from the
drawer. What took the fourth slot is the ledger, because capturing reasoning at the moment
of conviction is the thing this app exists for, and it had been sitting two taps deep
behind a curated shortcut.

**The tab list and the registry were two hand-kept lists and had already diverged, so
there is now one.** `lib/nav.ts`'s header claimed five bottom tabs; `BottomNav.tsx`
shipped six; `/more` was a tab that the registry did not list at all, which made that
page's own subtitle ("if it isn't listed below, it doesn't exist yet") false about the
page printing it. The Desk renders `primarySurfaces()` - a filter over the one registry -
and keeps no array of its own, `/more` is in `ALL_SURFACES`, and `nav.test.ts` pins three
invariants: the primary set is exactly those four in that order, every primary entry has a
`short` slot label, and `primary` and `group: "Primary"` are the same set. `/more` itself
survives the tab that created it, deliberately: it is the no-JS and crawler fallback for a
drawer that is otherwise only reachable through a client component, and the drawer's own
"see everything" link.

**`history.replaceState` for the search box, which REVERSES D37, by applying D37's
reasoning rather than repeating its answer.** D37 chose `router.replace` for this exact
component and gave a reason: `/more`'s server render does no real work, so there was no
per-keystroke cost to dodge and letting Next own the URL was free. Mounting the same box
in the Desk's drawer deleted the premise of that sentence - the page underneath is now
whichever page you are on, and two of them (`/values`, which revalues every player in the
league; `/trade`, which prices every roster) are precisely the cost D30 and D37 exist to
dodge. Same reasoning, opposite answer, because the situation is not the same one.

Two smaller consequences of the box becoming a guest rather than a host, both of which
would have been silent bugs: it takes `basePath` (it hardcoded `/more`, and would have
rewritten every other page's URL to `/more` on the first keystroke), and in the drawer it
takes the query key `find` rather than `q`, because `/values` already uses `q` for its own
name filter. The write MERGES into the existing query string instead of rebuilding it, so
a reader who has set `pos`, `sort` and `focus` on the page underneath does not lose them
to a search they typed over the top.

**Lens safety on the context row (D35).** "27 to capture" is a count of one manager's
unwritten reasoning, now rendered on every page in the app, which is exactly the shape of
figure that leaks across identities if nobody is watching. It is gated on
`canCapture(seat, lens)`, the same gate Home already applies to the same number, so it is
absent both when the reader holds no seat and when the lens is on someone else. In legacy
mode (no `AUTH_SECRET`, which is every deploy today) it is always true and nothing changes.

**The zero state is the goal state, so it is not allowed to be dead chrome.** Nothing left
to capture is the outcome the whole app pushes toward; a row that empties out on success
would punish the reader for winning. It falls back to a durable fact about the team on the
lens - `5-15 · 2025 final · 12th of 14`, linking to `/league` - which is also exactly what
a reader looking at someone else's team should see instead of a capture count, so the two
rules land on one branch rather than two. Fixed structure, changing content: deliberately
not phase-aware and not seasonal, because a row that reshapes itself around the calendar is
a row nobody can aim at. The record comes from `currentFormByRoster` and not `h.rosters`,
since D29 was written about that live snapshot reading 0-0 for most of a dynasty year, and
it is only awaited on the branch that needs it so the common case never pays for
`loadSeasonRosters`.

**Two accessibility states, not three.** Collapsed: non-modal, `<nav aria-label="Primary">`
with the four links (the assertion every registry-driven smoke test makes), drawer
`hidden` + `inert`. Expanded: `role="dialog"`, `aria-modal="true"`, focus trapped, Escape
closes and returns focus to the handle, page content `inert`. Intermediate detents were
considered and rejected rather than deferred: a third position is a state with no name to
announce and no keyboard equivalent, so it would be a pointer-only nicety pretending to be
part of the interface. Drag is an accelerator only - the handle is a real button with
`aria-expanded`/`aria-controls`, a full-size chevron in the context row does the same job,
and everything in the drawer is also on `/more`. `prefers-reduced-motion` gets an opacity
snap, no spring and no rubber-band. It never auto-hides on scroll.

**The root layout is now async, and that DID cost something - measured, not assumed.**
The claim it was undertaken on ("33 pages already carry `force-dynamic`, so nothing
regresses to static") is not quite right. Two production builds of the same tree, one with
the layout awaiting `getDeskData()` and one without, differ by exactly four routes:
`/about`, `/settings`, `/claim/invalid` and `/_not-found` were prerendered as static and
are now server-rendered on demand. Everything else was already dynamic. The warm cost is
unmeasurable (D38's corpus cache is keyed by nothing, so this is a Map lookup: `/about`
came in at 1.8-3.3ms after against 2.5-3.3ms before, i.e. inside the noise), and the real
bill is the cold one - on a fresh serverless instance `/about` now shares the corpus
assembly D25 budgets at 1.4s, where before it was a static file. Accepted: `/about` is
the page a reader without a lens lands on, and the alternative is a root layout that
cannot say whose team you are looking at.

**One repo-wide bug fell out of building this and is fixed at the source.**
`tailwind-merge` resolves conflicts from a table it cannot learn our CSS from, and in that
table `text-<word>` is a COLOUR - so the new job-named type scale (`text-body`,
`text-meta`, `text-display`) was being silently DELETED from every `cn()` call that also
carried a conditional colour. Found on the Desk's destination labels rendering at 16px
instead of 11; the same silent drop was already live in `TradeBuilder`, `StreakPanel`,
`ui.tsx` and `drafts/parts.tsx`. `lib/ui.ts` now registers the six names as font sizes via
`extendTailwindMerge`, because the alternative is remembering forever never to put a size
and a colour in the same `cn()`.

Rejected: keeping `/league` as a fifth slot (five destinations plus a seat chip plus a
status line does not fit 390pt without shrinking the labels below legibility, and the
fifth was the one nobody needed daily); giving the drawer its own copy of the four
destinations (it would be advertising links that are permanently on screen two inches
below it); auto-hiding the Desk on scroll to buy back the 24pt (chrome that disappears
when you move is chrome you cannot aim at); a `useEffect` on `pathname` to close the
drawer after navigation (both open states are stored as the path they were opened on
instead, so closing is a derivation rather than a cascading render); autofocusing the
search field on open (it raises the keyboard over the sheet the reader just asked to see).

## D42. THE LAB, and the two experiments behind it, which are graded by what they refuse to compute
Round 8 opens a `/lab` with exactly ONE entry in the surface registry (`group: "The
app"`, not `curated`, not `primary`), so it appears on the full index and nowhere
else. The experiments themselves are deliberately NOT registered: a page that promises
completeness should not be filled with things that may be wrong. Each experiment
carries an `ExperimentBadge` and, on the index, its own biggest DOUBT next to its
premise - an experiment whose author cannot name one is not an experiment.

`ExperimentBadge` is a new component rather than `BetaBadge` from TradeWeb.tsx (its
precedent, and on its way out): "beta" means rough, "experiment" means may be wrong and
may vanish, and those are different promises.

### The counterfactual roster: what if you had never traded?
`lib/lab/counterfactual` rebuilds the roster a manager would hold TODAY having made
zero trades. A roster in this league has exactly three inputs, so this is recoverable
rather than invented: every player taken with a pick the roster was BORN with (via
`slotToRosterId`, read from the original owner's side, which is why commissioner trades'
missing pick data - D19, D24 - costs this derivation nothing), plus every waiver and
free-agent add minus every drop applied in order, plus every future pick the roster was
born with. `pickCapital` gained an `ownership: "held" | "original"` option so both
columns are priced by ONE recipe rather than by a copy that could drift; a test pins
`"held"` byte-identical to today. `coherenceOf` was lifted out of `getTimelineProfile`
(unrounded, so nothing existing moves) so a hypothetical roster is scored on the same
formula and the same SIGMA_REF as a real one.

What makes it publishable is the list of things it will not compute:
- **The pick is not the player.** A manager who traded a pick away is credited with
  whoever was actually taken at their slot, not whoever they would have taken. Largest
  source of error, and there is no fix: a draft board nobody used leaves no record.
- **Waiver knock-on is invisible.** A pickup only possible because a trade opened a
  roster spot is indistinguishable from one that would have happened anyway.
- **Draft order was itself traded.** Rookie order comes from standings that trades
  shaped. Not modelled, not modellable.
- **Roster limits are real.** The trade-free roster is a hoard, not a roster (EZ8's
  holds 37 priced players for 17 spots). Both numbers ship: trimmed by value to the
  number of players actually fielded, and the untrimmed total stated beside it.
- **A player with no NBA team has no honest price**, because the model is anchored on a
  consensus rank that stops meaning anything. Those players are listed and excluded from
  every total rather than scored zero. `corpusTracksNbaTeams` gates the check on whether
  the corpus populates `team` for ANYBODY, because the fixture provider populates it for
  nobody and reading its nulls as "the league has retired" would zero the whole demo.
- **The fourteen counterfactuals do not add up to one league.** 68 players are claimed
  by more than one, because each of those managers picked them up off waivers at some
  point. Reported as an overlap, not resolved.

Live results, which are the argument for shipping it: **Flick the Clint +14,104 and The
Terror Twins +12,548** would be richer having never traded; **zachgoldy -9,942** is the
largest beneficiary and his trade-free roster cannot even fill a lineup (12 priced
players for 19 spots, from 13 non-trade adds in five seasons). The most interesting
answers are the ones value alone misses: **6-Month Plan is -278, a wash, while his TCI
falls 71 to 61** - no richer and less coherent. `describeCounterfactual` states all of
this without a verdict, pinned by a test that fails on a banned grade vocabulary (D6):
trading value for pick capital is a strategy, and the two columns are the argument.

### The regret ledger: lock-in, recorded rather than judged
This league is `game_mode: 1`. Seven slots a week, each holding one player-GAME.
`lib/lab/regret` shows, for every past week, what each slot banked against the best
seven distinct player-games the roster produced.

**Two API facts were established live before any of it was written, because the feature
is wrong without them.** First, `players_points` on the matchup endpoint is NOT the
player's best game - for a slotted player it is the game that locked, for everyone else
it tracks the latest game played (measured: 97 of 322 sampled player-weeks sat below
that player's best). So it cannot stand in for "what was available" and the per-player
`grouping=week` stats request is genuinely required. Second, `/v1/stats/nba/regular/
{season}/{week}` looks like the cheap way to do this and is a trap: last game of the
week only, ~557 players. Not used.

**Position eligibility is deliberately NOT applied, and this is the entry's sharpest
finding.** Sleeper reports only TODAY's eligibility, and **193 of the 2,244 filled slots
this league actually played in 2025 would be illegal under it**. Applying it would grade
real lineups against a rulebook they did not play under, so best-available is an UPPER
BOUND and says so. IR and taxi status per week is not recoverable from any endpoint
either, so a little of the pool was never startable.

**Every banked figure is reconciled against the box scores** under the league's own
scoring settings (never `pts_std`, which excludes this league's 40/50-point bonuses: a
43-point game reads 33.0 there against a real 39.5). Result across all fourteen managers
in 2025: **2,244 of 2,244 filled slots matched a real game**, and the derivation
independently reproduces the verified league totals of 10 empty slots and 126 zero-scoring
slots. A slot whose figure matches exactly one game names that game, because a lock-in
slot is a player-game and that is the vocabulary managers already read a week in; a
figure matching two games names neither.

**The copy never calls a banked slot a mistake** (D6, and the same distinction D23
protects). A manager who banked 28 on Tuesday could not know Thursday would bring 41. The
ONE exception is named as one: an empty slot required no foresight to avoid - and even
that carries the caveat "Left On The Bench" already carries, that a team playing for
draft position leaves the same trace. Live: the league's most attentive manager banked
92% of what was available; **EZ8 banked 46%, with 5 empty slots and 29 that scored zero**,
and week 6 was 23 banked against 218 available.

**Cost (D25).** `lib/lab/regret/source.ts` is reached only from `/lab/regret` and never
from `assembleCorpus()`. `cache: "no-store"` plus an in-process single-flight memo, the
`/players/nba` precedent, because the payloads clear Next's 2MB fetch-cache ceiling.
Measured per manager-season: 23 lineup requests and 21 to 51 player requests, ~2s cold,
0.1s warm, and a second manager in the same season pays only for players the first did
not hold. Rejected: folding any of it into the corpus (a latency tax on every page for
one Lab surface); using `players_points` as the available pool (measured wrong);
applying today's position eligibility (grades real lineups against a rulebook they did
not play under).

## D43. THE TRADE WEB IS DELETED, and the ring is the part worth explaining
The owner's read on the trade-trees concept was that it "needs an overhaul, having a
really hard time understanding it intuitively, it feels like the pieces are there but
it's not coming together well." Three separate things were wrong, and only one of them
was a UI problem.

**The ring encoded one variable in two pixels.** Edge counts in this league run 1 to 8.
The stroke formula (`0.8 + 3.0 * (count/max)^0.65`, on a 400-unit viewBox scaled to a
390px column) rendered a 1-deal strand at **1.41px** and an 8-deal strand at **3.40px**.
That is the entire dynamic range of the only thing the drawing encoded, spread across
**46 overlapping bowed curves**, with **23 of the 46 sitting at the minimum**. The page's
own copy already conceded the point - "Everything is also listed below" - and the list
was better than the picture, because a list can print the number. Two smaller sins rode
along: the ring minted abbreviations (`5YP`, `6MP`, `TTT`) that appear nowhere else in
the app, so a reader met a private vocabulary inside one drawing and never again; and it
drew **15 nodes for a 14-team league**, which is CORRECT (D22 - one node per principal,
and roster 11 has changed hands) and is the worst possible place to learn that fact.

**The trees were fourfold redundant, by construction.** `rankTradeRoots` emitted one root
per `(asset, seat)` pair, so **381 roots covered 91 trades** and a 15-asset blockbuster
became fifteen near-identical "stories" of the same deal. That is the specific thing the
owner was feeling.

**And the direction was wrong.** See D44.

Deleted outright: `components/TradeWeb.tsx` (1,546 lines), `app/web/` (174),
`buildTradeTree`, `rankTradeRoots`, `countTreeNodes`, `treeDepth`, `TradeRoot`,
`TradeTreeNode`, `TreeContext`, `ringOrder`, `abbreviate`, `RING`, `bowedPath`,
`TradeGraphEdge`, `TradeGraph.maxEdgeCount/possiblePairs/weightsAgree`,
`TradeGraphNode.x/y/abbr`, and the BetaBadge and beta warn card. `buildTradeGraph`
becomes `buildTradeLedger` and loses its geometry; `TradeGraphEdge` becomes
`TradePairing`, which is not a cosmetic rename - an edge is a thing you draw, and
nothing in the app draws one any more. Kept and reused verbatim: `buildAssetMoves`,
`buildHoldings`, `TradeRecord` (it WAS the receipt, it just had nowhere to print),
`PlayerNow`, `ManagerMetric`, `ManagerLink`, `PlayerNowRow`, and all of `lib/lineage`.

**`/web` 308s to `/deals`** (`next.config.ts`). Permanent rather than temporary because
the move is permanent and a 308 is the only redirect a crawler treats as an instruction
to update the link. It lands on the INDEX and deliberately does not try to rebuild
`?trade=<id>` into `/deals/<id>`: a redirect that parses query strings is a route in
disguise, every in-app caller was fixed at the source in the same change
(`lib/tradegraph/url.ts`), and the only traffic left is the bookmark case, which wants
the index anyway.

**The two overview stats the ring displayed live on `/deals`, not `/league`.** 46 of 105
pairs have traded; the busiest pairing is The Terror Twins and 6-Month Plan at 8 deals.
The brief offered `/league` or deletion; both were declined for the same reason. These are facts
about the DEAL RECORD, and the page whose entire subject is the deal record is the one
place they cost no context to interpret - on `/league`, a "46 of 105" tile is a figure
from another feature that would need its own sentence to explain what a pair even is.
They were already the ring's own overview panel, i.e. this page's header, so they have
not moved so much as stayed put while the drawing above them was removed.

**The deleted `weightsAgree` flag had been reporting a real bug for rounds, and moving
its subject into a headline is what finally caught it.** `TradePairing.count` was
`max(dossier-derived weight, tradeIds.length)`, and the dossier fold is ROSTER-keyed, so
for a seat that has changed hands it credits the successor with everything the seat ever
did. Sorting `/deals` on it announced "Busiest pairing: kdewitt4 and 6-Month Plan, 8
deals" - kdewitt4 has done **2** with them, the other **6** belong to NSLKB, who left in
2024. Exactly the D22 failure, in a sentence. The field is now split in two:
`dealCount` (what can be listed, and the only one anything sorts or headlines on) and
`dossierCount` (kept, because Manager Compare deliberately shows the gap and a pair
should never be undersold), with the roster-keyed blend named in both doc comments and
pinned by a test. A silent boolean nobody acted on was worse than no flag at all.

Rejected: fixing the ring's encoding (there is no stroke formula that makes 46
overlapping curves legible at 390px, and the list was already winning); keeping trees
behind a "biggest chains" filter (the redundancy is in the derivation, not the
presentation); a 307 or a soft 404 on `/web` (four surfaces and an unknown number of
pasted links point at it); keeping one `count` field and remembering which callers may
use it (that is the arrangement that produced the wrong headline).

## D44. PROVENANCE: the story runs BACKWARDS, which is what turns a tree into a chain
The trade tree ran forward from a departure: you gave up one player, three things came
back, each of those can be flipped for more things. Forward, the story BRANCHES, there
is no natural end, and the code needed a depth cap (4), a seen-set, and a "chain
continues" escape hatch to stop - three admissions in a row that the shape does not fit.

Backwards from something you hold, **every hop has exactly one predecessor**. A thing
arrived on your roster from precisely one place. Measured over all 418 addressable assets
in the real league (264 that have ever moved in a trade, plus every player on a roster
today): 151 are at their origin already, 154 are one hop from it, 73 are two, 20 are
three, 12 are four, and 8 are five. **The longest chain in five seasons of this league is
five hops.** The recursion, the depth cap, the seen-set and the truncation message all
went with the direction; `buildProvenance` is a `while` loop whose only guard is a cycle
brake set far above anything real data can produce.

**Time is the y-axis, and that is the single biggest thing the old feature was missing.**
`AssetMove.created` has existed since the first version and was used only for sorting.
Drawing it is what turns "it sat unresolved for eighteen months" from a subtraction the
reader performs into a gap they can see. `components/ProvenanceRail.tsx` is one SVG - a
line, a dot per event, integer coordinates, CSS-variable colours, `role="img"` with a
full-sentence label - beside a text column, both driven by ONE array of row heights
(`layoutRows`), so the grid's total height is exactly the SVG's and the dots cannot drift
out of alignment with the sentences. Heights are proportional to elapsed time, floored at
92px so two events days apart still have room for their own words, and the proportional
budget scales with the number of gaps so a three-node chain does not spend 900px drawing
one empty stretch.

**The pick-to-player resolution is an EVENT, not a parenthetical.** It is the only place
a chain changes species and the most interesting thing that happens in one, so it gets
its own node, its own shape (a diamond, not only a different hue - colour alone does not
say "different kind of thing" to every reader), and its own link into the draft board.

**Five terminal sentences and no sixth** (`ORIGIN_TEXT`): acquired in the {season} startup
draft / signed off waivers / signed as a free agent / on this roster before the record
begins / {who}'s own {season} {nth} pick. An undrafted pick's terminus is `REASON_TEXT`
from `lib/lineage`, **exported for this and printed verbatim**, so /drafts and the rail
cannot describe the same unresolved pick two different ways. A test fails on a banned
grade vocabulary (D6) and on any em dash.

**Every asset has one, so there is no empty state.** A never-traded startup pick is a real
answer, not a failure to find something. Entry is from the PLAYER: an expandable rail
inside the roster row on `/roster` (server-rendered, passed into the client row as a
node), and a link to the standalone `/lineage/[assetKey]` from `/values`, global search,
the deal receipt, and `/drafts`. `/drafts` keeps "What that pick became" UNCHANGED and
gains one sibling link per card - a sibling, never nested, because the card is already
one `<Link>` and an `<a>` inside an `<a>` is exactly what threw a hydration error in D30.

**THREE BUGS WERE FOUND BY RENDERING THE REAL LEAGUE, not by reading the code**, and all
three are the kind that look completely plausible on the page. Each now has a test.
1. **A spent pick claimed it had not been drafted.** `/lineage/k:2025-1-11` said "5-Year
   Plan holds it. Not drafted yet" about the pick that became Cooper Flagg at 1.01. A
   spent pick's chain IS its player's chain, so it redirects - but only when the player's
   own walk actually arrives back at that pick, because the over-eager first version
   answered "what happened to my 2025 3rd?" by showing a chain that had deleted the
   pick's whole history (the player had since been claimed off waivers by someone else,
   so his chain honestly stops there). One pick lost all five of its hops that way.
2. **A departed manager's asset was credited to their successor.** `k:2025-1-11` is
   roster 11's own 2025 first; roster 11 changed hands between 2024 and 2025; the pick
   was traded away in January 2024. Naming its original owner from the CURRENT holder
   printed "kdewitt4's own 2025 1st pick" for a pick NSLKB had already sold - the exact
   D22 failure. Fixed by carrying `AssetMove.fromOwnerId` (already resolved at the hop's
   own season) down the walk.
3. **Picks traded ON draft day were being dropped.** `DraftMeta.startTime` is when the
   draft was SCHEDULED, so bounding the pick's backward walk by it silently discarded
   hops stamped a few hours later. 11 picks gained back between one and three hops. The
   rail's y-axis still has to be non-decreasing, so `orderInTime` raises the DRAFT node
   to sit after the last hop and drops its `dated` flag (the rail draws it hollow) - a
   recorded trade timestamp is never moved.

Verified live, and these are the two chains the brief asked for:
- **`k:2024-1-6`**: "5-Year Plan's own 2024 1st pick." -> 12 months later "Traded to
  Giddler on the Roof, by 5-Year Plan" (2023-10-27) -> 2 months later "Traded to NSLKB,
  by Giddler on the Roof" (2023-12-14) -> 23 days later "Traded to 5-Year Plan, by
  NSLKB" (2024-01-06) -> 8 months later "The pick became Stephon Castle, 2024 1st, pick
  #5, used by 5-Year Plan" -> 23 months later "On 5-Year Plan today." He sold his own
  first and bought it back, and the app now says so once, in one place, instead of
  calling it "gave up" on one page and "acquired" on another.
- **`k:2025-1-11`**: "NSLKB's own 2025 1st pick." -> "Traded to 5-Year Plan, by NSLKB"
  (2024-01-06) -> 20 months later "The pick became Cooper Flagg, 2025 1st, pick #1, used
  by 5-Year Plan" -> "On 5-Year Plan today."

**Cost (D25), stated rather than assumed.** `loadProvenanceSource` needs `getPrincipals`
and `buildDraftIndex`, both already on-demand and memoized behind their own 5-minute
TTLs. `/deals`, `/lineage` and `/drafts` were always going to pay it. Putting it on
`/roster` too is a deliberate choice: "why is he on my team" is the question that page
exists to answer, and answering it two taps away would have made the feature ornamental.
Nothing is folded into `assembleCorpus()`. Rejected: rendering rails inline on `/values`
(that list is assembled client-side from `ValueRow` data, so there is no server render to
hang one off - those rows link out instead); keeping a forward "what did I get for him"
view alongside this (it is the same data, and it is the shape that did not work).

## D45. THE RECEIPT: one trade, one URL, and no verdict anywhere on it
`/deals/[transactionId]`. `TradeRecord` has been the receipt since the trade graph was
written; it had nowhere to print. Meanwhile the digest, global search, Manager Compare,
the dossiers and the commissioner's audit log had all been linking a SPECIFIC deal for
several rounds, and every one of them dropped its reader into a fourteen-node ring with
one strand lit and the deal itself somewhere in a list underneath. Renaming
`tradeWebHref` to `dealHref` in `lib/tradegraph/url.ts` fixed all five call sites in one
file, which is the payoff for D30 having put the mapping in one place to begin with.

N stacked side-blocks, one per party (`tradeParties` already computes the set, and this
league's biggest deals are three-way), each asset a row carrying what it is worth TODAY
and, for a pick, what it actually became, resolved inline. Parties and assets are read
from the TRANSACTION rather than from the asset moves: a move needs a recorded `from` to
exist at all, and a receipt that quietly omitted an asset because its counterpart drop
was missing would be the wrong kind of tidy. Every player row links to its own provenance
rail. Trade -> asset -> trade is the loop, and it is the whole feature.

**One SVG**, `SideBars` in `components/charts.tsx`, reusing that file's existing bar
idiom. Horizontal rather than vertical because the labels are team names: at 390px a
vertical chart gives each side ~150px to print "The Terror Twins" under it and truncates,
while a horizontal bar puts the name on its own full-width line. It draws two lengths and
computes no difference, ratio or delta - **the moment it renders "+2,400" it has issued a
verdict** (D6).

**Three honesty caveats ride with the number rather than living on a methodology page.**
D23: this is hindsight, it measures how the deal turned out and not how it was reasoned,
and because the app holds no historical ranking snapshots a value-at-trade-time version
is **not available** - so the copy says today, and only today. D24: players only, with
the direction of the bias stated out loud (a side that sent picks for players looks
better here than it was; a side that sold for picks looks worse), and the picks listed
above unpriced. D19: a deal carrying inferred picks says so in a warn card at the top,
before any number.

Former counterparties render `former 2022-2024` with no TCI or RFI pills. `ManagerLink`'s
existing guard was ported into `components/TradeParts.tsx` unchanged and this is not
hypothetical: **the biggest trade in this league's history was made with a manager who
has since left**, and both metrics describe a roster as it stands tonight, so attaching
them to a departed principal borrows the numbers of whoever replaced them.

`/deals` itself is the index, filtered through the query string (`?manager=`, `?pair=`,
`?season=`) with plain links rather than component state, so the whole surface ships zero
client JavaScript and `pairDealsHref` / `managerDealsHref` give Manager Compare and the
dossiers the filtered view they were already trying to reach.

One bug caught on the first live render and worth recording because of how long it hid:
**`PlayerNowRow` never printed the player's name.** It had only ever appeared underneath
a tree node that had already printed it, so on a receipt - where it is the whole row - it
rendered a value with nobody attached to it. Rejected: a "winner" or a value delta (D6);
pricing the picks to complete the total (D24 - a number that looks complete and is not);
a redirect that reconstructs `/web?trade=<id>` into `/deals/<id>` (see D43).

## D46. DEAD ENDS ARE A DATA PROBLEM, so the fix is a table and a failing test
Four surfaces shipped with zero outbound links and the app read, correctly, as "a set
of destinations with no connective tissue - every journey ends by bouncing off the
bottom bar." Repairing those four would have been a patch that says nothing about the
fifth. `ONWARD` in `lib/nav.ts` is a map from every registered surface to at least two
next steps, and `nav.test.ts` fails the build when a surface has fewer - so the next
dead end cannot be shipped, only designed.

**The `why` is the load-bearing half, not the href.** Each step prints the QUESTION
this page leaves you holding, with the destination's name underneath it: "So what do I
do about it? / Plan", "Who has what I am missing? / Trade Finder". A row of bare page
names would be the drawer again, two inches higher up, and the drawer is already one
tap away at all times. Registered destinations take their label FROM the registry
rather than carrying a copy, pinned by a test, because a hardcoded name is exactly how
the label drift below happened.

**`managerLinks()` collapses four separately-reported integration failures into one
rule.** A survey of dynasty tooling found the complaints were not about missing
features; they were about this app's own features being unreachable from where they
would change a decision. Named: the Trade Finder unreachable from `/managers` and
Manager Compare, where two rivals are being weighed; the dossier unreachable from the
trade evaluation naming its counterparty ("what does this manager actually value" was
the third most common complaint in that corpus, and the dossier answers it); the
decision ledger unreachable from a trade log; and both proprietary metrics absent from
the Trade Finder. Those are one bug in four costumes - **a surface names a manager and
does not link to what the app already knows about them** - so they get one function,
and the former-manager guard (D22) lives inside it rather than at four call sites where
three of them would forget it. `components/ManagerRail.tsx` renders whatever it
returns.

The Trade Finder's partner view additionally prints both postures side by side, because
that is the reading that actually moves a trade: two rosters that agree about WHEN they
win have little room between them, and two that disagree have a lot. Same two
league-wide passes `/league` already runs, no new derivation (D25).

**`/commissioner` had zero inbound links and zero outbound ones** - the longest page in
the app, at 10,125px, was one nobody could navigate to. `/league`'s onward row is the
door, deliberately not the curated pill row: a commissioner-only tool in front of all
fourteen managers is a different claim from "you might want this next". (D48 removed
that pill row outright; the argument for putting the link in the onward row survives it,
and is in fact why the onward row was the only thing worth keeping.) Its audit log
now folds by season with the current one open, which is most of that height. The e2e
deep link into a 2022 deal grew a step rather than losing one, and asserts BOTH that the
row is still attached while its season is shut and that opening it works - anything less
would let "collapsed" and "deleted" pass the same test.

**Label drift, fixed at the source.** The registry called `/drafts` "Draft history"; the
page, its two children and all six inbound links called it "Pick lineage". Six against
one, and lineage is what the page does. `/rank` became `curated`: it feeds every Trade
Finder package's conviction line and appeared in no shortcut list anywhere in the app,
which is a feature doing live work behind a door nobody could find. (The `curated` flag
itself is gone as of D48. `/rank` is still in the drawer and still reachable from the
Trade Finder, which was the point; the shortcut list it was promoted into is not.) `/lab` was NOT
promoted - D42 is explicit that unfinished work must not compete with finished work for
a slot - so its two experiments are reached as onward steps from the pages whose
question they answer instead.

Rejected: adding `<Onward>` to the layout (owned by another pass, and Home is a
registry hub that would be advertising itself); one shared "related pages" component
keyed on content similarity (the value is in the sentence, and a sentence has to be
written); putting the commissioner in the curated row.

## D47. THE CHART COLOUR VOCABULARY, and why the text half of a hue cannot be a hex
The app's restraint had been read as timidity in its charts, and the reflex fix - a
red-to-green ramp - is the one encoding that is unreadable to the ~8% of men with a
red-green deficiency. `lib/chart-colors.ts` is four rules with their measurements.

1. **Colour is never the only encoding** (WCAG 1.4.1). Every hue sits beside a
   position, a length or a printed number carrying the same value. The acceptance test
   is literal: delete every fill and the chart still reads.
2. **Magnitude is one hue at five strengths**, applied as opacity over
   `var(--color-accent)`. Single-hue sequential ramps carry their ordering in
   lightness, so they survive every form of CVD - and using the accent rather than a
   fixed hex makes the ramp theme-proof by construction rather than by a token per
   theme, which matters because the theme blocks are owned elsewhere. The floor is 0.3,
   not 0: the low end of a distribution is an observation, not an absence, and the
   high-contrast theme exists to stop this app asking anyone to squint. (D48 measured
   the ramp and found 0.3 is still not enough to clear 3:1 on any ground. The rule that
   survives is narrower: the ramp is only ever a THIRD encoding.)
3. **Signed values use PiYG, not RdYlGn.** `RdYlGn` is not colourblind-safe at any
   class count; PiYG still reads as red-ish against green-ish to a trichromat while
   staying separable under deuteranopia and protanopia. The endpoints are shifted off
   canonical PiYG (`#c51b7d` / `#4d9221`) to `#d2569f` / `#4d9221` for one measured
   reason: canonical magenta is 2.69:1 against the dark ground, under the 3:1 a
   graphical object must clear. Shipped pair, against all three grounds -
   `#d2569f`: 3.35 / 4.30 / 5.57. `#4d9221`: 3.43 / 4.17 / 5.45. All six clear 3:1.
4. **The fill value and the text value of a hue are different values, and this is
   forced rather than chosen.** Text needs 4.5:1. Against Paper (relative luminance
   0.885) that means a text colour at or below ~0.185 luminance; against the dark
   ground (0.004) it means ~0.19 or above. **No fixed value satisfies both**, so there
   is no hex that can be legible small type in every Parquet theme. The text half of
   each hue therefore resolves to the app's own ink token. In practice: the hue goes
   in the fill, the number goes in ink, and they sit next to each other. A caller that
   wants to tint type has misread the file.

**`DistributionStrip` is where rule 1 does the most work.** The metrics audit found the
app printing TCI, RFI, total value, pick capital and top-5 share as bare figures. "Your
TCI is 61" is unanswerable - 61 out of what, against whom, and is 61 the good end - and
the comparison was never missing data, only a drawing: all fourteen rosters are already
in hand every time one of those numbers is printed. One tick per roster, the viewer's
taller with a triangle above it, the rank printed, the median dashed and explicitly
labelled as a median rather than a pass mark.

**It never says which end is good.** `betterEnd` only words the rank sentence, and is
omitted wherever the direction is genuinely not a judgement - top-5 share is a shape
(a contender's roster and a rebuild's problem), and net pick capital's own caption says
buying picks and spending them are both strategies (D6, D23).

**/roster's stat rail was deleted, not kept alongside.** It printed "TOTAL VALUE 26,641"
and the strip printed the same figure with its rank directly underneath: three numbers
twice in 150px. One block now, each row keeping the destination its cell linked to and
gaining the distribution the cell could never carry - a rank alone ("11th") does not say
whether the pack is bunched or strung out, and the pack is the reading.

**Range labels are HTML, not SVG text.** The viewBox is 320 units against a 672px column
cap, so an 8px SVG caption renders at up to 16px - larger than the body type it sits
under, and worst in landscape. Geometry scales with the chart; a caption stays on the
type scale.

Rejected: a per-theme chart palette in `globals.css` (three theme blocks owned by
another pass, and a ramp defined as opacity over the accent needs none of them); a
diverging pair on the deal receipt's `SideBars` (it computes no difference on purpose -
the moment it colours a winner it has issued a verdict, D45); colouring the fragility
axis of the quadrant (D23 - a green low-RFI end would be a lie); keeping `--color-positive`
and `--color-negative` as bar fills while leaving them semantic in type (one token
cannot mean "went up" and "this bar" at once).

## D48. THE LAST INDEX GOES, AND A RAMP THAT WAS MEASURED RATHER THAN ASSERTED
Two loose ends from round 8, both of which turned out to be the same kind of mistake:
something that had been argued for in prose and never checked against what was on
screen.

**`/league`'s pill row is deleted, and the `curated` flag with it.** The row rendered
`curatedSurfaces()` - ten of the app's twenty-four surfaces, drawn from every group,
including Season recap, Build your own ranking and The Analyst. That is an index, not a
table of contents for a standings page, and this round had already deleted the identical
list from Home for exactly that reason (D46, "Home is a landing page again"). Leaving it
on `/league` would have kept the app at three indexes with one of them pretending to be
page content.

The alternative on the table was keeping the row and dropping only its "All surfaces"
pill. That is worse than either whole option: it leaves a curated ten with no path to the
other fourteen, which is a dead end by D46's own definition, and it relies on the drawer
to carry the tail while refusing to let the drawer carry the head.

What `/league` navigates by now is what every other page navigates by: `onwardFrom`,
which gives a reason rather than a list, and the Desk drawer, which is the index. The
`curated` field, `curatedSurfaces()` and its two tests are gone rather than left as an
unused export - a filter with no consumer is how the two hand-kept nav arrays that
started this whole registry drifted apart in the first place.

**The magnitude ramp was never measured, and it does not clear 3:1.** D47 asserted a
floor of 0.3 so the weakest step would not be "almost invisible". Composited against its
own ground the ramp actually runs 1.55 / 1.99 / 2.61 / 3.86 / 5.92 on Paper, 1.89 / 2.85
/ 4.21 / 6.78 / 10.18 on dark, 2.05 / 3.42 / 5.44 / 9.34 / 14.75 on contrast. The bottom
two steps are under 3:1 everywhere, and no floor rescues it: the weakest step only clears
3:1 at opacity 0.70, and five steps between 0.70 and 1.00 is not an ordering anyone can
see. An opacity ramp cannot be both a legible ordering and 3:1 at every step. That is a
property of the mechanism, not a tuning problem.

So the rule narrows instead of the numbers moving. The ramp is permitted only where a
length and a printed number already carry the value independently - the bar charts and
the deal receipt - and is forbidden where a mark's visibility is itself the datum.
`DistributionStrip`'s peer ticks were the second case and are now flat: a tick's position
already IS its value, so the ramp restated it, and in restating it faded the low tail
toward the background. A distribution strip that quietly loses its tail says "nobody is
down there", which is the one thing it must never say by accident.

The diverging pair was also re-measured and does hold: `#d2569f` / `#4d9221` run 3.43 /
3.51 against Paper, 5.19 / 5.08 against dark, 5.57 / 5.45 against contrast, and 4.61-4.80
against each theme's card surface. Twelve measurements, tightest 3.43. D47's published
table was slightly wrong in both directions and has been corrected to the measured values.

**Swept up with them,** because five agents in one round leave the same residue twice:
the last eight raw gold alphas in `Desk.tsx` and `app/page.tsx` onto the three accent
tokens; the four chart components still setting figures in mono, including the `/roster`
card that rendered "34,361" in the sans next to "5th highest of 14" in mono; `.tnum`,
the half-measure `.figure` replaced, deleted at its final call site; a duplicated
`.figure` / `.edge-hilite` block in `globals.css`; and `--motion-*` declared in both
`globals.css` and `interaction.css` - two agents independently fixing the same
missing-declaration bug, which is precisely how the declaration went missing.

## D49. NBA team crests, hotlinked from the SAME CDN as everything else, and gated on nothing
The owner asked for "player images and any other images or logos that would make things
look even better." The player-photo half was already done (D39); this is the logo half,
plus a robustness re-check of D39's work now that the owner is about to flip
`NEXT_PUBLIC_USE_PLAYER_PHOTOS` on for real.

**The photo path checked out clean.** All three concerns the owner raised were verified
rather than assumed: the thumb endpoint's real pixel size is 250x167-350x254 (checked
across all 60 rendered rows on a live `/values`), which is 4-6x the 40-56px this app
ever displays it at, so nothing is upscaled and nothing needs a bigger variant. The
themed-disc backing D39 already put under the cutout (never a flat rectangle behind it)
reads clean on all three themes on a real render - dark, paper, contrast - so no extra
ring was added on top of it. The monogram fallback (photos off, or a 404) already reads
as deliberate: initials, themed disc, the 2px team-hue edge. Nothing here needed to move.

**`sleepercdn.com/images/team_logos/nba/{abbr}.png` is a real, reliable source.** Checked
by loading all 30 current teams' lowercase-abbreviation URLs in a real browser and eyeballing
several of them side by side (Celtics, Lakers, Warriors, Heat, Mavericks, Bulls, Nets, Jazz,
Clippers) - each one is that team's actual crest, 150-300px square, not a shared placeholder.
Same host `PlayerAvatar` and `TeamAvatar` already hotlink, so this is one more path on a CDN
already in use, not a new dependency or a new domain to trust.

**Not gated behind `NEXT_PUBLIC_USE_PLAYER_PHOTOS`, and that is a considered choice, not an
oversight.** That flag exists for one specific reason: a real person's headshot is a
licensing question a fork's owner has to have actually thought about (D39). A team crest is
a trademark, not anyone's likeness, hotlinked the way every fantasy product on the web
already displays one - and `TeamAvatar` next door already hotlinks Sleeper-hosted manager
avatars (real people's own uploaded photos) with no gate at all. Holding a brand mark to a
stricter bar than a person's photo would be backwards, not careful. New component:
`components/TeamLogo.tsx`, `"use client"`, same fail-silent pattern as its neighbours -
404 or network error renders nothing, never a broken-image glyph.

**Placement: a corner badge on `PlayerAvatar`, opt-in per call site (`teamBadge` prop), and
only where the team is not already printed as text nearby.** This app's densest lists -
`/values`, the roster's own player rows, `PlayerRow`, `SearchPanel`, `DraftReportCard`,
`RankingBoard`, the draft board - all already print the team abbreviation as text next to
position and age. A crest there would be a second, louder copy of a datum the reader
already has, which is the exact mistake D39 undid when it stripped the full-saturation
team-colour fill off the disc itself. Rejected there for the same reason, not overlooked.

Turned on in the four spots that do NOT print the team as text: `TradeBuilder`'s give/get
rows (`meta` there is position and age only - team was never visible at all); the deal
receipt's `PlayerNowRow` (value, tier and duration are this app's own numbers, no team
anywhere in the row); the roster's one single-point-of-failure sentence ("Season hinges on
X") which never names his team either; and the `/lineage` header, where the crest actually
**replaces** text - the meta line under the player's name used to read "PG · LAL · 27y"
and now reads "PG · 27y", the crest doing the team's job. That fourth one is the only
placement that deletes a word instead of only adding a picture.

**The provenance rail gets exactly one face, not five.** `ProvenanceHop` (the trade-by-trade
nodes) has no manager avatar data reachable without threading `ManagerRef` fields through
three separate call sites (`/roster`, `/lineage/[assetKey]`, `ValuesList`) for a rail whose
own docstring says its job is a TIME axis, not a cast of characters - and the hop's own link
already lands on the deal receipt one tap away, where the faces already live (`TradeParts`).
Rejected on cost against a rail that is not the receipt. `ProvenanceResolution` ("the pick
became {playerName}") is different: it already carries `playerId` on the node itself, so a
`PlayerAvatar` there costs nothing to plumb and is the one moment on the rail an
abstraction (a pick) turns into an actual person - the single face this component gets, at
the one node built for it.

**Rejected outright, not attempted.** Team logos on `/awards` (its winners are managers,
already carrying `TeamAvatar`, not NBA teams) and on `/lineage`'s draft-pick pages (a pick
has no NBA team until it resolves, and the resolution node already gets the treatment
above). A per-row crest on the draft board (`app/drafts/parts.tsx`) - same redundant-with-
text objection as the other dense lists, and 15+ picks per round is exactly the kind of
list D39 already decided avatars don't belong on.
