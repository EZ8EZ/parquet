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
annotations, and even that is best-effort: if it is unreachable the write returns
`persisted: false` instead of erroring. Rejected: requiring Postgres to deploy (a
setup wall for a private app); localStorage-only annotations (lost across devices).

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
anchor points. `injuryMax` and `roleMax` are `Math.max` over their config maps (including the
"healthy"/`null` case, which resolves to 1.0), so if either config ever changes to exceed 1.0
the ceiling calculation picks it up automatically instead of needing a matching edit somewhere
else. `posMax` is the max of `positionMultipliers()` computed from the league's actual live
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
