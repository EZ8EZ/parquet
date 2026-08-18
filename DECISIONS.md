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
`unrecordedPickMoves()`.

**Second pass: the inference engine came back, uncalled, and was deleted again - and
the "(inferred)" caveat went with it.** A hardened `attachInferredPicks` survived in
`lib/derive/coalesce.ts` with **zero callers**, so `inferred: true` was set nowhere in
the running app. Every piece of UX built on it - the "(inferred)" suffix in
`pickLabel`, the `inferred` pill on the receipt, the `pick inferred` note on the
provenance rail, the `hasInferredPicks` warn card - was honesty machinery for a
condition that **had never once occurred on real data**, which reads as a disclosure
and is really just decoration.

Re-measured against NSL Fantasy Hoops before deciding, and the hardening changed
nothing. The league contains exactly **one** coalesced commissioner trade
(2023-07-03, EZ8 / aidsnuge / kdewitt4 - Booker, Poole, Klay, Ayton, players only),
so the function's ambiguity guard (`matches.length !== 1`) can never fire: with one
candidate, "ambiguous" is unreachable by construction. Its season floor
(`pick.season >= trade.season`) excludes nothing either, because a 2023 trade admits
2023, 2024 and 2025 picks alike. The result was the original six wrong hops, verbatim:

    2024 1st (orig. vood12)     EZ8      -> kdewitt4
    2023 1st (orig. EZ8)        EZ8      -> aidsnuge
    2023 1st (orig. aidsnuge)   aidsnuge -> EZ8
    2025 1st (orig. aidsnuge)   aidsnuge -> kdewitt4
    2024 1st (orig. nathang21)  aidsnuge -> kdewitt4
    2023 2nd (orig. kdewitt4)   kdewitt4 -> aidsnuge

Six first-rounders across three draft classes, hung on a four-player deal that moved
no picks. And each has a **better** explanation the algorithm is structurally blind
to, because it only ever considers coalesced trades as candidates: EZ8 and kdewitt4
made a recorded seven-pick blockbuster on 2024-01-07, and aidsnuge and kdewitt4 a
recorded two-pick deal on 2023-12-15 - both inside the same league year as the July
row, both at least as plausible, neither ever weighed. The signal is not merely weak;
the candidate set is wrong.

So: `attachInferredPicks` is deleted, `DraftPickRef.inferred` and
`TradeRecord.hasInferredPicks` are deleted, and the four UI markers are deleted.
`lib/derive/coalesce.test.ts` now pins the reconstruction AND pins that a coalesced
trade comes out with `draftPicks: []`, so a third attempt fails a test rather than
sitting dormant.

**What replaced the caveat is a caveat that is actually true.** `commissionerExecuted`
is a *checked property of the source rows* (the transaction id is `coalesced-`), not a
claim about contents, and it fires on that real 2023 deal: the receipt says "Pick
record missing - if picks changed hands here, they are not below, and the app will not
guess which ones," and the deals list tags it `no pick record`. Rejected: wiring the
function in as-is (it fabricates); keeping the "(inferred)" vocabulary against a
condition that cannot occur (a disclosure that never fires is worse than none, because
its silence reads as "nothing to disclose").

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

Consequence: tests had to pin `LEAGUE_PROVIDER=fixture` in `vitest.config.mjs`, because
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

Note on D19's second pass: nothing here changes. The pick side of commissioner trades
was never actually present - the `inferred` flag that once implied it might be turned
out to be dead code that never set itself on real data - so this bias was always the
whole truth about picks, not a partial one. The trades it applies to are now visibly
marked `no pick record` rather than potentially "(inferred)".

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

**AMENDMENT (post age-curve recalibration).** Two figures above have moved and one has
not, and the split is the point of the entry rather than an erratum against it. The
rescale constant `1.2170096908167976` is UNCHANGED and still pinned by test, because the
derivation deliberately scales the measured curve to the peak the hand-set anchors
already had (`1.16`), so `theoreticalMaxMultiplier()` sees the same `ageMax`. What moved
is the SHAPE of the curve below the peak, and with it every individual price: Wembanyama
now prices at **9,009** rather than the **9,569** quoted above, and the pre-rescale
**11,646** is likewise a figure of the old anchors. Neither restatement touches the
decision. The claims this entry actually makes - that the ceiling is derived and never
hand-typed, that a rescale preserves ordering where a clamp would not, and that no real
player reaches 10,000 - all still hold at the new numbers, which is the property that
made the fix worth making rather than the specific value it produced on one afternoon.

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
"win-now" at `coreAge >= 28.5`, but this league's oldest core topped out at 28.2 - so the
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

**Amendment (post age-curve recalibration).** `coreAge` is a value-weighted mean, so the
recalibration moved it: the oldest core in the league now reads **29.2** rather than 28.2,
and two rosters sit at or above the absolute 28.5 cutoff instead of none. The 0/7/7 figure
above is therefore a reading of the old distribution. What the entry argues survives
intact and is worth restating precisely because the numbers moved: the absolute cutoff was
never wrong by a fixed amount, it was wrong by an amount that depends on a distribution
nobody controls, which is exactly why it had to be replaced by a relative one. The
relative rule still reads **4/7/3** live, unchanged.

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
(9,569) intact. *(That figure is now 9,009 - the age-curve recalibration moved every
price; see the amendment on D28. The round-trip property being verified here is
unaffected, because the URL carries ids and never values.)*

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
still renders `aria-expanded="true"` and the highlight ring at row 261. *(The value
quoted there is of the old age curve; the same rank now prices at 53. The behaviour under
test does not depend on it.)*

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
falls 71 to 61** - no richer and less coherent. *(Every figure in this paragraph is a sum
of player values and so moved with the age-curve recalibration. Re-measured: Flick the
Clint **+12,165**, The Terror Twins **+11,173**, zachgoldy **-9,382**, 6-Month Plan
**-716** on a 31,995 roster, still a wash. The three named managers, the sign of every
delta and the ordering are all unchanged, which is the more interesting result: what the
experiment reports is robust to a repricing that moved 1,479 of 1,750 players.)* `describeCounterfactual` states all of
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

**`/web` 308s to `/deals`** (`next.config.mjs`). Permanent rather than temporary because
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
above unpriced. D19: a commissioner-executed deal says so in a warn card at the top,
before any number - and since D19's second pass that card says the pick record is
**missing**, not inferred. The earlier wording described an inference the app never
made: it was gated on `hasInferredPicks`, which was computed from a flag no live code
path ever set, so on this league the card had never rendered. The replacement is gated
on a property of the source rows and does render, on the 2023 three-team deal.

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

## D49. PICK AGENCY: the pick's value is a function of WHOSE SEASON sets it, and this league's draft order is not reverse standings

Two numbers already described every future pick in this app - what it is worth
(`lib/picks.ts`, priced by the strength of the team that owes it) and when it pays
off (`lib/metrics/duration.ts`). Neither answered the question an experienced dynasty
manager asks first: **is the outcome of this pick mine to move, or am I a passenger
on somebody else's season?** Those are categorically different assets. A pick set by
your own season is an instrument; a pick set by somebody else's is a claim on a
stranger's intentions, and it is worth what THEY decide to do next.

The join was small and had been sitting in plain sight for eight rounds. Every pick
already carries its ORIGINAL roster, straight off Sleeper's traded-pick records, and
the original roster is exactly the roster whose season orders the draft the pick sits
in. Posture per roster (`leagueTimelines`) and current form (`currentFormByRoster`)
both already existed. `lib/agency` puts them beside each other and costs one array
walk over data every calling page already holds - no new requests anywhere.

**THE DRAFT ORDER HERE IS NOT REVERSE STANDINGS, AND THAT IS A MEASUREMENT, NOT A
HEDGE.** The premise "your own pick is an instrument" quietly assumes a mapping from
your record to your slot, and it would have been very easy to assume that mapping is
the identity and then build lottery odds on top of it. Sleeper's league settings
carry no draft-order rule of any kind (checked: `playoff_seed_type`, `playoff_type`,
`playoff_teams`, and nothing else touches the draft), so the only way to know is to
compare the ASSIGNED slot order against the previous season's final standings.
`draftOrderFidelity` does exactly that, and on the live league **all four completed
rookie drafts deviate from strict reverse standings, by up to four places**: in the
2026 draft a 10-10 roster took slot 2 while a 4-16 roster took slot 5, and in 2025
the roster that finished 11th of 14 took slot 1. So the app states the relationship
as a tendency, models no slot, computes no odds, and prints the measurement next to
the claim on /roster. Rejected: assuming reverse standings (contradicted by all four
drafts on record); building a lottery simulator (the mechanism is not in the data,
and inventing one is the D19 failure with better graphics).

Two smaller consequences worth stating. A pick is marked **settled** once the season
that orders its draft is over, because agency is a live quantity and nobody's
decisions move a 2026 pick any more - EZ8's own 2026 first is already spent in that
sense, whoever holds it. And the read is deliberately available for a pick the OTHER
side is sending, which is what lets the trade evaluator print "you are acquiring a
pick whose value depends on a team that is contending" rather than only pricing it.

## D50. THE BUYBACK IS A FACT WITH TWO PROVENANCES, AND NEVER AN INTENT

`pickBuybacks` detects a manager reacquiring a pick they originally owned. It is a
genuine behavioural tell - it is the one transaction that converts a manager's own
season from a result into an asset they control - and the live league contains
**fifteen recorded instances and two more the snapshot alone evidences**, including
the one the owner described from memory: 6-Month Plan reacquiring their own 2026
first from kdewitt4 on 2025-11-13, after 449 days away.

**IT SAYS WHAT HAPPENED AND REFUSES TO SAY WHY (D19).** Intent is not in this corpus.
A pick can come home as a throw-in, as the cheapest matching value in somebody else's
deal, or entirely on purpose, and nothing in the transaction log distinguishes them.
Naming a manager a tanker from a round trip and a losing streak is precisely the
inference D19 exists to refuse, and the copy on every surface stops at the round trip.

**TWO SOURCES, LABELLED DIFFERENTLY, because the record is honestly uneven.**
RECORDED round trips come from a trade transaction that names the pick, so they carry
a date, a deal to link to, and a count of the hops the pick made while away.
SNAPSHOT-ONLY round trips are visible in Sleeper's traded-picks snapshot - the pick is
back with its original roster, having arrived from somebody else - with no transaction
explaining the move, which is the D19 gap: a commissioner-executed trade always
carries `draft_picks: []`. Those are reported (the fact is real) and carry **no date
at all** rather than a guessed one, and the UI says "no transaction records this move"
in its own copy. Rejected: reporting only the recorded ones (silently drops real
history); dating the snapshot-only ones from the surrounding trades (a guess about
WHICH deal, which is exactly what D19 deleted a working engine over).

Detection reads one hop - `previousOwner !== original && newOwner === original` - and
never assumes the pick came straight back, which matters: EZ8's own 2024 first left
on 2023-10-27, moved on once more while it was away, and came home 71 days later
having changed hands three times. It also reports the same pick twice when it
genuinely came home twice, because those are two separate decisions.

## D51. THREE GOOD FEATURES NOBODY COULD FIND, and the one that was twelve cards of the same sentence

A five-member review converged, from five different lenses, on one shape: the app's
most distinctive work is also its least reachable. Three fixes, one theme.

**1. THE PROVENANCE RAIL GETS A DOOR ON THE PAGES THAT ASK THE QUESTION.**
`/lineage/[assetKey]` was rated the clearest good-and-undiscoverable case in the app:
excellent page, three doors, none guessable. A link repeated thirty-one times on
`/drafts`, a line on a deal receipt, and search, which was the best of the three and
found by accident. The question it answers - *how did I end up with this guy* - is one
you have while looking at a roster, so the door now sits on the asset row itself:
`ValueAssetRow` (shared by `/roster` and `/values`) carries a trailing `Route` link
with its own accessible name, `self-stretch` so it takes the row's height rather than
setting one. Measured: `/values` is **4,009px before and 4,009px after**, exactly
unchanged at 375, 390 and 430. The expanded row keeps the written "Where he came from"
link, which is where a reader learns what the glyph means, and `/roster` - which
renders the whole rail inline and until now offered no way to link to it - gains "This
chain on its own page", the one thing an in-row rail structurally cannot be.

Rejected: a labelled text link in the row (at 375px it eats the name column on the
tightest real row); a `min-h-11` icon button (+16px on every one of sixty rows).

**2. PICK AGENCY'S CARDS COLLAPSE TO GROUPS. THE SPLIT BAR AND THE PILLS DO NOT MOVE.**
The headline - a controlled-versus-passenger split bar and the posture pills under it -
is the best twelve seconds in the app and is untouched here. What followed it was one
`<details>` per live pick, and the sentence inside each one is a template: every
passenger pick on a rebuilding roster expands to the same clause with a different name
in it. Twelve widgets advertised twelve findings and held four.

`groupAgency` partitions the same reads into the picks you set yourself plus one group
per posture, states the shared clause once, and lists the picks underneath with the
thing that actually differs between them: the season, the round, the roster whose
season sets it, and the value. The group summary carries counts, value and firsts, so a
closed group earns its line. Controlled picks collapse to a single group by
construction - tension for a pick you control is a function of your own posture - and
the group key still carries the tension so a future change that breaks that assumption
splits the group rather than mixing two readings under one sentence. `/roster`:
**3,658px to 3,523px**, and the ceiling of six groups is a test.

D6 and D19 survive the regrouping, which is the only way it could ship: the group notes
state the position and never judge it, no branch says anyone is tanking, and the test
sweeps every posture in both directions to prove it.

**3. THE LEAGUE-WIDE BUYBACK VIEW LIVES ON `/deals`, NOT ON A NEW ROUTE.**
D50's round trips rendered on one dossier at a time, so seeing the pattern the owner
named from memory meant opening fourteen pages and holding the answer in his head.
`leagueBuybacks` is a regrouping and not a new derivation - it adds no fact
`pickBuybacks` had not already established - and it reports the denominator ("N round
trips, made by M of 14 rosters") for the same reason the dossier does: a total without
a denominator reads as a league habit when it may be two people's habit.

**Placement, argued rather than assumed.** It is a reading OF the trade record: every
dated round trip resolves to a receipt `/deals` already hosts, the ordering is
chronological like the index above it, and that page already carries two other
league-wide readings of the same corpus. It joins those instead of becoming a
twenty-fifth registered surface for a seventeen-row list, which leaves the drawer, the
registry and `ONWARD`'s two-steps rule untouched. Not `/managers`, which is one row per
person: a chronological list of round trips there would be a second list in a different
order on a page whose whole shape is the roster of people. The dossier keeps its own
section and now links across at `/deals#buybacks`. Section cost at rest: **306px** on a
19,307px page, with the seventeen rows behind a closed `<details>` and the four lines
that are the actual reading above it.

**THE FIXTURE GAINED A ROUND TRIP, because it had none.** The live league has
seventeen; the generated corpus had zero, which meant every surface that renders one
was untested end to end and the aggregation's corpus assertions were vacuously true.
The scripted trade is deliberately **value-neutral** - three pick-only trades, and the
pick ends where it started, so no roster's assets, values, timeline, posture or window
move by a point - and it is a three-hop return rather than a straight there-and-back,
so the "changed hands more than twice" case is in the fixture and not only in a stub.
A first attempt that paid a player for the pick flipped the viewer's own coherence in
`leagueWindows`, which is a real fixture property other tests are built on; test data
does not get to change it. A test now pins that the corpus contains a round trip at
all, so this cannot silently go vacuous again.

## D52. THE ALWAYS-VISIBLE NAVIGATION, RESTORED AS A SHORTCUT ROW RATHER THAN REVERTED

**What happened.** Two commits, twenty-six minutes apart, each green and each locally
correct, composed into a regression neither one intended. `32d86d6` deleted the Desk's
four-link destination row and stated its compensation explicitly: *"Home is a hub
again: the landing page now lists EVERY surface."* `746698b` then deleted that hub,
also correctly - three copies of one registry (Home, the drawer, `/more`) is the exact
failure the registry was built to end. But the second commit's argument only held while
the first commit's compensation was still standing, and nobody was holding both. What
shipped was an app whose always-visible navigation is a button reading "Menu", a seat
chip and a status line, with the four primaries surviving one tap deeper in the drawer
under "Go to". This is the same coordination failure the project has caught twice
before (D41's two hand-kept nav arrays, D43's `weightsAgree`); it just happened to the
navigation itself, which is the one part of the app nobody navigates *to* in order to
notice it is missing.

**The review split, and both sides were right.** A cold walk of the shipped app rated
it the single highest-confidence keep in the review: the button says a word rather than
showing six-point icon captions, the full registry is grouped and one tap away from
every screen, and `/more` behind it is a real page for no-JS and crawlers. A read
against the owner's stated bar - *easy for users to see the options and choose where
they want to go* - rated it the most serious finding: a generic button cannot satisfy
"see the options" as well as visible options can, however good the button is, and the
novel bottom navigation was replaced by the single most conventional pattern on mobile.

**Why a middle path and not a revert.** The two verdicts answer different questions -
*can a reader find things* (yes, demonstrably) and *are the options visible without an
action* (no) - so a revert would trade a real, tested improvement for the half that was
actually missing. Restoring the destination row would also undo the drawer, the worded
button, the grouped registry and the search box, none of which anyone found fault with.
So: restore ONE of the two halves that were removed, and restore the cheaper one.

**What ships.** A compact four-link shortcut row near the top of Home, one 44pt line,
rendered from the same `primary` flag the drawer's pinned "Go to" block reads, with
Home's own slot marked `aria-current="page"` rather than dropped. Home grows by 56pt
(2,329 -> 2,385 at 390x844 against the fixture), which is 2.4% of a page the density
work had already brought down by an order more than that.

**It is a SHORTCUT ROW, NOT A RETURNED INDEX, and the distinction is the whole
decision.** The second commit was right that Home should not be a third printing of
the registry; `homeNext()`'s three situational steps beat a twenty-four-item grid, and
they stay. Four links is not an index, it is the answer to "what are the main things
here", which is the question a first-time leaguemate has and the one the Menu button
answers only after a tap. `e2e/nav.spec.ts` pins the property rather than the
arrangement - whatever `primarySurfaces()` returns is reachable from Home at rest, and
the row holds exactly that many links and no more - because this regression was a
property of two commits held together and only a browser can assert one.

Rejected: restoring the Desk's destination row (undoes work that tested well, and
re-spends the row of chrome the Desk bought back); restoring Home's full index (the
thing the second commit correctly killed); leaving it (fails the owner's stated bar,
and leaves the first commit's own stated compensation unpaid).

**Two fixes shipped alongside, both found in the same review.**

**The drawer's scroll region was hiding half the registry with no cue.** The window was
`min(26rem, 100dvh-16rem)`, and on every phone in the design range the flat 26rem arm
won: 416pt of an 846pt list on a screen with 588pt available, so The Lab, Methodology,
Settings and Switch team all sat under a fold that nothing on screen admitted existed.
The cap bought nothing the viewport arm was not already buying. It is gone, leaving the
honest arithmetic (the screen, minus the resting sheet, minus the pinned block, minus
the home indicator, minus a gap wide enough that the page behind still reads as a
page): 416 -> 588pt at 390x844, 676pt at 430x932, and on a tall screen the whole
registry with no scroll at all. What is still below the fold now says so - a "More
below" cue that measures the element rather than counting items, driven by the scroll
event and the drawer's own open animation finishing, never by an effect keyed on the
open state (that is the cascading-render pattern the lint rule rejects). It clears the
moment the list is read to the end, which is the half that makes it information rather
than decoration.

**The capture count was a counter that could only go up.** The Desk's status line read
"29 to capture · 0/29 annotated", on the bottom of every screen, in the accent colour,
on every visit. Both halves were true and the pair was anti-informative: the
denominator is every notable decision the seat has ever made, a dynasty seat
accumulates those forever, and a two-season-old waiver claim has no reasoning left to
capture because the moment of conviction is gone. A figure that cannot reach zero
through ordinary use is not a status, it is a standing accusation, and D40 already
established that this app does not print an anti-informative number merely because it
is true. So the line now counts `recentUnannotated` - uncaptured notable decisions
inside a rolling 30-day window (`RECENT_CAPTURE_DAYS`, lib/ledger.ts) - and reads "1
new decision to capture" or "4 new decisions to capture". It reaches zero the week you
catch up and stays there until you trade again, at which point the row falls through to
its existing record line, which was always the goal state (rule 2 in lib/desk.ts).
The ratio came out with it: "0/29 annotated" beside "29 to capture" was the same fact
twice in one 44pt row, and the half of it that was a score.

Thirty days is deliberately not a season or a league phase: `currentLeague.status`
carries four values against six real modes of a dynasty year, so a window keyed to it
would change shape on boundaries the reader cannot see. The full backlog did not go
anywhere - `/ledger` leads with it and Home's badge still offers it. It simply stopped
following the reader around. Rejected: a fixed count threshold (this league is at 29,
so any threshold small enough to be meaningful is one the app is permanently above);
a dismissable state (a to-do you can silence is a to-do the app has stopped believing
in).
## D53. THE DESK DROPS ITS DESTINATION ROW, and the compensation it was traded for was deleted twenty-six minutes later

Round 8b replaced the Desk's four fixed destination links with one full-bleed button
reading "Menu / Every page in Parquet, and search." The resting sheet is now a 19pt
handle, a 44pt context row, and that 53pt button. **The four destinations were not
deleted**: they are pinned as the FIRST thing inside the drawer under a "Go to"
heading, a thumb's width above the button that opens them, rendered off the same
`primary` flag in `lib/nav.ts` that used to draw the row. The brief was to find out
whether the app can live on summoned menus alone, and the argument for it is real - a
button that says a word teaches more than six 6pt icon captions, and it spends one row
instead of one row per destination.

**THE PART THAT WAS NOT DECIDED IS THE PART WORTH RECORDING.** `32d86d6` deleted the
row and named its compensation explicitly: "Home is a hub again: the landing page now
lists EVERY surface." **Twenty-six minutes later `746698b` deleted that hub** ("Home
is a landing page again, not a third copy of the index"). Two locally-defensible
changes, each assuming the other's output would survive, which composed into removing
both halves - the same coordination failure D41 and D43 record, arriving this time at
the navigation. Nobody chose the end state; it fell out of the order the commits
landed in.

**WHAT THIS ENTRY DOES NOT CLAIM.** It does not claim the end state is wrong. A
reviewer who walked the app cold at 375px never got lost and rated the drawer the
highest-confidence keep in their review; one tap to a grouped index of everything, on
every screen, is a defensible discoverability story and arguably a better one than
four tabs that show four options and hide twenty. It also does not claim the end state
was approved. **The owner has not said which reading of "easy to see the options and
choose" he meant** - can a user find them, or are they visible without an action - and
until he does, this entry records a shipped change with an open question attached
rather than a settled decision. Cheapest middle path if the answer is the second one:
put the four primaries back on Home as a compact row, restoring one of the two halves
without undoing the Desk work.

Consequence already fixed: `lib/nav.ts` and `lib/nav.test.ts` spent a round describing
`primary` as "THE DESTINATION ROW" and pinning "the left-to-right order of the
destination row" - a test whose data was right and whose stated reason named deleted
UI. Both now describe the drawer's pinned "Go to" row, which is what renders.

## D54. THE START LINE ships unregistered, because a surface about tonight is wrong for most of the calendar

`/lab/startline` is an in-season lineup surface: a seven-day nightly board with
back-to-backs marked, a pick-one-player ten-game log, the week's slot state, and a
framing card explaining that the page will not recommend anybody. It is deliberately
**not** in `ALL_SURFACES` (D42), so it is reachable only from `/lab`, and its own copy
opens by conceding the thing that makes it different: "the rows are in name order
inside each night, because any other order would be a ranking and this page does not
rank."

**IT REFUSES TO PROJECT AND IT REFUSES TO RANK, which leaves it thin.** No projection,
no ranking, no live scores - so the board is strictly less useful than the Sleeper tab
the manager already has open, and the honest reading is that the correct conclusion
from "any order would be a ranking" was not to render an unranked list but to not
render the list. The page is ~1,786 lines, 5,080px at 375px, and roughly 73% caveat by
prose word count. **Out of season - which this league is for most of the year - it is
structurally wrong**: it promises "every other page in Parquet is the same when you
come back, this one is not" and then reports 0 slots left, 0 player-games left, and
about seventy rows reading "played".

**THE ONE THING ON IT THAT IS NOT REPLACEABLE IS SLOT PAR** - the distribution of
every lineup slot every manager in this league has ever banked, 2,124 scoring slots
across 322 team-weeks. It tells a manager what a slot has been WORTH here, from data
no public source holds, projecting nothing, and it works year-round because it is
history.

**KNOWN RISK, STATED RATHER THAN DISCOVERED LATER.** This is the only feature in the
app depending on undocumented Sleeper endpoints, across two different hosts; `load.ts`,
which orchestrates the fetches, the week clamping and the live/not-live branch, has no
tests; it has no e2e coverage by construction, because unregistered surfaces are not
in the generated smoke suite; and it fails soft in three empty catch blocks, so a
Sleeper shape change presents as a quietly emptier page rather than an error. Anyone
reviving or extending this should fix that before adding to it.

## D55. THE AGE CURVE STOPS BEING TYPED AND STARTS BEING MEASURED

`DERIVED_AGE_CURVE` (`lib/valuation/ageCurve.ts`) is fitted over **4,587 reconstructed
player-seasons scored under this league's own settings**, and it feeds
`lib/valuation/config.ts` - therefore every number the app prints. It replaced
hand-typed anchors and repriced **1,479 of 1,750 assets**. It is the most consequential
change of the wave, and until this entry it was the least documented.

**WHAT MAKES IT A MEASUREMENT AND NOT A BETTER GUESS.** `theoreticalMaxMultiplier`
derives its own ceiling from the fitted curve rather than carrying a hardcoded cap;
`firstCliffAge` is read off the curve rather than typed; and `AGE_CURVE_PROVENANCE` is
a first-class exported object, so a surface that prints an age-adjusted number can say
where the adjustment came from instead of asserting it.

**RECALIBRATION IS A HAZARD CLASS, NOT AN EVENT, and this is where that was learned.**
Moving the curve moved the whole value distribution, which broke every absolute literal
sitting on that scale - the clearest casualty being `tierOf`'s six hardcoded thresholds,
which put Sengun and Doncic in one tier on a trade receipt and another on `/values` on
the same afternoon, with 126 of 1,745 players disagreeing and nothing throwing (deleted;
see SHELVED S5). Two more stale literals survived that sweep and are fixed alongside
this entry: `lib/roster.ts` still asserted core ages top out at 28.2 when the live
distribution now runs to 29.2 with two rosters clearing the 28.5 cutoff, and
`lib/tradefinder`'s `STAR_VALUE` still claimed alignment with a trade-evaluator
threshold that had become `leagueTierLabel`, with 3,000 now falling in a gap between
two tiers. **The standing rule this produces: an absolute threshold on a rescalable
scale is a defect on sight, and any that must exist carries a re-check against the
distribution, not a comment asserting it is fine.**

What the curve refuses to claim: that it says anything about how THIS league prices
age. It measures production decline across 4,587 player-seasons. Whether this league's
market charges the same is a separate question, and it is D56's.

## D56. THE EXIT WINDOW: the app measures what it cannot answer, and publishes the refusal

`lib/valuation/exitWindow.ts` asks whether this league's own market prices age the way
the measured production curve says it should. It compares the derived curve against
what the league actually paid, using 110 usable in-league acquisitions drawn from 91
trades, bucketed by the player's age at the time of the trade.

**THE MARKET SIDE IS PRICED AGE-BLIND, WHICH IS THE WHOLE DESIGN.** Pricing the
acquisitions with the ordinary config would have made the answer an echo of the model
under test. `ageBlindConfig` flattens `VALUATION_CONFIG.ageAnchors` - which really are
`DERIVED_AGE_CURVE.map(...)`, so flattening genuinely removes the age term rather than
silently doing nothing - and the comparison is only meaningful because of it.

**THE ANSWER IS THAT THERE IS NO ANSWER, AND THAT IS THE FEATURE.** Every age bucket
fails the sufficiency bar. Nothing in the model is calibrated against this table, and
`/methodology` says so in as many words: one half of the section rests on 4,587
player-seasons and the other on 110, and only the first half is allowed to move a
price. A competitor would not publish a negative result; the negative result is the
only thing here that needs both halves and is the reason the module survives despite
feeding nothing.

**THE BAR THE REFUSAL RESTS ON WAS ARITHMETICALLY UNREACHABLE, AND THIS IS THE
AMENDMENT.** It shipped as `minAcquisitions: 12` with `maxConcentration: 0.05`, and
concentration is `max(returned) / sum(returned)`, which has a hard floor of `1/n`. At
n = 12 the best achievable concentration is 0.0833, so the pair was unsatisfiable for
every n from 12 to 19 regardless of what the league did - while the docstring claimed
"this is a deliberately falsifiable bar" and "nothing here is hardcoded to no". The
conclusion was right and the stated reason for confidence in it was false, which on
this app's premise is the worse of the two failures. `minAcquisitions` is now
`20 = ceil(1 / maxConcentration)`, so `maxConcentration` binds everywhere and the claim
is true, and a test pins the relationship between the two constants rather than either
literal so retuning one moves the other. **A refusal that is really unconditional has
to say so; this one is now conditional in fact and not only in wording.**

## D57. THE WINDOW MAP: an ordering that was drawn on a calendar, and the labels that now say so

`lib/metrics/window.ts` reads each roster's **value-weighted quartiles** off asset
durations the app already publishes - open at the 25th percentile of value arrived,
peak at the 50th, close at the 75th - and `components/WindowMap.tsx` draws all fourteen
on one axis with the viewer's own marked. Nothing new is modelled and no growth is
assumed. Quartiles rather than mean plus sigma, deliberately: a straddled roster's
value sits in two lumps, and centre-plus-spread would print a confident window centred
on the hole between them. A roster below the coherence floor gets `state: "split"` and
is drawn as two ends with no filled span, because the claim being withheld is that any
season in between is theirs.

**THE ARITHMETIC IS SOUND AND THE CALENDAR AXIS WAS THE UNEARNED PART.** Duration is
Macaulay duration over the age curve's payout profile, and every rostered player in a
dynasty league is between about 19 and 32 - so all fourteen rosters' quartiles land
inside a band a few seasons wide, and picks push the whole distribution rightward
together. Live, today: **no roster's span opens before 2029, twelve of fourteen close
in 2031, nine of fourteen peak in 2031, and "shares your window" fires on nine of
thirteen counterparties.** A signal that fires on 69% of the league is not singling
anybody out. Worse, the calendar framing invited a claim the derivation never made:
duration says when an asset pays out over its remaining career, a competitive window is
when a roster is good enough to win now, and the chart was silently equating them - so
a roster was being told its value arrives in 2029 and 2030 in a way a manager could
falsify by glancing at the standings.

**THE FIX IS THE LABELS, NOT THE MATH, and that boundary is deliberate.** The seasons
are now framed as a relative ordering inside a compressed band: the board caption reads
"who pays off before you" rather than "when everyone pays off", the chart's own
framing sentence states that the spans sit close together and that overlapping is the
ordinary case, `windowSynthesis` leads with the ordering and says plainly that the
useful reading is who is dated before you and who after rather than the season itself,
and `windowThesis` says "dated together" and "dated entirely before yours" instead of
"competing for the same seasons". No constant, quantile or threshold in
`lib/metrics/window.ts` moved. **What was wrong was never the number; it was a frame
that made the number sound like a forecast.**

**WHAT IT STILL REFUSES.** It infers no intent - a roster whose value peaked before
yours opens is a roster whose value peaked earlier, not a seller (D19). It grades
nobody (D6). It declines to place a split roster at all rather than averaging two
lumps into a false middle. And it now declines to imply that a named season is a
prediction. The version that would make the overlap count discriminate - anchoring the
axis to startable value now versus startable value in season n, which RFI's lineup
re-solve already knows how to compute - is a real build and is not attempted here.
## D58. THE TWO PROUDEST PAGES WERE THE TWO LONGEST: an index that printed its receipts, and a form that asked twenty-nine questions at once

Measured at 390px against the live league, before: **`/deals` 17,499px, `/ledger`
10,047px**. The app's median page is around 2,100px. Nothing was broken on either one -
they are two of the best-built features here - and that is exactly what made this the
largest usability win available rather than a bug.

**`/deals` was printing every deal TWICE.** A trade has two sides and the index gave
each side its own full prose sentence, mirrored: "The Terror Twins acquired ... for Nic
Claxton and the 2026 2nd", then the same deal again from the other chair. Ninety-one
deals, 182 paragraphs. The sentences were not wrong; they were in the wrong place.
`/deals/[transactionId]` already prints them - with what each side is worth today, the
D19 caveats, and every asset linked into its provenance rail - and it does it better
than a list can. So a row is now one tap target carrying the three things you scan an
index for: who traded with whom, when, and how big (`dealPieces`, a count of players
and picks). The two directories underneath, pairings and managers, are `<details>`:
they are doors INTO a filtered index, not reading matter, and expanded they were
another ~3,000px sitting under a list you had already finished with.

**A count and never a name, for the piece summary.** Naming a deal's "headline asset"
means ranking its pieces, and ranking the pieces of a trade is one short step from
scoring it, which D6 refuses. "3 players, 2 picks" says how much weight a deal carried
without saying who won it. A commissioner-executed deal reports zero picks and keeps
its existing "no pick record" tag, so the number never implies the deal was
players-only (D19).

**`/ledger` opened all twenty-nine of its textareas simultaneously.** Every notable
decision rendered as a ~340px card with the editor already expanded, the same
placeholder in each, five posture chips and a Save button. The Desk badge and the Home
banner both promise a single next action; the page they lead to was a twenty-nine
question exam that opened on question one. Worse, every one of those cards set
`autoFocus`, so the browser silently handed the caret to whichever mounted last - the
OLDEST decision on the page, and the one whose reasoning nobody can still reconstruct.

Now: ONE pinned card for the newest uncaptured decision (`newestToCapture`), and
everything else - uncaptured and captured alike - is a tappable summary row that
expands into the identical editor. Newest rather than oldest is the whole argument of
the feature: reasoning decays from the moment the trade clears, so the freshest
uncaptured decision is the one whose why is still recoverable. Capturing your latest
undocumented decision is now zero taps, where it used to be a scroll past twenty-eight
open forms.

**Why the receipt and the pinned card rather than the alternatives.** Paginating
`/deals` was rejected: the index's job is to let you see the shape of a league's trading
history, and "91 deals over five seasons" is most of that shape. Defaulting the season
filter to the current season was rejected for the same reason and a worse one - it
hides rows without saying so. On the ledger, a "dismiss" or "not notable" control was
rejected as out of scope for a density pass; it is a real gap (a leaguemate genuinely
has waiver claims with no reasoning worth recording) and it is a feature decision, not
a layout one.

**Reused, not invented.** The row-that-expands is `PickAgencyPanel`'s pattern verbatim:
native `<details>`, no client JavaScript to open one, find-in-page still reaches the
text inside a shut row, and a `<summary>` that states its own count so nothing hides
behind a label that will not admit what is in it (D46). The one new thing is the shared
`.disclosure-*` reveal in app/interaction.css, which is the Desk drawer's argument
again: a closed `<details>` is `display: none` and no height transition escapes that,
so the motion goes on the content arriving - `--motion-base` for the body,
`--motion-fast` for the chevron, transform and opacity only, and under
`prefers-reduced-motion` reduced to a fade rather than removed.

**NOTHING WAS DROPPED TO GET SHORT, and that is the part with tests on it.** A collapse
and a deletion look identical in a screenshot and identical in a height measurement, so
`e2e/density.spec.ts` asserts counts and reachability instead: the deal index renders
exactly as many rows as the page's own "Deals on record" figure claims, every one with
a distinct `/deals/...` href, and one of them really lands on a receipt; the ledger
opens exactly one editor, the pinned one is genuinely the newest by (season, week)
against the top folded row, and a folded row still opens into a textarea and a Save
button. `core-flow.spec.ts` grew the same pair of assertions the audit-log half already
had - the seeded reasoning is ATTACHED while its row is shut, then VISIBLE once it is
opened - because captured reasoning is the one genuinely irreplaceable thing in this
app and it quietly ceasing to render would be data loss wearing a layout change's
clothes.

After, same viewport and same league: **`/deals` 4,849px (a 72% cut), `/ledger` 2,270px
(a 77% cut)**. Both are now under the app's own median. Checked at 375, 390 and 430 with
no horizontal overflow, in all three themes.
## D59. SHELVING IS A WRITTEN ACT, AND `SHELVED.md` IS WHERE IT IS WRITTEN
A five-member committee review of every surface in the app produced 21 keeps, 14
keep-and-reintegrates, and a short shelve list. This entry records executing the shelve
list; **the arguments live in `SHELVED.md` and are not repeated here.** That split is
the decision: `DECISIONS.md` answers "why is the app like this", and a reader six months
from now asking "why is this *not* in the app, and what would bring it back" was
previously asking a question nothing in the repository answered. Git history holds the
code and none of the reasoning; a changelog holds the event and none of the condition.
So every shelved thing gets an entry naming what it was, why it went, and the specific
condition that would revive it — a condition a future round can *check* instead of
re-arguing.

**What came out of the live app.** `/lab/startline`'s nightly board and ten-game log
(1,786 lines, four of five reviewers, no e2e by construction and no tests on the file
that did the fetching); Home's "Since your last visit" panel; `/drafts`' "Around the
league"; `windowForRoster()`; `lib/providers/stats/`. `tierOf()` was already gone
(`c997ae3`) and is recorded alongside them because it is the canonical instance of the
failure this file exists to prevent.

**NOTHING WAS SHELVED WHOLE WHERE ONLY A PART HAD FAILED.** Two of the five are splits,
and both splits were the point:

- **Slot par survives the start line.** The board needed a live week and this league is
  out of season most of the year; the distribution of every slot every manager ever
  banked is history and reads the same in August. It moved to `lib/lab/regret/slotPar.ts`
  and renders on `/lab/regret` **at zero additional request cost** — `loadLockInWeek`
  already returns all fourteen rosters and the ledger was discarding thirteen of them.
  Verified live on 2025: 2,124 scoring slots across 322 team-weeks, median 26, p90 36.
- **The digest's derivation survives its panel.** `lib/digest/` is untouched and
  `components/DigestBeacon.tsx` renders nothing while still advancing the last-seen
  marker. The panel's defect was that it burned its own baseline on first view; freezing
  the marker as well would have turned `homeNext()`'s "did anything move" into "yes,
  always" and left a revived panel with no history to diff. Shelving a surface must not
  silently degrade a different feature.

**One thing on the list was kept.** `/awards` "Left On The Bench" was proposed by one
reviewer at their own stated low confidence, called a coin flip, and explicitly offered
for overrule; a second reviewer looked at `/awards` and said keep the set. A coin flip is
not a verdict, and permanent removal is the wrong way to settle one — the award states
its own limit in the sentence under its title, which is the behaviour the rest of this
app is praised for. It is recorded in `SHELVED.md` under "Considered, and deliberately
not shelved", so the argument is not lost and the next round knows it was heard.

**Dead code created by a shelve is part of the shelve.** Removing the board orphaned
`loadSeasonSchedule()` (and with it a whole undocumented Sleeper endpoint on a second
host), `sleeperMatchupUrl()` and `LocalTime`. All three went, each with a note where it
stood. A zero-caller function that outlives its only caller is S4's exact failure mode,
and leaving three behind while shelving one for it would have been incoherent.

## D60. THE MOTION SYSTEM WAS SHIPPED AND NEVER DEPLOYED, AND EVERY DISCLOSURE OPENED WITHOUT CLOSING
D-whatever's ancestor entry created `--motion-fast/base/slow` and one `--ease-out` curve
and argued, correctly, that the app had three motion systems. It then applied the fix to
exactly one file. A committee pass over interaction found the tokens still governed
almost nothing: **122 `transition-*` utilities across `components/` and `app/` carried no
`duration-*` or `ease-*` class**, so every one of them was still running Tailwind's own
150ms and its own `cubic-bezier(0.4, 0, 0.2, 1)`. The third system the tokens were
written to delete was the one the app was actually using, everywhere, on every page.

**The fix is two lines, not 122 edits.** `--default-transition-duration` and
`--default-transition-timing-function` in `@theme` now point at `--motion-fast` and
`--ease-out`, which is the pair Tailwind reads for the bare `transition-*` shorthand. One
change and all 122 call sites join the vocabulary, and they cannot fall back out of it
one component at a time the way 122 hand-written class lists would. It is the same
argument the press-feedback block makes for one global `:where()` rule over 140 component
edits, and it is the reason that block was right. Audited before it landed: exactly one
place in the codebase overrides a duration (`ValuesList`'s deliberately slow 700ms
just-arrived highlight), it still wins on the cascade, and nothing anywhere was relying
on Tailwind's default values.

**Disclosure motion reached 2 of 11 `<details>`.** `.disclosure-body` and
`.disclosure-chevron` were used on the ledger's rows and the deal index's directories and
nowhere else, including in `components/ui.tsx`'s shared `Disclosure` primitive, which is
the one every other page reaches for. The consequence was not only that nine disclosures
opened with no motion; it was that the reduced-motion override in `interaction.css` names
`.disclosure-chevron`, so nine chevrons rotating on a bare `transition-transform` were
**silently outside the reduced-motion contract**. A contract honoured at two of eleven
sites is not a contract. All eleven are wired now, there are zero bare
`transition-transform` classes left in the app, and the count is checkable: every
`<details>` on every page has exactly one `.disclosure-body`.

**And then the harder half: everything opened and nothing closed.** The drawer animated
in over 180ms and then `hidden` removed it in one frame; every `<details>` did the same.
Opening was a considered gesture, dismissing was a snap, and that asymmetry was most of
why a well-tokened app still read as mechanical.

For `<details>` the answer is `::details-content`, which did not exist when the original
block was written: it makes the content slot a real styleable box in BOTH states, so one
declaration covers the open and the close and they cannot drift apart. **This animates
`block-size`, which this app's motion header bans**, and the exception is recorded rather
than smuggled: that ban assumed the alternatives were a transform or nothing, and there
is no compositor-only way to make a box that is about to be `display: none` recede. The
honest choice was a bounded height transition or a permanent snap. It is one property,
one curve, one token of time, on bodies that are a paragraph and a short list, gated
behind `@supports selector()` so browsers without the pseudo keep the old open-only
keyframe unchanged - strictly no worse, never a degradation. `overflow: clip` with a 3px
clip margin rather than `hidden`, because a flush clip would have shaved the 2px-offset
focus ring off any control at the edge of a disclosure body, which is a real regression
in the ledger's annotation form.

For the Desk drawer, a closing drawer is a **third state**, not the absence of the open
one, so it is a field rather than a transition inferred between renders (which would be
the `useEffect`-that-only-calls-setState pattern this repo lints against, and which the
drawer's own open state is deliberately shaped to avoid). It is set only by deliberate
dismissal - the close button, Escape, the scrim, the handle, the flick down - and never
by navigation, because animating a drawer out over a page that has already changed is
motion describing something that did not happen. `inert` goes back on immediately and
`hidden` waits for the animation, so the drawer stops being reachable the instant it is
dismissed and only then plays itself out; focus returns to the handle at the start of the
exit, not the end of it, since by then there is nothing inside left to hold it. The scrim
loses `pointer-events` on the way out for the same reason.

Under `prefers-reduced-motion` all of it reduces rather than disappears, which is the
existing house rule and now applies at eleven disclosure sites instead of two: the size
change goes and opacity carries the whole gesture at `--motion-fast`, still in both
directions, which is the property this pass exists to add.

**The worst tap target in the app is fixed.** `/awards`' expandable subtitle was a `py-1`
summary on a 12px line - roughly a 20px strip, the only control in Parquet sitting inline
in a running sentence, and short of `min-h-11` it was also outside the press-feedback
selector's own stated convention, so a miss and a hit looked identical. It is 44px and
explicitly `min-h-11` now. A one-line subtitle reserves 24px it did not before; that is
the cost of the target being hittable at all, and the awards whose subtitle is a single
sentence never enter that branch and pay none of it.

Verified at 375, 390 and 430 with no horizontal overflow, with and without
`prefers-reduced-motion`, and with the drawer's full open/close cycle driven for real
rather than asserted from the stylesheet.

---

## D61. A CONTRAST RATIO IS A PROPERTY OF A PAIR, AND POSTURE IS NOT A GRADE

Two defects, one shape. Both are cases of a value that was measured once, against one
partner, and then used everywhere.

**`--color-faint` was measured against the wrong ground.** The token file recorded it at
3.7:1 and that number was true - against `--color-bg`. Almost nothing in this app sits on
`--color-bg`; text sits on cards. On `--color-surface` the shipped `#656c78` measured
**3.36:1**, on `--color-surface-2` **2.98:1**, and on the `/deals` accent wash **2.44:1**.
Roughly 260 call sites across six routes inherited one authoring-time mistake, and every
one of them failed SC 1.4.3. `--color-secondary` had the same crack, smaller: it passed
on `--color-surface` and measured 4.03:1 on `--color-elevated`.

The fix is a raised token **plus a ground-scoped restatement**, because one value cannot
do it. `faint` has to clear 4.5:1 on the accent wash and stay recessive under
`secondary`, and on the dark theme those two demands cross. So the ground restates the
token: `.bg-surface-2`, `.bg-elevated` and `.bg-accent-wash` declare their own
`--color-faint`, `.bg-bg` and `.bg-surface` declare the base back, and custom-property
inheritance resolves nesting on its own. A component still writes `text-faint` and gets a
measured pair either way. Dark: **3.36 -> 4.71** on surface, **2.44 -> 4.59** on the wash.
Paper needed the lift only on its two darkest grounds (4.30 -> 4.64 on elevated). The
contrast theme already passed on every ground and is left alone, with an explicit rule so
the dark theme's values cannot leak into it. Verified live: 12 routes x 3 themes x
375/390/430 now report zero rendered text below 4.5:1.

Not fixed, and named so the next round does not have to rediscover it: the token's own
comment reserves `faint` for "chrome ONLY, never a number", and ~130 call sites set real
prose and real figures in it. Raising the token makes those legible. Moving them onto
`text-secondary` is a pass over call sites, not a token edit.

**Posture was wearing a verdict.** Six copies of the same map had grown across the app,
each spelling a roster's posture as a semantic tone: `straddling: "negative"`,
`ascending: "positive"`, `contending: "accent"`. `--color-negative` is this app's pass/fail
token - it is the colour of a number below zero, of an injury, of an armed destructive
button - so a straddling roster was being handed a red pill on a page whose entire thesis
is that it issues no grades. D6 says the app states theses, not verdicts, and a reader
takes the grade off the colour in half a second and never reaches the sentence underneath
that refuses to give one. `contending: "accent"` was a second, quieter error: gold means
"you" everywhere else here, and a category unrelated to the viewer was spending it.

`components/PostureTag.tsx` replaces all six maps. Every posture renders in the already
measured neutral tone and the distinction is carried by a **glyph** - circle, triangle,
square, diamond, hexagon - beside the word, which was always printed anyway. Pure
geometry, because no reader takes a square as worse than a triangle. It survives every
form of colour blindness and the paper theme for free and adds no token to measure.
`fragilityTone()` deliberately keeps its `negative`: it fires only where a brittle roster
is actually a threat to the plan its owner chose, which is a conditioned alarm about a
specific risk, not a grade on a category.

**Two more of the same family, fixed here.** The contrast theme's `--color-warn`
(`#ffd07a`) and `--color-accent` (`#ffd27a`) were dE76 **1.3** apart - the same colour,
in the theme built for readers who need separation most. Warn moves off gold entirely to
`#ff9d3d`, dE76 **30.4** from the accent and 52.8 from negative. And `toneClasses` in
`components/ui.tsx` still shipped `bg-positive/12 text-positive` for four of its six
tones: a colour tinting its own ground at 12% alpha, whose effective background depends
on whatever is painted behind the pill, which is why an earlier round recorded these as
"unfixable". They now use opaque washes composited once in the token file, the same fix
`accent` already had. Every pair is a real number in all three themes; worst is negative
on its own wash at 4.66:1.

`DistributionStrip` also stopped giving the viewer's own tick to the diverging ramp in
signed mode. Accent means "you", and the one chart where "you" matters most was the only
place that spent it on sign - which the tick's position and every other tick's fill
already carry twice over.
## D62. ONE MARK EVERYWHERE, ONE HEADER EVERYWHERE
The same committee review that produced D59 found the app is coherent at the token layer
and weakly branded at the surface layer: a user could not describe the brand, because the
two things carrying it visually barely appeared. Two defects, one cause.

**The mark was on one route out of twenty-five, and it was not a token citizen.**
`components/Brand.tsx`'s `Wordmark` was imported by `app/page.tsx` and nowhere else, so
deep-linking into `/lineage` landed on a page that never said Parquet. Worse, it was
frozen at three hardcoded hexes that had drifted out of the palette: the tile filled
`#131519`, a surface value that no longer exists (`--color-surface` is `#16181d`), so the
logo was subtly darker than every card beside it; and its gradient ran `#f0c268` to
`#c9922f`, a third gold matching neither `--color-accent` (`#e6b34d`) nor
`--color-accent-text` (`#edc167`). On the paper theme it was a dark tile in a warm-white
page - a logo that had opted out of the theme system the rest of the app is built on.

The mark now fills `var(--color-surface)` and runs `var(--color-accent-text)` into
`var(--color-accent)`, the same two golds this app already splits by job. Verified
resolved in all three themes rather than assumed: tile `#16181d` / `#fffefb` / `#14161b`,
stops `#edc167`->`#e6b34d` / `#6d4d0b`->`#7a5810` / `#ffdb94`->`#ffd27a`. `var()` goes
through `style` rather than a presentation attribute, which is the weakest cascade level
and unreliable for `stop-color` across engines.

**WHERE IT WENT IS THE DECISION, AND IT COST NO PIXELS.** The Desk is the one piece of
chrome on every route, and it is already 116pt of a phone screen that two rounds of
density work have been defending. So the mark did not get a row, a bar, or a slot in the
44pt context row where it would have stolen width from a truncating status line. It
replaced the `LayoutGrid` glyph inside the menu button, at the identical 18pt, with the
line under it already reading "Every page in Parquet, and search" as its caption. A
generic grid icon carried no information the word "Menu" beside it was not already
carrying. Twenty-five routes gained the mark and the Desk's height arithmetic is
untouched.

**Seventeen routes hand-rolled a page header that already existed as a component.**
`PageHeader` was exact and correct; being copy-pasted instead of imported, it had drifted
into four h1 leadings (`tight` / `[1.1]` / `[1.12]` / `[1.15]`), three bottom margins
(`mb-3` / `mb-2.5` / `mb-2`), a gold kicker class string retyped verbatim in twelve files,
and one `text-[26px]` h1 that had left the six-step scale entirely. Sixteen of the
seventeen are page headers and all sixteen now import the component.

**THE RULE WAS TO EXTEND THE COMPONENT, NEVER TO LEAVE ONE ROUTE HAND-ROLLED**, because a
route kept out "just this once" is how the pattern forks a third way. Five props absorbed
every structural shape the seventeen actually needed: `leading` (an avatar or crest left
of the block), `kickerAction` (a link on the kicker's line), `aside` (a control clearing
both rows), `children` (a meta line in the column), and `below` (a meta line spanning the
FULL width). The last two look like one prop and are not: roster's record line indented
behind a 44pt crest costs a whole extra wrapped line at 375px, which is precisely the
density D58 just bought back. Measured, not guessed - the first attempt nested it and
the line count went up on screen.

Two smaller things fell out of the same pass. The kicker deliberately does NOT truncate:
clipping "Manager dossiers" to "MANAGER DOSS..." to make room for a link is worse than
wrapping it, so the one kicker that is user data (league's own name) passes its own
truncating span instead. And `--color-accent-text` was declared twice in the paper theme,
same value, same duplicated comment - one deleted. The last surviving translucent accent
(`border-accent/50`, the dragged row on `/rank`) took the opaque-wash treatment as
`border-accent-edge`; the other three the review counted were already gone.

Checked at 375, 390 and 430 in dark, paper and contrast.

### Addendum: the creative committee's blue-sky directions, recorded and NOT built
The same review produced three speculative directions, kept here so the ideas are not
lost to a scratchpad, in the spirit of `SHELVED.md`. **None is authorized; each is
recorded with the obstacle that stopped it.** (1) Make elapsed time a shared drawing axis
and fill `ProvenanceRail`'s long empty gaps with the league's own activity as texture, so
"it sat unresolved" is a scene rather than 800px of nothing - blocked by running straight
into D58's freshly won density mandate. (2) Draw `/deals` as a persistent fourteen-node
league object where the 59 pairs that have never traded are as visible as the 46 that
have, since the holes are what a dynasty manager acts on - blocked by D3 forbidding a
chart library, so any layout is hand-rolled at 375px and every readable one implies
adjacency the data does not support (the D19 trap in visual form). (3) Give refusal a
drawn vocabulary: one deliberate mark for "not enough to say", generalizing `WindowMap`'s
dotted unfilled span, so the app's rare habit of publishing negative results becomes a
visible house style instead of prose a reader skips - blocked by the mark being one
iteration away from reading as a loading skeleton, which this app already ships.

## D63. TypeScript removed. The app is now plain JavaScript, by owner request
D2 pinned "TypeScript strict" as part of the confirmed stack. This reverses that,
deliberately: 249 `.ts`/`.tsx` files converted to `.js`/`.jsx`, `tsconfig.json` gone,
`typescript`/`tsx`/`@types/*` dropped from `package.json`, and the CI `gate` job's
Typecheck step removed (it is now "lint / test", not "typecheck / lint / test").

**Mechanical, not hand-edited.** Hand-converting 249 files invites exactly the kind of
transcription error a reviewer cannot easily catch against a diff this size. Every file
went through TypeScript's own `ts.transpileModule` (`jsx: preserve`, so JSX markup is
untouched - only TS-specific syntax is stripped: types, interfaces, generics, `as`/
`satisfies` casts, `import type`), then Prettier, to land as close to hand-written house
style as a mechanical pass reasonably can. Checked first for anything the compiler API
couldn't round-trip cleanly: no `enum`, no `namespace`, no decorators, no explicit
`.ts`/`.tsx` extensions in import specifiers anywhere in the codebase - the conversion
had no hard cases to solve.

**Config files, not just source.** `next.config.ts` / `vitest.config.ts` /
`playwright.config.ts` → `.mjs` (matching this repo's own existing convention -
`eslint.config.mjs` and `postcss.config.mjs` were already `.mjs`), not `.js`: both are
`export default` ESM and at least one tool in this chain resolves top-level config files
directly rather than through a bundler, where an extensionless relative import
(`./e2e/constants`, no `.js`) that a bundler tolerates fine can be exactly the kind of
thing a stricter loader does not - fixed defensively rather than found broken.
`tsconfig.json`'s one behavior this app actually depended on, the `@/*` path alias,
carries over verbatim in a new `jsconfig.json` (Next.js honors the identical `paths` key
there). `next-env.d.ts` deleted - pure TS ambient declarations, and it stops
regenerating on its own once there is no more `tsconfig.json` to trigger it.

**Branch protection is NOT self-repairing.** GitHub's required-status-checks list on
`main` still names the `gate` job by its OLD title, `"typecheck / lint / test"` - a
string this job no longer produces. That is not a job that fails; it is a required
check that can never report at all, which reads to GitHub as permanently pending. Every
PR after this one is unmergeable until an owner renames it in Settings -> Branches ->
main -> Require status checks (remove the old name, add `"lint / test"`). Documented in
`ci.yml` itself, beside the `e2e` job's own already-existing note about needing the same
kind of manual promotion.

**One real bug the conversion surfaced, in a test, not the app.** `e2e/density.spec.js`
started failing a `/deals` row-click assertion - reproduced directly (5 manual attempts,
console and pageerror both watched): the click landed in the gap between "SSR HTML
rendered" (`expectStableChrome`'s actual guarantee) and "React hydrated," and did
nothing there - no error, always successful once hydration had a moment to finish. The
same test passed 5/5 on the pre-conversion build, because per-request Turbopack
type-compilation overhead had been accidentally masking the same gap the whole time.
Fixed by waiting for `networkidle` before the click, not by touching the app - the
underlying race is not new, only newly visible now that dev-server responses are
faster with no TypeScript transform in the loop.

Rejected: JSDoc + `// @ts-check` (keeps a TypeScript-shaped tool in the loop, which is
what "get out of typescript" asked to leave); an AltJS compile-to-JS language for the
frontend itself (ReScript, Kotlin/JS, etc.) - explicitly considered and explicitly
declined by the owner, since none has real support for the App Router/React Server
Components this app is built on, and adopting one would be a rewrite of the rendering
layer, not a conversion of it.

## D64. THE "IT LOOKS FLAT" COMPLAINT, ANSWERED WITHOUT A SECOND ACCENT
The owner's round-9 complaint - the app "looks the same" after a session of pure
accessibility fixes - landed right after a request to "punch up the accent/color
system," and the two are not the same problem. D47/D48/D61 already spent four rounds
fighting the reflex fix for exactly this complaint (a second hue, a per-category tint,
a louder chart ramp) and measuring why each one is wrong for THIS app specifically. Re-
opening that fight was declined again here. What actually changes the "flat" verdict
without spending the one accent a second time:

**`--text-display` raised 25px -> 30px, one token, no new step.** The six-step scale
(D-something, the type-scale comment in `globals.css`) was never the defect - 25px next
to a page built almost entirely of 12/13px chrome was. The jump from `lede` (17) to the
old `display` was 1.47x; 30px widens it to 1.76x, which is the one place in the whole
scale a reader is supposed to feel a jolt, and it is a value moving, not a seventh size
appearing. Checked at 375/390/430 that Home's longest headline ("You said rebuild. You
bought win-now.") still wraps to two lines - it is written short specifically because
it sits in the biggest type on the page, so a size bump that forced a third line would
have traded the jolt for a worse wrap.

**`PageHeader`'s `<h1>` moved to `font-bold`, and ONLY the `<h1>`.** `--text-display` is
shared with `Stat`, `TradeBuilder`'s price and the counterfactual delta - hero NUMBERS,
not headlines - and those stay `font-semibold`, matching every other figure in the app
(`.figure`'s own header comment: numbers get the house data-voice, not extra weight).
A page title is the one masthead moment per screen; a number sitting in the same size
token for column alignment is not, and the two are now allowed to diverge on weight
without diverging on size.

**The grain wash raised 0.05/0.03 -> 0.09/0.05 (dark), 0.05/0.035 -> 0.08/0.05 (paper).**
DESIGN.md has claimed a "faint gold+blue radial grain" since round 1, and at the old
alphas it was true only in the sense that the pixels weren't literally `--color-bg` -
on an actual screen it read as flat black, which is the literal complaint. Same two
`rgba` stops, same `radial-gradient` geometry in `body`'s `background-image`, only the
alpha channel moves - zero new hues, so it costs nothing against the one-accent rule.
Verified against a real viewport screenshot (not a full-page one - Chromium's full-page
capture resizes the document before shooting, which stretches a `background-attachment:
fixed` gradient over the whole scroll height and hides exactly the effect being
checked): a warm cast is now visibly there behind the wordmark on first paint, still
fully hidden under every opaque card. The contrast theme's `--grain-1/2: transparent`
is untouched - "no decorative wash: it is contrast being asked for" was already the
right call and this round didn't reopen it.

**Rejected, and why, matching what the conversation had already ruled out before this
round started:** a second saturated hue anywhere in the palette (the owner's literal
ask, declined - D15's four separate votes and D47/48/61's whole existence are the
record of what happens when this app tries it); accenting the biggest number on a page
that isn't already "yours" by the app's own convention (`DistributionStrip`'s `mine`
figure sits at `text-meta` deliberately - its accent is already spent twice, on the
tick's position and the tick's own gold fill, and D61 is explicit that a third spend on
the same datum is restating, not adding); accenting `/roster`'s own total-value figure
even though `/roster` is always the viewer's own team (same restatement problem -
`WINDOW_COPY`'s `win-now` tone and the tick already carry "this is yours" for that
page; a bolder gold number under an already-gold badge is decoration, not information);
widening the spacing scale (`app`/`components` have exactly two arbitrary `mt-[Npx]`
values in the whole codebase, both 3px/7px vertical nudges with a comment already
justifying each - two rounds of density work, D58 and D62, already did this pass and
there was nothing ad-hoc left to find).

Verified: `pnpm lint` clean, `pnpm test` 985/985, axe-core clean on `/`, `/roster` and
`/league` in all three themes, before/after screenshots at 390px confirming the
headline and page titles read visibly bigger and bolder and the grain is now
perceptible on a real viewport capture.

## D65. THE DESK GROWS FIVE PERSISTENT TABS, ANSWERING D53'S OPEN QUESTION

D53 shipped the single full-bleed "Menu" button with an explicit, unresolved question
attached: did "easy to see the options and choose" mean a reader can FIND the four
primaries, or that they are VISIBLE WITHOUT AN ACTION - and it named the cheap middle
path if the answer turned out to be the second one, "put the four primaries back on
Home as a compact row." That shipped as D52's Home-only shortcut row, which held for
one round. **The owner has now answered directly: visible without an action, on every
route, matching Sleeper's own bottom bar** - and a Home-only row was never actually
that, since every other page still advertised exactly one destination.

**THE SINGLE BUTTON BECOMES FIVE TABS.** `components/Desk.jsx`'s resting sheet used to
end in one 53pt full-bleed control saying "Menu"; it now ends in a 53pt five-column
row - the same four `primarySurfaces()` (Home, Roster, Plan, Ledger) as plain links,
plus a fifth "More" tab that opens the identical drawer, unchanged focus-trap and all.
Nothing about the SHEET's mechanics moved - drag, `inert`, the modal contract, the
"more below" cue - only what sits above it at rest. The More tab lights up whenever
the current route is not one of the four primaries (not only while the drawer is
open), so exactly one tab is always lit, matching the native-app convention Sleeper
itself uses for its own catch-all tab.

**TWO NOW-REDUNDANT COPIES REMOVED, NOT LEFT TO ROT.** Home's D52 shortcut row
(`app/page.jsx`) printed the same four links the tab row now prints on every route
including Home - keeping both would have been the exact "same destination advertised
twice" failure this codebase's own comments elsewhere warn against. Deleted, along
with the imports it alone used. The drawer's pinned "Go to" block (the four slots
D53 pinned a thumb's width above the Menu button) is now the same redundancy one
level down - also deleted, which recovers real drawer height for the scrolling
registry list (the `max-h` arithmetic subtracting for it is removed too).

**WHAT THIS DOES NOT CLAIM.** It does not claim the D53 drawer was broken - a
reviewer rated it the highest-confidence keep in the app, and it is unchanged here
except for losing its now-duplicate pinned block. The claim is narrower: the OPEN
QUESTION D53 recorded is now closed, by the person who owns the answer, in the
direction that matches the app Parquet's own navigation was explicitly benchmarked
against.

Verified: `pnpm lint` clean, `pnpm test` 985/985, full e2e suite (102 specs) green
against a clean Turbopack cache, axe-core clean on every route in all three themes,
production build succeeds, before/after screenshots at 390px confirming all five tabs
render and highlight correctly on Home and on an arbitrary non-primary route.

## D66. TCI learns to name its own outlier - the Timeline Break, found leave-one-out

A full audit pass over both proprietary metrics, at the owner's request: re-derive
TCI and RFI from first principles against the real 14-roster league, looking for a
real weakness rather than a hypothetical one. RFI came back clean - see D67. TCI did
not: `coherenceOf`'s dispersion is a single value-weighted VARIANCE term, and variance
cannot distinguish "one plan, gently spread" from "two plans sharing a jersey" when
the two happen to produce the same number. It mostly gets this right by construction
(SIGMA_REF was calibrated against exactly the barbell case), but the real 14 rosters
turned up a case it does not: roster 7 ("The Terror Twins") carries a
Cunningham/Barnes/Amen-and-Ausar-Thompson core reading 4.6-4.9 seasons, worth roughly
19,000 combined, PLUS Anthony Davis alone at 2.18 seasons worth 4,277 - a real,
material disagreement with the plan. Its dispersion (1.18) did not cross
COHERENCE_FLOOR (55), so it read "ascending... assets broadly aligned" with nothing in
the paragraph naming the one piece that does not fit.

**THE FIX, MIRRORING RFI'S OWN METHOD RATHER THAN INVENTING A NEW ONE.**
`findTimelineBreak` (lib/metrics/duration.ts) is a leave-one-out search - remove each
asset, recompute `coherenceOf`, keep whichever removal raises TCI the most - the
identical technique `looDamage` already uses for lineup risk, aimed at timeline
agreement instead of startable value. `classify` now appends one sentence naming the
break asset to EVERY posture, not only "straddling", because the Anthony Davis case is
exactly the one an "ascending" label was hiding it from.

**WHY NOT A HIGHER-MOMENT STATISTIC (SKEWNESS/KURTOSIS), WHICH WAS TRIED FIRST AND
REJECTED.** Excess kurtosis is the textbook bimodality signal and it does flag real
structure on this league's data (roster 8, exKurt -0.92, genuinely platykurtic) - but
a roster here carries 15 to 32 discrete assets, and a 4th-moment estimate's standard
error at that sample size (~sqrt(24/n), roughly 1.0-1.3) is close to the whole
observed range of the statistic itself. A component this noisy would need its own
calibration constant on top of an already-unstable estimate, which is a worse
trade than the leave-one-out approach: cheap (O(n^2), the same complexity class LOO
already pays), needs no new reference constant, and - critically - NAMES A SPECIFIC
ASSET rather than reporting an abstract shape number nobody can act on.

**CALIBRATED AGAINST THE REAL LEAGUE, not asserted.** Every one of the 14 real rosters
has at least one asset whose removal improves TCI, spanning +2 to +13 points - real,
differentiated range. `BREAK_MIN_DELTA = 1` floors it above `coherenceOf`'s own 2dp
rounding noise, below the smallest genuine case observed (+2). On this league the
break is either a deep rebuild's own single longest-dated pick (a small, real
improvement) or one aging star alone against a long-dated core (a large one) - Steph
Curry, Kevin Durant, LeBron James, Joel Embiid and Giannis Antetokounmpo are the other
five named across the real 14, alongside Anthony Davis.

**WHAT IT DOES NOT CLAIM**, stated in the code the same way D6 states it for the
regret ledger: the named asset is very often the team's best player, and the honest
reading is "this is the one piece that does not match the plan," not "trade him."
Buying a year of a misaligned star on purpose is a strategy, not a mistake this metric
is accusing anyone of.

Added: `findTimelineBreak` and its `BREAK_MIN_DELTA` constant, both in
`lib/metrics/duration.ts`; `timelineBreak` on every `getTimelineProfile` result;
`classify`'s new `timelineBreak` argument and the `breakSentence` helper. Nine new
tests in `lib/metrics/metrics.test.ts`, including a pinned scale/tie-break case and an
integration check that every real roster's published `timelineBreak` matches calling
`findTimelineBreak` directly. `coherenceOf` itself is UNCHANGED - deliberately kept
pure and its existing empty-bag test (`toEqual` on an exact 4-key object) intact,
because `findTimelineBreak` calls `coherenceOf` in a loop and the two must never call
each other back.

## D67. RFI, audited and left alone - the position-blindness it already names was compensated, not hidden

The other half of D66's audit. Checked for the same class of failure against the real
league: component saturation (none - LOO/concentration/exposure scores measured 32-91,
25-83, 1-87, nothing pinned at either end), percentile/band collisions (only the ones
the ladder rounding is documented to produce, and they resolve the way the file says
they do), and the header's own stated blind spot - HHI cannot tell WHERE concentration
sits, so a roster concentrated in a deep position and one concentrated in a scarce one
score identically on that component. That blind spot is real, but it is not silent:
`W_LOO` (0.45) already outweighs `W_CONCENTRATION` (0.35) specifically because LOO's
lineup solver DOES know position (a star with a same-position backup shows small
damage; one with none shows the full hit), which is the file's own stated reason for
the weighting, not an assumption re-verified here for the first time.

**DECISION: no change to RFI.** Inventing a fix for a blind spot the file already
names and already compensates for would be exactly the failure mode D56 exists to
warn against - measuring what the data cannot support rather than admitting it. The
complementary lens this audit produced instead is D68's Positional Leverage Index,
which asks the blind spot's real question - not "how concentrated is MY roster" but
"where does the LEAGUE'S positional value actually sit, and where do I stand against
it" - as its own metric rather than a bolted-on RFI component, because it needs a
different denominator (the whole league's position pools, not one roster's lineup
solve) that does not belong inside RFI's per-roster scoring pass.

## D68. The Positional Leverage Index ships to /lab, not to /awards

The third metric the owner asked for, held to the same bar as TCI and RFI: a plain-
language question neither already answers ("where can I actually deal from, and where
am I exposed with nothing to offer back"), a formula derived and documented at the
same rigor as `fragility.ts`'s header, and a REAL calibration bug caught and fixed
before this shipped rather than asserted away.

**THE BUG.** The first version measured a roster's LEAGUE-WIDE SHARE at each position
directly (`rosterValue(X) / totalLeagueValue(X)`) as the deviation term. Measured
against the real 14 rosters, that version correlated with total roster value at
r = 0.975 - it was not a positional metric, it was a relabelled power ranking,
because a stronger roster holds more value at nearly every position simply by holding
more value overall. The fix is the same one `concentration()` in fragility.ts already
applies to HHI: divide by the roster's OWN total first (own SHARE, not league share),
which is what decouples scale from shape. Re-measured after the fix: r = 0.253 (r² =
0.064) against the same total-value figure on the same 14 rosters - not literally
zero, but nothing like restating "who is winning."

**THE FORMULA**, in full in `lib/lab/leverage/index.ts`'s own header: for each of the
five rosterable positions, `leverage(X) = (ownShare(X) - leagueSharePos(X)) *
scarcity(X)`, where `scarcity(X)` is that position's top-to-replacement value drop-off
normalised against the steepest one observed (the RFI convention: a reference just
above the worst real case, never a theoretical maximum). `LEVERAGE_REF = 0.08` sits
just past the observed -0.0707..+0.0544 range on the real league, spreading the 14
real rosters from 6 to 84 with nothing clipped and nothing bunched at 50.

**WHY /LAB AND NOT /AWARDS OR A DOSSIER PAGE**, per this app's own established bar
(D54): a new analytical claim ships reachable-but-unproven before it ships as a
headline. It is a real, computable, honestly-limited signal - but it has not been
lived with across a season the way TCI and RFI have, and D54 is the standing
counter-case for what happens when a Lab idea does NOT clear that bar later. This one
gets its own subfolder (`lib/lab/leverage/`), its own page (`app/lab/leverage/`), and
one line in `lib/lab/index.ts`'s `EXPERIMENTS` registry - nothing else in the app was
changed to accommodate it, unlike D66's TCI extension, which touches every surface
that already reads `getTimelineProfile.read`.

**WHAT IT DOES NOT MEASURE**, in full in the module header: whether any of the other
thirteen managers actually wants what a roster is overweight in (pure supply-side, no
demand signal); draft picks (unresolved position until drafted, excluded from both
sides of the ratio - a real gap TCI and RFI do not share, since both price picks);
UTIL/FLEX demand (two of seven starting slots are position-agnostic and excluded from
`baseSlots` entirely); and the future (a snapshot of today's pool, blind to a rookie
class that could reshape a position's scarcity next spring).

One small shared touch: `POS_ORDER` in `lib/roster.ts` is now exported rather than
private, so the position taxonomy this module measures against is the same five-
element array `analyzeRoster`'s own "positional strength" already uses, not a second
copy that could quietly drift from it.

## D69. THE CONTRAST THEME IS REMOVED. Light/dark is the whole preference surface, by owner request
D34 shipped a third theme - `contrast`, "High contrast" in the toggle - alongside the
committed dark identity and `light` ("Paper"). This reverses that: `THEMES` in
`lib/theme.js` drops from `["dark", "light", "contrast"]` to `["dark", "light"]`, and
every trace of the third option is deleted, not hidden. The owner's own framing is the
reason, verbatim in spirit: a second selectable *design* was one too many - "just have
one that's really good so the user never needs to switch" - while light/dark itself
stays, because it is "the standard, expected pattern" and was never the complaint.
Three toggles in a `role="radiogroup"` was the picker this app never needed; two is
the pattern every other app already trained the reader on.

**Why this is safe, not just permitted.** D34's own justification for shipping
`contrast` was that dark's `--color-faint` sat sub-AA (1,606 failures at 3.75:1) and
"brightening it everywhere would change what the app looks like," so the third theme
carried the accessibility fix instead of the default. That premise no longer holds:
D61 fixed `--color-faint` on the dark theme itself - a raised token plus the
ground-scoped restatement (`.bg-surface-2`, `.bg-elevated`, `.bg-accent-wash`) - taking
it from 2.44:1 to 4.59:1 on the wash and 3.36:1 to 4.71:1 on the surface, verified live
across 12 routes at 375/390/430. The AA remedy `contrast` existed to provide is now
built into the theme that ships to everyone by default, so removing the escape hatch
loses no accessibility guarantee - confirmed again here with a fresh `axe-scan.mjs`
pass and the committed `e2e/a11y.spec.js` color-contrast suite against both remaining
themes, zero violations.

**What was deleted, file by file.** `lib/theme.js`: `contrast` out of `THEMES`, its
entry out of `THEME_CHROME` and `THEME_META`, and the header comment's framing of
"the other two" rewritten - light is now the one reason a light/dark toggle exists in
any app, not a survivor of a three-way split. `app/globals.css`: the entire
`:root[data-theme="contrast"]` token block (surfaces, ink, the retuned semantic hues,
the `grain-1`/`grain-2: transparent` special case, the TCI ramp) and the
`:root[data-theme="contrast"] .bg-*` ground-scoped ink restatement, plus `contrast`'s
entry in the three theme-toggle selection-state selector lists (now two).
`components/ThemeToggle.jsx`: the `Contrast` icon import and its `ICON` map entry,
and `grid-cols-3` to `grid-cols-2` - `THEME_META.map` already drives the rendered
buttons and the description list, so trimming the data was the whole UI fix, exactly
as the module's own header comment about one shared vocabulary promises. `e2e/a11y.spec.js`:
the per-theme color-contrast loop drops from `["light", "contrast"]` to `["light"]`.
`.claude/skills/visual-review/`: `SKILL.md` and `shoot.mjs` updated from three themes
to two. Comments-only cleanup, no behavior change, in `components/ui.jsx`,
`components/Brand.jsx`, `lib/chart-colors.js`, and `app/interaction.css`, which
documented measured contrast ratios against a `contrast` ground that no longer exists.

**The stale-localStorage case is not hypothetical, and it already degrades correctly.**
Anyone who set `parquet:theme` to `"contrast"` before this change keeps that value in
their browser; nothing in this reversal touches their storage. `parseTheme` and the
inline boot script both gate on `THEMES.includes(...)`, so a value the array no longer
contains takes the exact same path as any other unknown string - `sepia`, a typo, a
future theme this app never ships - falling through to `DEFAULT_THEME` ("dark") rather
than leaving `<html>` in a `data-theme="contrast"` state no CSS block matches. This was
true before this change too (the reader was already written to distrust storage); D69
adds a test (`lib/theme.test.js`, "degrades a stale 'contrast' value from before D69 to
the default") pinning it, because a value this specific - one this app itself shipped
and then retired - deserved a named case rather than living only inside the generic
"anything else" assertions.

**Kept, deliberately.** The light/dark toggle itself - the owner was explicit this is
the standard pattern and stays. The one-accent-color restraint (D47/D48/D61) and the
graceful-degradation ethos - this is a subtraction of a design, not a redesign; no
token, no component, and no other preference changed. `DESIGN.md` now carries a short
factual `## Themes` section (it previously documented none), naming exactly the two
that ship and pointing at `lib/theme.js` as the single owner of the vocabulary.

Rejected: keeping `contrast` in the codebase as a dead-but-selectable option, or
quietly aliasing it to `dark` so old links or scripts referencing it "still work" -
either would keep the exact complexity ("an alternative UI you can switch to") the
owner asked to be rid of, just moved one layer down instead of actually gone.

## D70. Hashtag Basketball and dynasty community theory audited the valuation model, and it holds - one real gap named, not fixed

The owner's request: cross-check the model against real external dynasty rankings
(Hashtag Basketball, plus a second name he gave as "dizzle dynasty dynasty basketball
rankings") and against dynasty community theory, not to chase agreement on two numeric
lists but to ask whether the model is missing nuance a stats-only curve would miss -
age curves, positional scarcity, rebuild timing, pick decay.

**"DIZZLE DYNASTY" RESOLVED - IT IS REAL.** The owner's name was flagged as a likely
transcription error going in. It is not one: The Dizzle Dynasty
(dizzledynasty.substack.com, Zach Reifschneider) is a real, active dynasty-basketball
rankings newsletter, confirmed by direct search and fetch. Its prose (methodology
essays, a beginner's-guide volume) was reachable; its actual ranked player sheet is
gated behind an embedded Google Sheet this environment cannot open. Hashtag Basketball
itself (hashtagbasketball.com) is also real and confirmed to publish exactly this kind
of dynasty ranking, but returned HTTP 403 to every fetch attempt - it is not reachable
from here. Reddit is flatly unreachable: `WebFetch` refuses `reddit.com`,
`old.reddit.com`, and `web.archive.org` outright, and `WebSearch` could not surface
actual r/DynastyBasketball thread content (results kept returning fantasy
*football* material instead). Both limitations are stated here plainly rather than
worked around with invented numbers or invented opinions.

**WHAT WAS ACTUALLY REACHABLE, AND USED.** A current (Aug 2026), numeric, ranked
dynasty top-300 in the same Hashtag-Basketball-family style, syndicated via NBC
Sports/Yahoo (the search result that surfaced it: "Wemby on top, Holmgren and
Cunningham in Top 10" / "the arrival of Cooper Flagg") - real players, real ranks,
dated to this season, the numeric reference this audit actually measured against.
Qualitative community theory came from Dizzle Dynasty's own beginner's-guide prose,
plus RotoWire/Athlon/Yahoo positional-scarcity strategy writing - real, current, and
reachable, standing in for the Reddit discussion the environment blocks.

**THE METHOD.** Real Sleeper data for the actual NSL Fantasy Hoops league (not the
fixture corpus - see the note below on how close this came to being measured against
the wrong thing) was pulled live and run through `valuePlayers` unmodified. The
resulting ranking was matched by name against the external top-50 (all 50 matched)
and, for the specific question below, against a deeper five-player slice from the
external top-150.

**A REAL BUG IN THE MEASUREMENT ITSELF, CAUGHT BEFORE IT COULD PRODUCE A FALSE
FINDING.** The first pass of this audit ran `LEAGUE_PROVIDER=sleeper` as a shell
environment variable and got a clean-looking top 300 - Luka, Ja Morant, Anthony
Edwards at the top, no Victor Wembanyama anywhere in it. That absence looked like a
finding (an MVP-tier 22-year-old center missing entirely would be a real story), and
it was tempting to write it up as one. It was not real: `vitest.config.mjs`'s
`test.env` unconditionally sets `LEAGUE_PROVIDER: "fixture"` for every test run,
which overrides a shell-level env var rather than merging under it - so every run was
silently scoring the synthetic fixture corpus regardless of what the shell said. Caught
by checking `h.players.size` against a raw provider fetch (2,107 vs. 288), not by
inspection. Fixed for the purposes of this audit with a separate, uncommitted
`vitest.explore.config.mjs` pointed at the real provider - not by touching the
project's actual test config, which is correctly pinned to the fixture for every
reason its own comment gives. Re-run against the real corpus, Wembanyama was exactly
where the external ranking has him: #1.

**POSITIONAL SCARCITY: MATCHES.** `positionMultipliers` on this league's real scoring
settings (steals and blocks each weighted 2x, points 0.5x) produces C 1.049, PF 1.020,
PG 1.001, SF 0.985, SG 0.945 - centers most valuable, shooting guards least, point
guards comfortably mid-pack despite the "PG is deep" community reputation. That
ordering is exactly what the reachable community strategy writing says in its own
words: complete centers "are not sitting in the middle rounds anymore... dries up
quickly," while point guards "stay deep, meaning you can afford to wait on them." No
change warranted - the scoring-derived ordering and the community's revealed
preference already agree.

**REBUILD TIMING / AGING-VET DISCOUNT: NO CLEAN BIAS EITHER WAY.** The hypothesis
going in was that a hand-measured age curve might over-punish elite aging stars
relative to a market that still pays for durable greatness (Jokic, 31, external #4 vs.
this model's #11 was the anecdote that raised the question). Measured properly across
all 50 external-matched players it does not hold up as a *pattern*: mean rank
disagreement for the 30-and-over band is +3.6 (this model ranks them very slightly
worse), for the under-30 band it is +6.0 - not meaningfully different, and several
individual aging vets (Anthony Davis, Karl-Anthony Towns) come out ranked *better* by
this model than by the external list. One anecdote is not a pattern, and this one
didn't survive contact with the full sample.

**THE ONE REAL PATTERN: HIGH-PEDIGREE SOPHOMORES WHOSE BOX SCORE HASN'T CAUGHT UP TO
THEIR REPUTATION YET.** The under-22 band of the same 50-player comparison disagrees
by +15.25 ranks on average (n=4) - worth naming precisely rather than trusting a small
average on its own, so the whole 2025 draft class second-year cohort was pulled
individually: Cooper Flagg +3, Dylan Harper +29 (external #29, this model #58), Kon
Knueppel -11, VJ Edgecombe +29 (external #44, this model #73), Ace Bailey +60
(external #55, this model #115). Four of five run well behind the external
consensus, and the one exception (Knueppel) is the one whose second-year role has
already produced box-score numbers big enough to lift his own Sleeper search rank -
which is precisely the mechanism: `valuePlayer`'s base term is `maxValue *
exp(-rankDecay * (searchRank - 1))`, anchored to Sleeper's own real-time expert
consensus of how good a player looks RIGHT NOW, and the age curve on top of it tops
out at 1.16x even for a 19-year-old - nowhere near enough to undo a 40-60-slot gap
in `searchRank`. Dynasty theory has a name for exactly this: paying for tomorrow's
production before this year's box score shows it, the thing Dizzle Dynasty's own
beginner's-guide prose gestures at directly ("are you trying to collect players or
are you trying to win") and every rookie-premium discussion in the wider dynasty
literature assumes as a given.

**WHY THIS IS NOT GETTING A CALIBRATION CONSTANT.** TCI's break-finder and PLI's
own-share fix (D66, D68) were both real bugs in how EXISTING signals were combined -
fixable because the right signal was already sitting in the data, just weighted or
normalised wrong. This is different. `years_exp` is present on every ingested player
(confirmed: it exists on the raw feed and is threaded through `toPlayer`) and is
currently used by nothing in `lib/valuation` - grepped for and found only in test
fixtures - but adding a "still developing" bonus keyed to it would not be recovering a
signal already in the data, it would be asserting a number with no derivation behind
it, for exactly the reason `ageCurve.ts`'s own header gives for why it derives instead
of hand-typing: "a calibration constant does not need... hand-editing a measurement is
how a measurement stops being one." A defensible version of this fix would need
something Sleeper's feed does not carry at all - draft slot or draft-class pedigree
(checked directly on the raw player payload: no such field exists) - so there is no
honest way to derive a "prospect premium" the way the age curve itself was derived
from 4,587 real player-seasons. Inventing one from nothing is the identical failure
D19 deleted a whole inference engine to avoid, and the identical trap D56 and D67 both
name: measuring what the data cannot support. The age curve is already doing
everything a production-based measure honestly can here - it gives every 19-year-old
who cleared the sampling bar the single largest multiplier on the whole table - and
the gap that remains is the gap between a production curve and a market that also buys
optionality. `ageCurve.ts`'s own header already draws exactly this line for the OLD
end of the curve ("a production curve, not a market curve... it does not say when this
league's fourteen managers stop paying"); this audit's finding is that the identical
honest limit applies, symmetrically, at the YOUNG end, and the file already says so
without needing an edit.

**PICK VALUATION: DIRECTIONALLY SOUND.** This year's 1.01 (`pickValue(1, 0, {slot:
1})`) prices at 5000 - in the range of this season's real top-25-ish players by value,
which matches the common dynasty framing that an elite first is worth a genuine
rotation-caliber player, not a lottery ticket. A next year's first from a lottery-range
team prices at 2507 regardless of exactly how bad the team is (this league's
`lotteryWeighting: 0`, a separate, already-documented choice not reopened here), a
non-lottery future first at 1117-1755, and second-rounders at 145-633 - declining
trust with distance, a non-linear round drop-off, and a floor above zero. All three
match the qualitative shape of the community's own pick-value writing ("some picks are
like a new car: the second you use them, their value is already decreasing") without
needing a number changed.

**DECISION: NO CHANGE TO `lib/valuation`.** Positional scarcity and pick decay both
check out clean against the external evidence. The aging-vet-discount hypothesis this
audit went in with did not survive measurement against the full sample. The one real,
evidence-backed gap - a production-anchored model cannot price the optionality
dynasty managers pay for in a not-yet-proven high-pedigree sophomore - is real,
named, and precisely understood, but fixing it honestly would require a signal
(draft pedigree) that does not exist anywhere in the ingested data, so any numeric
patch would be an assertion wearing a formula's clothes. This is D67's own precedent
applied to a different metric: a named, real blind spot the model already discloses
the shape of (`ageCurve.ts`'s market-curve caveat), left alone rather than papered
over.

Verified: the comparison ran against live real-league data (not the fixture corpus,
after the measurement bug above was caught and fixed for this audit only), matched
all 50 external-ranked players by name, and was cross-checked against a second,
independent five-player slice (the 2025 sophomore class) before the pattern was
written down. No source code changed; `pnpm test` reports the same 1008/61 before and
after this entry.

## D71. PROVENANCE, ROUND TWO: a real hole rendering live, two blue-sky ideas reconsidered on their own merits, one still correctly blocked

D51 fixed discoverability; this round went back to the walk and the rail themselves,
against the real league (this is the third time this feature has been checked live
rather than read - D44 found three bugs this way, D51 found the doors were missing,
and this pass found one real gap and confirmed one old limitation still holds).

**THE GAP: a 3+ team trade's hop sentence has always been silently two-party, even
when the transaction was not.** `HopBody`'s sentence only ever names the two seats on
an asset's OWN end of a hop (`from`/`to`), which is the correct predecessor for the
walk regardless of party count - but this league has run exactly two trades with a
third team (verified live: a 2023 commissioner-executed reshuffle among rosters 6, 7
and 11, and a 2024 deal moving four players and three picks among rosters 3, 7 and 11),
and on both, OTHER assets moved between OTHER seats in the SAME transaction that a
two-name sentence says nothing about. Rendered live: Zach LaVine's chain
(`/lineage/p:1526`) used to read "Traded to 6-Month Plan / by The Terror Twins" for
the December 2024 hop exactly like an ordinary two-team trade - the fact that Wendell
Carter and Devin Vassell and three picks also changed hands between Terror Twins and
NSLKB in the identical transaction was invisible unless the reader already knew to
open the receipt. `buildAssetMoves` (`lib/tradegraph/index.ts`) now carries the
transaction's own `tradeParties(t).length` onto every asset it moves - players and
picks alike - through to the hop node, and `HopBody` prints "Part of a 3-team deal -
the receipt has the rest" (and updates its aria-label to match) whenever that count
exceeds two. It never names who else was involved or what they got - that is the
receipt's job, one tap away via the link the row already has - only that there is more
to this hop than the sentence above it shows. Two lines of test at the hand-built-
context level (the fixture's `recordTrade` only ever builds two-team trades, so the
integration case is asserted against a hand-built three-party transaction instead,
matching how every other multi-team-shaped test in this codebase that the fixture
cannot produce is written).

**THE OLD LIMITATION, RE-CHECKED AND STILL TRUE: no value-at-trade-time.** D45 stated
the app holds no historical ranking snapshots, so a receipt can only ever say what a
player is worth TODAY. `lib/valuation` still carries no time dimension of any kind -
checked directly rather than assumed, and correctly left alone: building one would be
a new data-capture pipeline (snapshotting the whole player universe's rank on every
transaction date, forever after), not a change to this feature, and `lib/valuation` is
under separate calibration work this same round. Still out of scope; the copy already
says so.

**THE THREE BLUE-SKY IDEAS FROM THE ADDENDUM ABOVE, RECONSIDERED ONE AT A TIME.**

**(1) Elapsed time as texture - BUILT, opt-in.** The blocked version drew league
activity into every rail's every gap, unconditionally, which is exactly the density
D58 fought to remove. The objection was never "this isn't a real reading of the data,"
it was "not unconditionally, on every row." So it is not unconditional: `chainGapActivity`
(`lib/provenance/source.ts`) computes, for a chain's SINGLE LONGEST gap only (the long
gap already IS the story - see `PER_GAP_PX`'s own docstring), how many OTHER trades,
waiver claims and free-agent signings the league recorded elsewhere during that
window, excluding the asset's own moves. It returns `null` rather than a hollow
"nothing happened" object below a 90-day floor or when the league was genuinely quiet
- a fabricated scene is worse than none. The rail draws it inside a closed
`<details>` (the same `Disclosure` idiom Awards/Methodology/the mega-pages already use
for "available, not forced on every reader"), and only the standalone `/lineage`
page computes it at all - `/roster`'s inline rail, rendering one per rostered player,
does not, so that page's cost and density are exactly unchanged. Verified live: Zach
LaVine's page now offers "What else happened during those 16 months," closed by
default.

**(2) The persistent trade-network map - BUILT, as a GRID rather than a graph.** The
objection was not laziness, it was D19 in visual form: any layout readable enough to
place fourteen names as dots on a plane implies an adjacency the trade record does not
support. A GRID does not make that claim - a cell's position encodes exactly which two
parties it represents and nothing about how "close" they are to each other or to
anyone else, which is what a matrix is for. `pairMatrix` (`lib/tradegraph/index.ts`)
orders every principal alphabetically (never by trade count, which would itself smuggle
a ranking back into a grid built to avoid implying one) and marks every one of the
C(n,2) possible pairs traded or never, reporting no magnitude - deal count exists on
`pairings` and is deliberately not read here, because D48 already measured that an
opacity ramp cannot both order five steps and clear 3:1 contrast, and there is no
reason to inherit that failure for a fact this binary. `components/TradeMatrix.tsx`
draws it as filled-versus-hollow-dashed squares (shape, not shade alone - D47 rule 1),
with the ordered legend and the full "never traded" list as real HTML underneath, not
SVG text nobody's screen reader would see. Lives on `/deals` as a third closed
`Directory`, alongside the two it already had, on the unfiltered index only. Verified
live: 15 principals (14 rosters, one succession), 105 possible pairs, 47 traded, 58
never.

**(3) A drawn refusal mark - BUILT.** The first attempt was blocked for reading as a
loading skeleton one iteration in, and that failure is worth being precise about
rather than just avoiding by feel: `.skeleton` (`app/globals.css`) is a solid,
ANIMATED, gradient-filled RECTANGLE. `RefusalMark` (`components/RefusalMark.tsx`)
shares none of those three properties - it is a static, dashed-outline CIRCLE with a
short diagonal tick inside, and nothing about it will ever "finish loading" into
something else, which is the actual claim a skeleton makes and this deliberately does
not. Wired to the one genuine D19 refusal already on this rail: a pending pick's
`REASON_TEXT` (unchanged, still printed verbatim per D44's own rule), now wrapped in
the mark rather than left as plain prose. Broader rollout across the app's other D19
refusals is left for a future round - this pass builds and ships the mark, it does not
retrofit every prose refusal in the codebase.

**Verified**: `pnpm lint` clean; `pnpm test` 985 to 994 (+9, no new files, before any
other concurrent round's changes land - report your own delta against your own
worktree's baseline, same as this entry does); `pnpm build` succeeds; full e2e suite
green after `rm -rf .next`; axe-core clean in both dark and light on `/lineage/p:1526`,
`/roster` and `/deals/1176397530418237440` against the real league; screenshots at
375/390/430 in both themes confirmed the rail, the refusal mark and the trade matrix
all read correctly and none regressed `/roster`'s or `/lineage`'s existing layout.
Checked `lib/theme.js` before starting: two themes, `dark` and `light`, so this round
was designed and tested against exactly those two, not three.

Rejected outright: filling every rail's every gap with texture unconditionally (the
original blocked idea, still correctly blocked in that form); a force-directed or
hand-placed node layout for the pair map (still correctly blocked - no construction
avoids the D19 adjacency claim); drawing deal count as an opacity ramp on the matrix
(D48's own measurement already rules this out); applying the refusal mark everywhere
D19 appears in one pass (scope creep beyond what this round verified).

## D72. THE OWNER SAID IT LOOKS THE SAME. IT WAS - the last round never touched density, and this one found the actual repetition and a dozen real truncation bugs, screenshotted, not assumed

The owner's exact words: "UI still looks mostly the same though, doesn't look new and
still a lot of information but a lot of clutter and not very intuitive." He was right,
and the reason is procedural: the prior round touched Home's masthead type and
background grain only, never the row-density and disclosure problems he was actually
describing. This round did not start from a theory of what was wrong - it screenshot
every list-heavy page at 390px first (per this file's own established practice, D51,
D58, D71) and fixed only what the pixels showed.

**THE PATTERN, CONFIRMED ON SIX PAGES, NOT GUESSED AT.** Every one below was
screenshotted before any change; every quoted string is what actually rendered.

**`/values` (`components/ValuesList.jsx`).** Every one of 60 visible rows carried a
32px generic monogram-in-a-themed-disc (`PlayerAvatar`) whose only per-row signal was
a 2px team-colour edge already described in the component's own header as "present if
you know to look for it, never competing with the row's content" - i.e. already
designed to be nearly invisible, while still costing the row's single biggest block of
fixed width. That cost showed up as real truncation, not aesthetics: player names
clipped mid-word ("Julius Ran...", "Deandre Ay...", "Bennedict...", "Damian Lill...",
"Kawhi Leon...", "Fred VanVI...") and the age-curve marker clipped mid-word too
("C · 30y · ▾ do..." for "downslope"), because the tier column
(`whitespace-nowrap`, sized to fit its longest label, "High-End Rotation") was eating
width the name needed. Fix: the avatar disc is gone from this row - `/roster` already
has the identical precedent for exactly this call (`app/roster/page.jsx`'s single
fragility-callout avatar, captioned "the ONE inline avatar on this page rather than
one per row"), so repeating a disc 60 times was already contrary to a pattern this
codebase had reasoned its way to once before. The freed width, plus letting the tier
label and the position/age/marker line wrap (`line-clamp-2`) instead of
single-line-truncating, ends every one of those cutoffs. `/roster` shares this exact
row component (`ValueAssetRow`) and inherits the same fix for free.

**`/managers` (`app/managers/page.jsx`).** One card, real evidence: the departed
manager's row (team "Blockbuster", owner "BigTrades", tenure tag "former
2022-2024") rendered as "Blockbu... BigTra..." - team name AND owner name clipped
in the same card, because both were sharing one baseline row with `truncate` and a
fixed-width tag. A second bug on every card: the tag line truncated mid-word
("...Reactiv..." for "Reactive after losses"). Fix: team name gets its own full-width
line; owner name + tenure tag move to a second line where each has the whole card
width instead of a fraction of it; the tag line wraps (`line-clamp-2`) instead of
truncating. The per-manager avatar colour (`TeamAvatar`) was checked, not assumed, and
left alone: `components/TeamAvatar.jsx`'s own source order is a manager's own uploaded
Sleeper team logo (7 of 14 in this league), then their Sleeper user avatar, falling
back to a deterministic per-name colour only when neither exists - real per-entity
identity carried through from Sleeper, not a decorative circle, and the one case in
this audit where the task's own instinct ("check what's real before deciding") said
keep it.

**`/awards` (`app/awards/page.jsx`).** The worst version of the same bug: runner-up
rows crushed real team names to single letters plus an ellipsis - "Par...", "Win...",
"Dra..." for Parquet Kings, Win Now, Draft Vault - because a long multi-fact stat
string ("3,509 pts benched · 94.3% started") sat `shrink` beside a `flex-1` name with
three fixed-width circles (place number, per-award icon badge, team avatar) already
eating the row. A second, subtler bug in the same file: the award headline's own
editorial title wrapped mid-word onto two lines ("The" / "Reach") whenever that
award's `statLine` was long (a runner's name plus pick plus rank, not a short number),
because title and statLine shared one baseline with the title on `flex-1`. Fix: runner-
up rows stack name above stat instead of beside it, each getting the row's near-full
width; card headlines stack title above statLine the same way, protecting the short
editorial title (never wraps) and letting the longer, variable statLine wrap
(`line-clamp-2`) below it instead of stealing the title's line.

**`/rank` (`components/RankingBoard.jsx`).** The identical `PlayerAvatar`-plus-tier
pattern as `/values`, on a 120-player drag-to-reorder board, with an added
complication: the meta line truncated consensus rank mid-digit ("cons #37" ->
"cons #..." for Damian Lillard, Kyrie Irving, screenshotted live). This row's height
is load-bearing - `ROW_HEIGHT`/`ROW_PITCH` constants drive the drag gesture's
pointer-to-index math, and the file's own comment already warned "if the row markup's
height classes ever change, this constant has to move with them." So the fix is the
same shape (drop the avatar disc from both the drag list and the disagreements list;
let the tier and meta lines wrap) plus the one thing `/values` didn't need: `h-14`
(56px) raised to `h-16` (64px) with `ROW_HEIGHT` moved to match, verified to leave
comfortable room for the now-occasional two-line meta without the row overflowing its
own border.

**`/commissioner` (`app/commissioner/page.jsx`).** The most severe instance found:
EVERY visible row of the transaction audit log truncated - "Full Tilt claimed Xavier
Kowalski..." (itself cut from "Kowalski ($26), dropped Deshawn Larsson"), "Trade -
Draft Vault sent Bobby P...", "Trade - The Process sent Marc...", every single row on
the live 362-move log, because `e.description` is a full
transaction sentence (`describeTransaction`, `lib/derive/describe.js`) forced onto one
`truncate` line. An audit log's entire purpose is to state exactly what happened;
silently cutting every row is closer to data loss than density. Fix: the row already
used `min-h-11` (a minimum, not a fixed height), so removing `truncate` and letting the
sentence wrap costs nothing structurally - some rows are now three or four lines for a
big multi-asset trade, which is correct, not a regression.

**`/league`'s power ranking (`app/league/page.jsx`).** Two more truncating lines:
owner name + record + ordinal rank clipped a digit ("2nd of 1..." for "2nd of 14"),
and the window/TCI/RFI/posture line clipped a posture word mid-syllable ("strad..."
for "straddling"). The second one is notable because the code's own comment had
already reasoned about this line's truncation and called it acceptable ("what
truncation eats has to be the recoverable half") - but that reasoning assumed a cut
would land cleanly on a "·" separator, and in practice it did not; a whole word going
missing was the design, a word being sliced in half was not. Both lines now
`line-clamp-2` instead of `truncate`, preserving the original ordering (posture is
still what wraps first, since it's still printed last) without ever mangling a word.

**PAGES CHECKED AND FOUND CLEAN, NOT SKIPPED.** `/drafts`, `/drafts/grades`, and
`/deals` were screenshotted at 390px alongside the rest and show none of this: `/deals`
already carries D58's disclosure work and a plain team-name index with no avatars;
`/drafts` and `/drafts/grades` use varied card shapes (one or two named callouts per
season, not a 60-row repeated list) with no truncation on any visible name. Nothing was
changed on these three - the fix is for the pages that actually had the problem, not a
global sweep for its own sake.

**HOME (`app/page.jsx`): the density fix, not another token pass.** Screenshotted
before any change: ten roughly-equal-weight bordered sections stacked in a single
scroll - banner, decision badge, the "Stated vs Revealed" headline card, a four-number
stat grid, an activity tape, "Still running" (a five-row streak panel), "What your
record shows" (a bullet list), "Who you deal with" (partner pills), "Where next," and
a footer link - measured at **2,243px**. Nothing on the page said which one mattered
most. The fix is the identical disclosure idiom this file already proved on `/deals`
and `/ledger` (D58, 60-77% shorter, zero information lost) and on Awards/Methodology/
Deals since (`93d4227`, "Fold Awards, Methodology and Deals into the house disclosure
pattern") - `<details>`/`<summary>` closed by default, opened by a reader who wants
more, never a deletion. `HomeFold` (a small local component in `app/page.jsx`, not a
new idiom: same `group`/`disclosure-chevron`/`disclosure-body` classes and the same
`.disclosure-*` motion in `app/interaction.css` every other fold in this app already
uses) wraps "Still running," "What your record shows," and "Who you deal with" -
exactly the three the owner's own brief named - each closed by default with its own
count stated on the shut summary line ("5 active," "4 findings," "top 3") so nothing
hides behind a label that will not admit what is inside it (D46). Left open: the
wordmark and banners, the "Stated vs Revealed" headline (the one thing every reader
came for), the four-number stat grid plus its activity tape (the one stat cluster),
and "Where next" (already a short, deliberately-capped utility list, not a section
that benefits from folding). After: **1,543px**, a 31% cut, with the same three
sections one tap away instead of permanently competing with the headline for the
reader's first look.

**Reused, not invented, everywhere in this round.** No new colour, no new disclosure
mechanism, no new row shape - every fix above is either (a) the existing
`Disclosure`/`Directory`/`AwardGroup`/`Subsection` `<details>` idiom this file has
documented four times already, or (b) `line-clamp-2` in place of `truncate` on a line
that was cutting real content, which is already how `app/managers/page.jsx`'s own
"read" sentence and `app/trade/finder/page.jsx` handle exactly this problem elsewhere
in the app. The one-accent rule (D47/D48/D61) was not touched: every fix here is size,
weight, spacing, wrapping and disclosure, never a new hue. `TeamAvatar`'s per-manager
colour (checked above) is the only colour signal in any of these rows and it already
existed before this round.

**Verified.** `pnpm lint` clean. `pnpm test`: **1018 passed (61 files)**, unchanged by
this round (no test files touched - the fixes are all layout, not logic). `pnpm build`
succeeds. Full `pnpm e2e` (`rm -rf .next` first): **78 passed**, zero failures,
including `e2e/nav.spec.js` and `e2e/density.spec.js` against the pages this round
touched. `axe-scan` clean in both dark and light on `/`, `/values`, `/managers`,
`/awards`, `/rank`, `/commissioner`, `/league` and `/roster`. Screenshots at 375, 390
and 430px in dark confirmed no wrap introduces a new overflow or a new truncation at
either edge of the app's supported width range; light theme screenshotted at 390px on
the same eight routes. Height deltas at 390px, dark, live-fixture data (before ->
after): `/values` 4,013 -> 4,233 (+220, the cost of wrapping instead of clipping);
`/managers` 2,207 -> 2,582 (+375); `/awards` 4,670 -> 4,872 (+202); `/rank` 8,731 ->
9,691 (+960, the `ROW_HEIGHT` 56 -> 64 change accounts for essentially all of it);
`/commissioner` 3,462 -> 3,907 (+445); `/league` 2,410 -> 2,914 (+504); Home
2,243 -> 1,543 (**-700, -31%**). Every page that grew did so because a truncation bug
was fixed by giving real content room instead of cutting it - the only page whose job
was to get SHORTER is Home, and it did.

Rejected: shrinking type further to fit the old widths (the owner's own brief ruled
this out explicitly, and D48 already established that this codebase treats a shrunk,
still-truncating label as no fix at all); leaving `/league`'s posture-word truncation
alone because a comment had already blessed it as acceptable (re-examined against a
live screenshot instead of trusting the comment, since the comment's own assumption -
a clean cut at a separator - did not hold in practice); deleting `PlayerAvatar` or
`TeamAvatar` as components (only their per-row use in the four dense lists above was
removed; both remain the correct choice everywhere they carry unique per-view
information, e.g. `/roster`'s single fragility callout and the manager identity
context `TeamAvatar` was built for); folding Home's four-number stat grid too (the
brief said "maybe one stat cluster" stays open, and this is the one - the headline
alone, with no supporting figures, would have read as an assertion with nothing under
it).

## D73. THE PHOTO COLUMN COMES BACK, CONDITIONALLY - D72 was right for monograms, not for photos

D72 removed `/values` and `/rank`'s avatar column because a 32px monogram disc,
identical in shape and near-identical in colour across sixty (or 120) rows, was pure
decoration duplicating the name printed beside it - correct, and unchanged here. But
the owner's actual want, surfaced right after, was real player photos
(`NEXT_PUBLIC_USE_PLAYER_PHOTOS`, D39): sixty DIFFERENT faces is not the same claim as
sixty identical circles. A monogram repeating is decoration; a photo repeating is
recognition - the two rows in D72's "no avatar" comments were both true for the
monogram case and both false for the photo case, so the fix is not "avatar back" or
"avatar gone," it is "gone when it would be a monogram, back when it would be a face."

**`photosEnabled()`, exported from `components/PlayerAvatar.jsx`** - the same
`NEXT_PUBLIC_USE_PLAYER_PHOTOS === "true"` check `PlayerAvatar` itself already reads,
in one place rather than duplicated at every call site that needs to know before
deciding whether to render the column at all. `ValueAssetRow` (`/values`, `/roster`
inherits it) and the `/rank` board both now render `<PlayerAvatar size="sm">` only
when this returns true; off (the default, unlicensed-fork-safe per D39), both rows
render exactly as D72 left them - nothing regresses for anyone who has not set the
var. `/rank`'s row height (`ROW_HEIGHT`/`ROW_PITCH`, raised 56->64px by D72 for the
two-line wrap fix) has room for a 32px disc either way, so the photo column costs no
further height there.

**Verified the code path renders correctly even where the photo itself cannot be
fetched.** This sandbox's network policy does not reach `sleepercdn.com`, so the real
image never resolves here - screenshotted anyway, with the flag on, to confirm: all
sixty `<img>` tags render at the right position with the correct src, the row layout
does not shift or reflow around a pending image, and the themed backdrop disc (D39)
shows correctly as the loading state. This is the same component and the same fetch
`/roster`, `/deals/[id]`, `/lineage/[assetKey]`, `/recap`, `/drafts`, the trade builder
and search panel already use in production - nothing new to license or licence-gate,
this only restores the two list views D72 had (correctly, for the monogram case)
stopped rendering it on.

Turning the flag on is a Vercel project setting, not a code change, and
`NEXT_PUBLIC_*` is inlined at BUILD time - setting it requires a redeploy (a restart of
the same build will not pick it up).

Verified: `pnpm lint` clean; `pnpm test` 1018/1018 unchanged; `pnpm build` succeeds;
full e2e suite green (flag off, matching what ships by default); screenshotted `/values`
and `/rank` with the flag on to confirm the column renders and the row layout holds.

## D74. A STAR-TIER AGE ADJUSTMENT, MEASURED SEPARATELY FROM THE POPULATION CURVE - Luka Doncic re-examined, and this time the model agrees with the owner

The owner's exact challenge: Luka Doncic (27, Sleeper's own live consensus rank #3)
priced at 7,112 - narrowly BELOW Alperen Sengun (24, consensus #10) at 7,179, both
landing in Cornerstone. "Luka is definitely a cornerstone and ahead of Sengun,
re-examine your model." The mechanism was disclosed and correct as far as it went
(D55's own age curve, plus a real 5% center-scarcity premium Sengun gets and Luka does
not) - but "disclosed and correct" is not the same question as "is the curve itself
missing something," which is what got re-examined here, the same way D67 and D70 both
re-examined a real complaint and only fixed what the data actually supported.

**THE HYPOTHESIS.** `DERIVED_AGE_CURVE` (D55) is a POPULATION average - every player
clearing 30 games and 500 minutes, regardless of talent tier. Dynasty theory commonly
argues elite talent declines later and slower than a replacement-level contemporary
of the same age (different touches, different health investment, different skill
floor). If real, the single population curve systematically over-discounts elite
players in their late 20s - Luka's exact case - relative to what a star-conditional
curve would say.

**THE MEASUREMENT.** Re-ran `scripts/derive-age-curve.js`'s exact method (same 4,587
player-season corpus, same per-36/era-relative normalization, same forward-tracking-
with-zero-for-non-qualifiers rule, same 0.9/5-season discount) as a second pass that
also tags every player-season against that SEASON's own top decile by era-relative
production - a percentile rather than a fixed count because the qualifying pool itself
ranges 330-420 players across the 13 sampled seasons, and a fixed count would sample a
thin season and a deep one at different effective tiers. 10% of a season averages
35.8 players (33-38 across the sample) - almost exactly a season's All-NBA (15) plus
All-Star (24) pool plus its best snubs, which is what "star tier" means in the
dynasty-market sense the owner is asking about.

Comparing the star cohort's own discounted forward-production curve against the
population curve, IN THE SAME UNITS (both are already a multiple of the player's own
current-season output, so the ratio needs no re-normalizing - an earlier draft of this
measurement normalized both curves to their own age-27 value for a side-by-side read,
which trivially forces the ratio to 1.0 exactly at 27 by construction and would have
hidden the real effect; caught before it produced a false "no signal at 27" read):

| age | population remaining | star remaining | ratio (star/pop) | star n | thinnest cell |
|---|---|---|---|---|---|
| 21 | 3.826 | 4.294 | 1.122 | 22 | 12 |
| 24 | 3.594 | 4.281 | 1.191 | 39 | 25 |
| 26 | 3.339 | 3.677 | 1.101 | 46 | 30 |
| 27 | 3.225 | 3.527 | 1.094 | 41 | 25 |
| 28 | 3.135 | 3.675 | 1.172 | 39 | 25 |
| 29 | 3.081 | 3.818 | 1.239 | 36 | 22 |
| 30 | 2.756 | 3.402 | 1.235 | 25 | 17 |
| 31 | 2.566 | 3.244 | 1.264 | 23 | 12 |

Ages 21-26 bounce without a clean trend (1.10-1.19, no monotone shape even before
smoothing - the age range where a star and an average qualifier are both still rising
or at peak, so there is little reason for them to have diverged yet). From 27 on the
RAW ratios are already nearly monotone before any smoothing (1.094, 1.172, 1.239,
1.235, 1.264) - a real, clean, and large effect: a top-decile player keeps 9-26% MORE
of his own current production, discounted forward, than an average qualifying player
of the same age, and the gap grows with age. That is the basketball story dynasty
theory tells about "stars age gracefully": not that young stars improve differently,
but that elite talent resists the DECLINE phase better than a replacement-level
contemporary - and the data only tells that story from 27 onward, matching this
model's own existing neutral point (`injury.ageReference = 27`) and its own
`firstCliffAge()` (30) almost exactly.

**EXTERNAL RESEARCH, AS A CROSS-CHECK, NOT A SUBSTITUTE.** "Size dynasty power
rankings for dynasty basketball" does NOT resolve to anything real. Multiple direct
searches ("size dynasty" + rankings/newsletter/podcast/site) turned up nothing
matching that name - no site, newsletter, or writer, unlike D70's "dizzle dynasty,"
which searched exactly this way and turned out to be real
(dizzledynasty.substack.com). Stated plainly rather than invented around. Hashtag
Basketball's own dynasty page is real and confirmed to exist
(hashtagbasketball.com/fantasy-basketball-dynasty-rankings) but returned HTTP 403 to
every fetch attempt - the identical result D70 got auditing the same site. Still not
reachable from this environment.

What WAS reachable, and used: RotoWire's dynasty keeper rankings explicitly apply the
hypothesis under test, in the community's own words - Nikola Jokic (then 30) ranked
#2 overall with the stated reason "his game doesn't rely on athleticism... should
deliver 4-5 more elite seasons," distinguishing him from a player whose aging is
tied to explosiveness. The SAME article ranked Luka Doncic #4 and Alperen Sengun #32
- real, independent, external corroboration that the wider dynasty market already
had Luka clearly ahead of Sengun, matching what this re-derivation found and the
owner's own read, not just this league's live consensus.

Found and weighed HONESTLY rather than cherry-picked: The Dynasty Guru's own
statistical treatment of aging curves pushes back on part of the folk theory - it
argues (for baseball, the sport its regression was built on) that elite and average
players follow SIMILAR aging patterns and peak at similar ages, and that elite
players show smaller percentage swings mostly because "better players tend to
improve less than average players... mostly because of regression to the mean," not
because they decline later in age. That is a real, more rigorous counter-voice, not
dismissed here - which is exactly why this decision rests on THIS league's own
reconstructed NBA history (a sport-specific, methodology-matched measurement) rather
than on either the folk theory or its rebuttal. The external research corroborates
that the STAR-AGES-DIFFERENTLY question is a genuinely live, real debate in dynasty
theory, not a settled consensus either way - and sanity-checks that the SHAPE and
rough MAGNITUDE of what the historical data found (a growing separation from the
late 20s) matches at least one real, current, numerically-explicit dynasty source's
own reasoning about the exact players in question. No external ranking was copied
into a value; every number in the table above came from this league's own
reconstructed NBA history.

**WHAT SHIPPED.** `lib/valuation/ageCurve.js` gains `STAR_AGE_ADJUSTMENT` (five rows,
ages 27-31, ratios 1.139/1.172/1.237/1.237/1.264 after weighted isotonic smoothing -
the same PAVA machinery `DERIVED_AGE_CURVE` already uses, non-decreasing this time
since the hypothesis is that the star/population gap widens with age), `isStarTier`
(a player Sleeper's own live consensus ranks 36 or better - the derivation's own mean
cohort size, 35.8, rounded up to the next whole player, reusing the SAME rank the
base-value term already spends its whole trust budget on rather than inventing a
second notion of "good"), and `starAgeAdjustment()` (interpolates the table; exactly
1.0 below age 27 - no correction, not because none exists but because the raw 21-26
data does not clear its own noise; holds flat at 1.264 past 31, the same convention
`DERIVED_AGE_CURVE` uses past its own supported range). `valuePlayer` (`lib/
valuation/index.js`) multiplies it onto the ordinary age term for any player who
clears the rank cutoff; everyone else is priced identically to before. `ageMultiplier`
takes a new optional third argument, `{ star }`, defaulting to false everywhere it
already wasn't threaded through (the /methodology curve illustrations, `lib/metrics/
duration.ts`'s generic payout-profile math - both deliberately left reading the plain
population curve; see "what this does not touch" below).

**WHY THE TABLE STARTS AT 27 AND NOT 21 - two honest reasons, not one convenient one.**
First, the evidence: 21-26's raw ratios do not clear their own noise the way 27-31's
already-monotone-before-smoothing ones do. Second, extending the correction below 27
would push a star-adjusted 21-year-old to 1.071 (population) x 1.106 (the 21-26
block's own smoothed ratio) = 1.185, ABOVE the whole app's 1.16 ceiling
(`theoreticalMaxMultiplier`), which would have required rescaling every value in the
product to accommodate a correction the data does not cleanly support in the first
place. Not applying it there is the conservative reading of a genuinely noisier
result, not a boundary drawn to land on any one player's age - the raw ratio at 26
(1.101) and at 27 (1.094) are themselves nearly identical, and the table's floor of
1.0 below 27 UNDERSTATES whatever real effect exists there rather than inventing one.
Checked, not assumed: the largest star-adjusted multiplier anywhere in the applied
range (27-36, holding flat past 31) is 1.067 at age 29 - comfortably under the 1.16
peak `ageAnchors` already sets at 19-20 - so `theoreticalMaxMultiplier` needed no
code change, and a new test (`lib/valuation/valuation.test.js`, "never lifts the
combined multiplier above the population curve's own peak") checks this exhaustively
across ages 19-45 rather than trusting the arithmetic once.

**`ageBlindConfig` (`lib/valuation/exitWindow.js`) HAD TO LEARN ABOUT THE NEW TABLE
TOO, AND A TEST CAUGHT IT.** The star-tier adjustment is itself an age-dependent
multiplier - flattening `ageAnchors` alone left it live, so a "young, rank 30" and
"old, rank 30" synthetic pair (both star-tier by rank) priced UNEQUALLY under
supposedly age-blind pricing, failing `exitWindow.test.js`'s own "the age curve cannot
manufacture its own confirmation" test. Fixed by flattening `starAgeAdjustment`'s
ratios to 1 alongside `ageAnchors` - the exact "an absolute/derived value that must
track a recalibration" class of defect D55 named, caught here by the existing test
suite rather than by inspection.

**VERIFIED AGAINST THE REAL LEAGUE, NOT JUST THE DISPUTED PAIR.** Ran against live
Sleeper data for the real NSL Fantasy Hoops league (D70's own technique: an
uncommitted `vitest.explore.config.mjs` pointed at the real provider, deleted before
this was committed):
- **Luka Doncic (27, rank 3):** age multiplier 0.90 -> 1.03, value **7,112 -> 8,100**,
  tier **Cornerstone -> Franchise** - now clearly ahead of Sengun, which is what the
  owner argued for and what the re-derived data actually supports.
- **Alperen Sengun (24, rank 10):** unchanged at 7,179, Cornerstone - age 24 is below
  the applied floor, so nothing about his price moves. The two are no longer
  uncomfortably close; Luka is now unambiguously ahead.
- **A young non-star** (Kyshawn George, 22, rank 106): unaffected, as expected.
- **An old star** (Anthony Davis, 33, rank 15): age multiplier 0.72 -> 0.85, matching
  exactly the "durable greatness" case D70's own audit flagged as an open question.
- **A declined former star** (Joel Embiid, 32, rank 56): correctly UNAFFECTED - live
  consensus no longer ranks him top-decile, so the mechanism does not apply, which is
  the intended self-correcting property of anchoring "star" to a LIVE rank rather
  than a fixed historical label.
- **An old role player** (CJ McCollum, 34, rank 105): unaffected, as expected.
- Giannis (31, #7), Durant (37, #26) and Tatum (28, #11) all moved in the same
  direction and by a plausible amount, confirming the pattern isn't overfit to one
  player.

**WHAT THIS DOES NOT TOUCH, AND WHY.** `lib/metrics/duration.ts`'s `playerDuration` -
the TCI payout-profile math - takes a bare age with no player identity attached, and
was deliberately left reading the plain population curve rather than threaded through
with star-awareness. Extending it would be real, additional scope (every roster's TCI
would shift, not just star-holding rosters' age-based value) beyond what this audit
set out to check, and the app's own roster-page trajectory (`app/roster/page.jsx`'s
`valueTrajectory`, which DOES carry player identity) was updated to stay consistent
with the value it is a projection of, which is the surface that actually needed it.

**Verified**: `pnpm lint` clean; `pnpm test` 1018 -> 1028 (+10, this worktree's own
baseline, all new tests exercise the star-tier machinery and its invariants); `pnpm
build` succeeds; full e2e suite green (78/78) after `rm -rf .next` - the exact
Turbopack dev-cache staleness gotcha this file has warned about before, reproduced
here (a stale production `.next` from `pnpm build` made the dev server used by `pnpm
e2e` hang on first compile until cleared) and worked around the same way, not papered
over.

**Rejected**: applying the adjustment across the full measured 21-31 range (real
signal exists there too, but noisier, and would have required rescaling
`theoreticalMaxMultiplier` for a correction the data does not cleanly support at the
young end); rewriting `DERIVED_AGE_CURVE` itself rather than layering a second table
on top (the population curve is not wrong, it is exactly what it has always claimed to
be - an average across every qualifying player regardless of tier; this is a narrower,
separate measurement of how much LESS a top-decile player should be discounted once
decline starts); trusting "size dynasty" as a real source without a real search
turning one up (stated as unresolved, not treated as confirmed); letting RotoWire's
(or any external ranking's) community framing set the magnitude of the adjustment
rather than the historical data - and, symmetrically, letting The Dynasty Guru's own
more skeptical statistical treatment overrule the historical measurement either
(both were weighed as real, current dynasty-theory voices on opposite sides of the
same question, used only to confirm the SHAPE of the claim is a genuine, live debate
worth encoding rather than a settled consensus copied wholesale).

## D75. THE PULSE - S2's own revival condition, finally met, and why nothing else researched cleared the step-change bar

The owner's ask for this round was explicit and different in kind from the rest of
this session: not another polish pass, a genuine step change - something a manager
could not see at all today, researched against what Sleeper and the dedicated dynasty
tools actually do, and held to this app's own restraint rather than imitated wholesale.

**WHAT WAS RESEARCHED, AND WHAT IT ACTUALLY FOUND.** Three real Sleeper differentiators
(trade block, activity feed, waiver/FAAB UX) and the dedicated dynasty-value-consensus
space, checked live rather than assumed. The single most load-bearing finding: **every
crowd-consensus dynasty tool named as a candidate - KeepTradeCut, FantasyCalc,
DynastyProcess - is a fantasy FOOTBALL tool.** FantasyCalc's undocumented
`api.fantasycalc.com/values/current` endpoint is real and reachable, and KeepTradeCut
confirms in its own FAQ that it has no API and its own terms forbid scraping - but
both price NFL players, not NBA ones, so neither is usable here regardless. The
NBA-specific equivalents that do exist (Dynatyze, Court Consensus, OneNumberHoops,
DynastyDaily, Hashtag Basketball) were the ones actually worth weighing, and D70
already put Hashtag Basketball's own reachability to the test three days earlier and
got HTTP 403 on every attempt - unchanged this round. Building a live "your model vs.
the market" surface on any of these would mean a scraper against an undocumented,
unlicensed, un-uptime-guaranteed third party - exactly the maintenance risk SHELVED.md's
S1 got shelved for, on a feature this app does not otherwise have anywhere. D70's own
audit already did the honest version of this comparison once, by hand, as a point-in-
time finding (the sophomore-pedigree cohort: Harper, Edgecombe, Bailey, all running well
behind external consensus for a named, undisclosed-to-the-data reason). Turning that
into a live, permanent surface would either need a data source this environment cannot
reach reliably or a hand-curated snapshot that goes stale the moment next year's rookie
class lands - the identical failure `tierOf()` (S6, SHELVED.md) was deleted for: a
second system quietly drifting out of sync with the one it was supposed to check.
**Rejected outright, and not revisited**, for that reason.

**THE POSITIONAL LEVERAGE INDEX INTEGRATION WAS REAL BUT TOO SMALL FOR THIS ROUND'S
BAR.** Surfacing `/lab/leverage`'s own read on `/trade/finder` - "this deal would move
your leverage at PF from X to Y" - is a genuine, buildable, zero-new-data-source
integration, and a later round should still do it. It was set aside here specifically
because it is an extension of a metric this same session already shipped a few hours
earlier, and the owner's ask was pointedly for something that does NOT read as more of
today's own arc.

**WHAT ACTUALLY CLEARED THE BAR: `lib/digest` WAS ALREADY BUILT FOR THIS, AND WAS
SITTING DORMANT FOR ONE PRECISE, NAMED REASON.** SHELVED.md's S2 killed the "since your
last visit" Home panel for burning its own baseline on the first render: load once and
it has nothing to compare against, reload thirty seconds later and it has "nothing has
moved since just now." The entry names its own revival condition in so many words - "the
baseline is anchored to something other than 'last page view' - a stored last-*session*
timestamp with a floor of, say, twelve hours." Nobody had done that yet. Everything else
S2 needed already existed and had for two rounds: `buildDigest` computes a genuinely
LEAGUE-WIDE diff - every trade, every traded pick that resolved into a player, and every
roster whose TCI or Fragility crossed a five-point threshold, across every roster in the
league, not just the viewer's own - it was simply never rendered as that, because the
one page that read it was Home, framed around one identity's own "since you were here."

**THE FIX IS THE ONE NAMED, NOTHING MORE.** `shouldAdvanceMarker` (`lib/digest/index.js`)
and its `DIGEST_ADVANCE_FLOOR_MS` (twelve hours, the exact figure SHELVED.md itself
suggested) refuse to move the marker forward until the floor has elapsed since the last
time it did; a marker that does not exist yet (a genuine first visit) still bootstraps
immediately, so a reader is never stuck refusing its own first baseline. `/api/digest-
seen` now reads the existing marker before writing and skips the cookie write entirely
when the floor has not elapsed - the beacon (`components/DigestBeacon.jsx`) still fires
on every mount exactly as before, unconditionally, because the floor belongs to the
route that owns the cookie, not the client that cannot read it. `homeNext()`'s own
"did anything move" read is unaffected in kind, only in cadence: it now answers against a
window that actually had time to contain something, which is a strictly more honest
signal than the one it had.

**`/lab/pulse` IS THE FULL LEAGUE-WIDE VIEW, SHIPPED WHERE AN UNPROVEN PRESENTATION
BELONGS.** Trades, resolved picks, and TCI/RFI moves, all league-wide, all already
computed by `buildDigest` - a reader who has never opened a single dossier can now see
that another manager's TCI or RFI crossed the five-point threshold without visiting
their dossier directly to notice it, framed
in this app's own descriptive voice (`describeTransaction`'s existing "Trade - X sent Y;
Z sent W," not a rewrite) rather than Sleeper's raw event log. **This is deliberately not
a marketplace, a chat, or an activity feed cloned wholesale** - Sleeper already has all
three, and duplicating any of them would be exactly the scope creep the owner's framing
warned against. What it adds instead is what no competitor - Sleeper or the dynasty-
value sites researched above - does: reading a raw move through this app's own analytical
lens, past "traded away" to what it did to a roster's revealed shape. Every metric move
is printed as a number and a direction only, never colored green or red and never called
good or bad on its own - the identical discipline D61 already fixed everywhere else in
the app (`fragilityTone`: a number is a conditioned alarm about a specific risk, never a
grade on a category) and this page inherits it rather than reinventing a verdict.
Registered once in `lib/lab/index.js`'s `EXPERIMENTS`, reachable only from `/lab`,
matching D54's and D68's own standard: the floor mechanic and this presentation have not
been lived with across a season, so promotion is a later round's decision, earned the
same way TCI and RFI earned theirs, not assumed here.

**A REAL BUG CAUGHT BEFORE SHIPPING, THE SAME WAY D71 CAUGHT ITS OWN NORMALIZATION
MISTAKE.** The first cut put each list inside a padded `Card` with per-row bottom
borders. `/deals` already solved exactly this list shape - a `divide-y` bordered
container of `<li><Link>` rows at `min-h-11` - and reusing it instead is what this page
now does; the padded-Card draft is not in the shipped file. Separately, axe-core caught a
real `heading-order` violation live: `PageHeader` renders an `h1` and `EmptyState` an
`h3`, and the first-visit and quiet states had nothing in between - the identical latent
defect axe found, unprompted, on `/lab/regret`'s own empty state during this same
verification pass (pre-existing there, left alone - out of scope for this round to fix
elsewhere). Fixed on this page with a plain `SectionHeader` ("What changed," an `h2`)
ahead of every state, which also reads as a real label rather than a pure accessibility
patch.

**Verified**: `pnpm lint` clean; `pnpm test` 1033/61 (+5, all in `lib/digest/digest.test.js`
against `shouldAdvanceMarker`, none of them synthetic - each one pins a real floor
boundary: the instant after, the instant of, and the instant past `DIGEST_ADVANCE_FLOOR_MS`,
plus the null-marker bootstrap and a clock running backwards); `pnpm build` succeeds after
`rm -rf .next`; full e2e suite (78 specs) green from a clean Turbopack cache; axe-core
clean on `/lab/pulse` in both the first-visit and changes states, both themes, after the
heading-order fix above; screenshots at 390px in dark and light confirm the empty state,
the trade/pick/move lists, and the overflow captions all render as intended.

**Rejected**: a live scrape of any NBA dynasty-consensus site (no NBA-specific site with a
documented API exists, and the football ones that do have undocumented endpoints price
the wrong sport entirely - see above); a hand-curated "market says" snapshot standing in
for one (the identical decaying-second-system failure `tierOf()` was deleted for);
surfacing Positional Leverage on `/trade/finder` this round (real and worth doing, just
too close to today's own already-shipped arc to read as the asked-for step change);
promoting `/lab/pulse` straight to Home or the primary nav (the floor mechanic and this
presentation have not earned that the way TCI and RFI did - D54's bar, applied here on
purpose rather than skipped because the underlying diff engine is old); fixing
`/lab/regret`'s own latent heading-order defect in this pass (real, but a different
page's bug, found as a side effect of verifying this one - named here so the next round
does not have to rediscover it, not silently folded into an unrelated diff).

## D76. THE SAME DENSITY PASS, ON THE PAGES D72 NEVER GOT TO - seven more real truncation bugs, two more monotonous avatar columns, and three pages confirmed clean a second time

D72 fixed six list-heavy pages the owner's own complaint was actually about, and named
the ones it had checked and found clean. This round did the pages that round did not
reach, or reached before D73's photo-column and D74's age-curve work landed on top of
them: `/recap`, `/about`, `/methodology`, `/trade`, `/trade/finder`, `/analyst`,
`/lab` and its three real sub-pages (`/lab/counterfactual`, `/lab/regret`,
`/lab/leverage` - the last one shipped this session and had never had a density pass
at all), `/managers/compare`, an individual `/managers/[rosterId]` dossier, an
individual `/drafts/[season]` board, and a fresh re-check of `/drafts`,
`/drafts/grades` and `/deals` now that today's theme removal, tab bar, provenance
rework and age curve have all landed on top of them. Same method as D72: screenshot
every page at 390px first, against the real live league (NSL Fantasy Hoops) where the
fixture provider's shorter synthetic names would not have surfaced the real bugs -
several of these only clip on the league's OWN longest real names ("Sweet Home
Wembanyama", "The Terror Twins", "Giddler on the Roof") and would have looked clean
against the fixture alone.

**REAL BUGS, FOUND AND FIXED, WITH THE EVIDENCE.**

**`/recap` (`app/recap/page.jsx`).** Two truncating lines, both `d.description` -
the exact same full-sentence string `describeTransaction` builds that D72 already
fixed once on `/commissioner`'s audit log, independently re-broken here because this
is a different render of the same data. Screenshotted clipping mid-word on the live
league: "Parquet Kings claimed Rashad Petrov ($25), d...", "You acquired Khris
Middleton for Cam Thoma...". Fixed the same way D72 fixed `/commissioner`: drop
`truncate`, let the sentence wrap (the row was already a flexible height, not fixed).
A second, separate truncation on the same page: the "Traded picks that became
players" row's meta line (pick label + position + owner name) clipped real team names
once tested against the live league's actual longest names - "...Giddler on the
Ro...", "...Sweet Home Wembanyama) · SF · Ol...". Fixed with `line-clamp-2`. A third
finding on the same page, not a truncation but the D72/D73 monotony pattern: that same
row rendered a `PlayerAvatar` monogram on all 31 resolved picks on a real trade-heavy
season, unconditionally - never gated behind `photosEnabled()` the way D73 gated
`ValueAssetRow` and the `/rank` board. Fixed by gating it the same way.

**`/trade` (`app/trade/page.jsx`).** The "Most motivated partners" row's meta line
(TCI + value duration + now/later split) truncated real facts on a `truncate` line -
the identical shape of bug D72 fixed on `/league`'s own window/TCI/RFI/posture line.
Fixed with `line-clamp-2`. A second bug on the same row, found only once tested
against the live league's real team names: the team name itself, sharing its line
with a `PostureTag` chip, clipped to "Sweet Home Wembanya..." - the same shape D72
fixed on `/managers`' card (a long name losing a fight with a fixed-width sibling for
line space). Fixed with `line-clamp-2`.

**`/trade/finder` (`app/trade/finder/page.jsx`).** The worst instance found this
round: the partner board's behaviour-tag line (value window + shared-window flag +
every behaviour tag + trade count) truncated on NEARLY EVERY CARD on the live league -
"...Name chaser · R...", "...Pick hoarder · N...", "...Never tra...",
"...High-vol...", "...Name c...". The file's own adjacent comment had already
reasoned that a package name deserves two lines rather than one truncated line
(`r.bestIdea`, already fixed); the tag line one span below it had not gotten the same
treatment. Fixed with `line-clamp-2`.

**`/managers/[rosterId]` (`app/managers/[rosterId]/page.jsx`), and the identical bug
in `/managers/former/[ownerId]/page.jsx`.** The most severe finding of the round: the
page's own h1 masthead - a manager's freely-chosen team name, via `PageHeader`'s
`truncateTitle` prop - clipped to "Sweet Home Wem..." for "Sweet Home Wembanyama" on a
real dossier. This is backward from `/roster`'s own established use of the same prop:
`/roster` truncates `a.ownerName` (a short, bounded Sleeper username) and demotes the
longer, unbounded team name to the smaller kicker line underneath - the safer of the
two strings to risk clipping. This page had it the other way around: the long,
user-chosen string was the one forced onto one line. Fixed by dropping
`truncateTitle` entirely and letting the h1 wrap, matching how every other page title
in this app already behaves. Same defect, same component misuse, found in
`/managers/former/[ownerId]/page.jsx` too (not on the audit's original page list, but
byte-identical `PageHeader` usage) - fixed there as well rather than left
inconsistent. Second bug on `/managers/[rosterId]`: "Picks they bought back"'s line
("Their own {label}, back from {fromName}") truncated real partner team names on FIVE
separate dossiers screenshotted live - "...back from The Terror Twi...", "...back
from Giddler on the...", "...back from kd...". Fixed with `line-clamp-2`. A third,
UNRELATED pre-existing finding surfaced by this round's own verification requirement
(axe-core clean on every page touched): the "Posture by season" chips' `opacity-80` on
an already-muted text token failed axe's `color-contrast` rule in both themes,
confirmed present even with every other fix in this entry reverted (`git stash`),
i.e. not caused by anything above. Fixed by dropping the redundant `opacity-80` (the
glyph and the word already carry the visual distinction from the season number; the
extra dimming was pushing an already-muted token below its own contrast budget for no
purpose the glyph doesn't already serve) - fixed identically in the former-manager
dossier, which carries the same chip.

**`/drafts/[season]` (`app/drafts/parts.jsx`, `BoardPickRow`) - never audited before,
found two real problems.** First, the D72/D73 monotony pattern, present here because
this component predates D73's fix and was never touched by it: `PlayerAvatar` on
every one of a season's 42 picks, unconditionally, the same near-invisible
monogram-disc decoration D72 removed from `/values` and D73 restored only behind
`photosEnabled()`. Fixed by gating it the same way. Second, a genuine truncation bug
this row already had before today, surfaced once tested against the live league: the
right-aligned "used by / via" column truncated real team names -
"Sweet Home We...", "The Terror Tw...", "Giddler on the...". The 34%-width cap on that
column is deliberate (it protects the player-name column, the row's actual subject),
but a clipped team name is lost information regardless of how the width was budgeted.
Fixed with `line-clamp-2` on both lines within the same width cap.

**`/lab/counterfactual` (`app/lab/counterfactual/page.jsx`) - gated for consistency,
not because it was independently caught clipping.** Screenshotted first, honestly:
every real name on this page's ~16-19 roster rows rendered in full, no visible
truncation, so this is not a repeat of the recap/drafts truncation bugs above. But the
same `PlayerAvatar` monogram rendered unconditionally down every row, which is the
exact decoration-with-no-signal D72/D73 already ruled on - once two more unguarded
instances turned up elsewhere this round (`/recap`, `/drafts/[season]`), leaving this
third one as the only ungated `PlayerAvatar` list left in the app would have been the
inconsistency, not the fix. Gated behind `photosEnabled()`.

**A NEW SHARED MODULE WAS REQUIRED, NOT OPTIONAL: `lib/photos.js`.** Gating three
Server Component pages behind `photosEnabled()` immediately broke all three -
`components/PlayerAvatar.jsx` is `"use client"`, and Next.js refuses to invoke ANY
export of a client module from server-side code, even a plain function with no
client-only API in it ("Attempted to call photosEnabled() from the server but
photosEnabled is on the client"). `ValuesList` and `RankingBoard` (D73's original two
callers) never hit this because both are themselves client components. Fixed by
extracting `photosEnabled()` into `lib/photos.js` (a plain, server-safe module) and
having `PlayerAvatar.jsx` re-export it, so the two existing client callers needed no
change and the three new Server Component callers (`app/recap/page.jsx`,
`app/drafts/parts.jsx`, `app/lab/counterfactual/page.jsx`) import it from the
server-safe location directly.

**A FALSE POSITIVE, CAUGHT AND RULED OUT RATHER THAN FIXED ON A GUESS.** A
full-page screenshot of an individual `/trade/finder` package view appeared to render
only 1 of 3 "you send" assets under a "3 assets" header - looked exactly like a
missing-row bug. Checked against the raw server-rendered HTML (not just the
screenshot) before touching anything: all three `<li>` rows were genuinely present in
the DOM. The apparent gap was a Playwright full-page-screenshot compositing artifact
where this app's sticky bottom bar (the team switcher + Desk tab row) gets rendered
into the composited image at more than one scroll position, visually occluding real
content underneath it without removing it from the page. Confirmed the same artifact
recurred on a `/trade/finder` board row later in the same session. No code changed for
this one - screenshotting first caught it before it became a wasted fix.

**PAGES CHECKED AND FOUND CLEAN, NOT SKIPPED.** `/about`: long-form editorial prose
with headers, not stacked bordered cards - D72's Home-fold pattern does not apply to a
page that was never a stack of same-weight boxes. `/methodology`: already uses the
established numbered-disclosure fold (1 through 8, including a new closed "2a ·
star-tier adjustment (D74)" section that integrated into the existing pattern without
help), no truncation anywhere in the table or curve illustrations. `/analyst`: a small
number of distinct prompt cards, no repeated decoration, no truncation - already the
kind of "empty state that teaches its own intent" DESIGN.md asks for. `/lab` (index):
three substantial, richly-differentiated cards; the repeated `FlaskConical` icon is a
small category marker that costs no width and causes no truncation, not the
D72 pattern. `/lab/regret`: the fixture provider reports zero scored weeks for every
season (a fixture-data limitation, not a page bug - `last_scored_leg` is simply never
set by the synthetic generator), so this page's actual populated state was verified
against the real live league instead; clean, no truncation, the weekly bars carry real
per-week signal rather than decoration. `/lab/leverage`: the brand-new page from this
session's Positional Leverage Index work already had a real density pass baked in from
its own construction - bounded label lengths, no monotonous decoration, no
truncation. `/managers/compare`: a real two-column stat comparison with a disclosure
link for the metric glossary, no truncation, no repeated decoration. `/drafts`,
`/drafts/grades`, `/deals`: re-screenshotted fresh, specifically to check for
regressions from everything else that shipped today (contrast-theme removal, the Desk
tab row, the provenance rework, the age curve) - all three remain exactly as clean as
D72 found them; nothing on any of the three needed a change.

**Reused, not invented.** Every truncation fix above is `line-clamp-2` in place of
`truncate` (D72's own established remedy for a real fact being cut, not a label) or,
for the two full-sentence cases that already had D72's own `/commissioner` precedent,
dropping `truncate` entirely and letting the sentence wrap. Every monotony fix is the
identical `photosEnabled()` gate D73 already established, applied to the two places it
had not yet reached. No new colour, no new disclosure mechanism, no new row shape.

**Verified.** `pnpm lint` clean. `pnpm test`: **1028 passed (61 files)**, unchanged
(no test files touched - every fix here is markup, not logic). `pnpm build` succeeds.
Full `pnpm e2e` (`rm -rf .next` first, the known Turbopack dev-cache staleness gotcha
this file has warned about before): **78 passed**, zero failures. `axe-scan` clean in
both dark and light on every page changed (`/recap`, `/trade`, `/trade/finder`,
`/managers/[rosterId]` on four different real rosters, `/managers/former/[ownerId]`,
`/drafts/[season]`, `/lab/counterfactual`) and on every page checked and left alone
(`/about`, `/methodology`, `/analyst`, `/lab`, `/lab/leverage`, `/lab/regret`,
`/managers/compare`, `/drafts`, `/drafts/grades`, `/deals`). Screenshotted at 390px
in both themes on every changed page, plus 375px and 430px spot-checks confirming no
new horizontal overflow at either edge of the app's supported width range - all
against the real live league, since several of the bugs above only clip on real names
longer than the fixture's synthetic ones.

Rejected: fixing `/lab/counterfactual`'s roster-row avatar because it looked
independently broken (it did not - screenshotted first, gated only for consistency
with D73's own rule, stated as such rather than invented as a new finding); treating
the `/trade/finder` "only 1 of 3 assets" screenshot as a real bug without checking the
underlying HTML first (would have been a wasted, wrong fix); fixing `/roster`'s own
`truncateTitle` usage on `a.ownerName` to match this round's `/managers/[rosterId]`
change - `/roster` was not on this round's page list, and its existing choice (risk
the shorter, bounded string, not the longer one) is already the correct pattern this
round copied elsewhere, not a bug to touch.

## D77. THE INTEGRATION D75 NAMED AND SET ASIDE - Positional Leverage now reads on
/trade/finder, scoped to the one roster the page is actually about

D75 researched a genuine step change, found one (`/lab/pulse`), and named a second,
smaller idea it declined to build in the same round: surfacing the Positional Leverage
Index's (D68) own read directly on a suggested package - "this deal would move your
leverage at PF from X to Y... real and buildable... a later round should still do it."
It was set aside there specifically because it was an extension of a metric that same
session had shipped a few hours earlier, not because it was unbuildable. This round is
that later round, and the integration is exactly as clean as D75 assumed - the honest
finding here is about SCOPE and FORMAT, not about a hidden obstacle.

**WHAT IT COMPUTES.** For a suggested package on `/trade/finder`, the viewer's own
Positional Leverage score (`buildLeverageProfile`, unchanged) is read twice: once
against the roster as it stands, once against the same roster with the package's
`give` assets subtracted and `get` assets added at whichever position(s) they carry.
Both reads are the identical function `/lab/leverage` itself calls - no new formula,
no new calibration constant, nothing invented. The line printed is a plain before ->
after on that one existing 0-100 scale, e.g. real output against the fixture league's
"Draft Vault" partner: **`LeBron James + Julius Randle + Scottie Barnes for Trae Young
+ Kyrie Irving` moves the viewer's Positional Leverage from 71 to 49, at PG, SF and
PF** - a real, three-position swing on a real three-for-two package, not a synthetic
example.

**WHY THE LEAGUE'S OWN POOLS NEVER NEED RECOMPUTING PER PACKAGE**, which is what keeps
this cheap on a page that can render several packages at once. `leaguePositionPools`
totals every rostered asset's value BY POSITION, LEAGUE-WIDE. A trade between two
rosters already in this league moves who OWNS value at a position; it does not create
or destroy value at that position leaguewide. So `leagueSharePos`, `scarcityByPos`,
`replacementByPos` and `topByPos` are IDENTICAL before and after any package this
finder proposes - the only thing that can move is the viewer's own `ownShare`, which
is five numbers' worth of arithmetic. `lib/tradefinder/leverage.js` is the whole
implementation: `applyPackageToByPosition` adjusts the viewer's `byPosition` mix
by the package's give/get, `leverageShiftFor` is the pure before/after comparison
(mirrors `fragilityNoteFor`'s shape one file over), and `packageLeverageShift` wires
the two together. `findTrades` computes the league pools ONCE per request and attaches
`leverageShift` to every package alongside the existing `fragility` field - the same
place, the same pattern, no new page-level plumbing.

**ONE GENUINE SHARED-COMPUTATION TOUCH TO `/lab/leverage`'s OWN MODULE**, the kind D68
reserved room for: `leaguePositionPools(h)` gained a second, optional parameter -
`leaguePositionPools(h, analyses = leagueValueRanking(h))` - so a caller that already
paid for a `leagueValueRanking` pass (`findTrades`'s own `board(h)`, two lines above
where the pools are now built) can hand it in rather than pay for the identical
league-wide ranking a second time. The pool math itself is untouched; `/lab/leverage`
itself still calls the function with no second argument and gets the exact behaviour
it always had. No other line on `/lab/leverage` changed.

**SCOPED TO THE VIEWER'S OWN ROSTER, ON PURPOSE - D75's explicit instruction, followed
rather than reinterpreted.** `partnerBoard` (the `/trade/finder` root, ranking all
fourteen leaguemates by room) was deliberately left untouched. That view already
compresses each leaguemate to one `line-clamp-2` headline - the exact density D72 and
D76 spent a full day fixing - and it has no per-package detail to compute a leverage
delta FROM in the first place (`partnerBoard` skips `evaluateTrade` and never expands
past one best idea per row, by its own existing design). The integration lives only on
the per-partner package list and the expanded package detail, where a package's give
and get are already fully in hand.

**WHY THE LINE IS THE EXISTING 0-100 SCORE, NOT A NEW PER-POSITION ONE.** D75's own
phrasing ("leverage at PF from X to Y") reads as if a single position could carry its
own 0-100 number, but no such figure exists anywhere in this codebase - only the
whole-roster score `buildLeverageProfile` already computes and calibrates against
`LEVERAGE_REF`. Inventing a second, position-scoped 0-100 scale to match the letter of
that phrasing would be exactly the "new invented format" this round was told not to
ship, and it would need its own calibration argument (D68's own bar for shipping a
number at all) that nothing here has done the work to earn. The roster's own score,
read twice, at the position(s) the trade actually touches, says the same thing D75
meant without a second scale nobody has calibrated.

**THE THRESHOLD IS BORROWED, NOT INVENTED.** `LEVERAGE_SHIFT_MIN = 1` - the smallest
unit the existing 0-100 scale can show - suppresses the line whenever a package would
not even move what `/lab/leverage` itself would print. This is the identical role
`SPOF_SHIFT_MIN` already plays for the Fragility note one file over, at the value
appropriate to THIS scale rather than copied verbatim from that one. A pick-for-pick
swap, or any package that touches no player at all, reports `null` and prints nothing
- an omitted line is honest; a "no change" line on every package would be exactly the
clutter this app spent the previous round removing.

**NEVER A VERDICT (D6, D19), THE SAME DISCIPLINE `FragilityLine` NEXT TO IT ALREADY
KEEPS.** The line states a number and the position(s) it moved at - "Positional
Leverage: 71 to 49, at PG, SF and PF" - and nothing about whether that move helps.
Gaining leverage at a position nobody in this league wants to deal with you about is
not obviously a win, and losing it at a position you were never trading from anyway is
not obviously a cost; this is a supply-side shape read, not a grade, and the wording
and the (lack of) colour both say so. `leverageShiftFor` is tested against the same
banned-word list `fragilityNoteFor`'s own suite already checks.

**Verified.** `pnpm lint` clean. `pnpm test`: baseline was 1033 passed (61 files);
now **1045 passed (62 files)** - the +12 are `lib/tradefinder/leverage.test.js`,
covering the pure comparison (position ordering, the `LEVERAGE_SHIFT_MIN` floor, both
missing-score guards, the banned-verdict-word check) and the roster arithmetic against
the real fixture league (a pure pick swap touches nothing; a multi-piece package
names every position it actually moves; `findTrades` attaches either a real shift or
an explicit `null` to every package, and recomputing independently lands on the exact
same note). `pnpm build` succeeds after `rm -rf .next`. Full `pnpm e2e` (`rm -rf
.next` first, the known Turbopack dev-cache staleness gotcha): **78 passed**, zero
failures. `axe-scan` clean in both dark and light on `/trade/finder?with=<partner>`
(package list) and `/trade/finder?with=<partner>&pkg=<id>` (expanded detail).
Screenshotted at 390px in both themes against the real fixture league's own "Draft
Vault" partner, confirming the line renders identically in each theme with no second
accent colour introduced (D47, D61, D64) - the one link this integration adds
(`Positional Leverage`, on the expanded detail view only) uses the same
`text-accent-text` treatment every other in-body link on this page already uses.

**Rejected:** a per-position 0-100 leverage score, decomposed from the existing
formula, to match D75's phrasing more literally (a new invented number this round was
explicitly told not to ship - see above); recomputing `leaguePositionPools` fresh
inside `packageLeverageShift` per package (unnecessary - the pools are invariant under
a two-roster trade, so one league-wide pass per page request is exactly enough, the
same reasoning `replacementValue` and `conviction` already apply one function above
this one); surfacing a leverage delta on `partnerBoard`'s fourteen-row list (no
per-package detail to compute FROM there, and the row is already at its density
ceiling per D72/D76); showing every one of a viewer's fourteen leaguemates' OWN
leverage change from a package aimed at only one of them (D75's instruction was
explicit - this is a page about the trade in front of the viewer, not a league-wide
pass nobody asked this screen to run).

## D78. AN AUDIT OF THE LEAGUE-AND-CONTEXT CLUSTER AGAINST REAL DYNASTY PROBLEMS - one
real gap found and fixed, the rest holds up

The owner's directive this round was a different lens than the day's earlier density
passes: not "does this look clean" but "does this solve a problem a dynasty basketball
manager actually has, and is the answer immediately usable." Scope: `/league`,
`/managers` and its three sub-pages, `/awards`, `/commissioner`, `/drafts` and its two
sub-pages, `/recap`, `/analyst`, all four `/lab` experiments, `/settings`, `/about` and
`/methodology` - the "league and other managers" half of the app. `/`, `/roster`,
`/plan`, `/ledger`, `/trade(/finder)`, `/values` and `/rank` are a sibling round's.

**WHAT WAS RESEARCHED, AND VERIFIED RATHER THAN ASSUMED.** Real dynasty-community and
commissioner-guide content (WebSearch; Reddit itself is unreachable from this
environment per D70's own finding, unchanged) on the four questions this cluster is
actually about: how a manager decides who to approach for a trade (the consensus is
behavioral - contending-vs-rebuilding read, historical tendencies - not roster
inspection alone); how a rebuild is judged as "on pace" (always relative to the rest of
the league, never in isolation); what a draft-pick evaluation argument actually turns
on (pedigree vs. proven role/usage for rookies, and for future picks: the CURRENT
strength of the team that owes it, not a fixed round-based price - "the 1.01 and the
1.12 are wildly different assets"); and what a commissioner/league-health check needs
to catch (real guides name inactivity and specific collusion PATTERNS - trades that
come back to the same manager, one-sided value - while also warning that most trades
should be allowed through absent real evidence, i.e. a health tool should surface facts
a human can weigh, not render an accusation).

**MOST OF THIS CLUSTER ALREADY CLEARS THAT BAR, AND IS RECORDED HERE RATHER THAN
SILENTLY LEFT ALONE**, because "checked and found already solving a real problem well"
is as real a finding as a gap:

- `/managers` is titled "Scout the managers - how they act, not what they hold," and
  `lib/dossier`'s tag/read/tip derivation (Name chaser, Pick hoarder, Deadline
  buyer/seller, Reactive after losses, Responder) is exactly the behavioral-tendency
  read the research says a real trade decision turns on, with a concrete "how to
  approach them" action tied to each tell - not a roster dump.
- `/managers/[rosterId]` layers "Picks they bought back" (a real, dated fact - not an
  inference) and a schedule-luck read on top of the same behavioral dossier, and
  `/managers/compare` and `/managers/former/[ownerId]` extend the identical read
  correctly (former managers scoped to their own tenure, not blended with a successor).
- `/league`'s single toggled board (window map / TCI-RFI quadrant) plus the power
  ranking answers "how does my rebuild compare to the rest of the league" directly,
  league-relative by construction rather than a number in isolation.
- `/awards`' superlatives are behavioral pattern-spotting, not bragging trivia dressed
  up as awards - The Scout/The Steal/The Reach grade draft-pick decisions against the
  board and against slot (pedigree vs. production, exactly the research finding), Name
  Brand Buyer and Panic Button and Hot Potato are real tendency reads, and every one
  states its own honest limit in its subtitle rather than pretending to certainty.
- `/analyst`'s system prompt is a genuinely adversarial, evidence-grounded auditor
  (leads with the disconfirming case, quotes the user's own annotated reasoning back at
  them, refuses to invent a pattern from thin data) with a deterministic
  no-API-key fallback that is equally adversarial rather than a degraded stub.
- All four `/lab` experiments answer a real, specific question at D54's own bar:
  Positional Leverage answers "where can I actually deal from" (the exact blind spot
  D67 found in RFI), the Pulse answers "what changed across the league since I last
  looked" league-wide, the Counterfactual answers "did my own trading actually help
  me," and Slot Par on the regret ledger answers "what has a lineup slot been worth in
  this league" - none reads as a verdict, and each names its own real limits.
- `/methodology`'s pick-value section already states the real answer to "how much is a
  future pick worth" in the terms the research surfaces: priced off the CURRENT
  strength of the team that owes it, a lottery spread rather than a fixed slot, and an
  explicit now-vs-2-years-out example - not a flat round-based chart.

**THE ONE REAL GAP: `/commissioner` HAD NO DOORWAY TO THE ONE PATTERN COMMISSIONER
GUIDES NAME FIRST.** The page already runs two real health checks - stale rosters
(inactivity, matching the research directly) and picks that can't resolve (data
integrity) - but had nothing about a pick returning to whoever traded it away, which is
the concrete, commonly-cited collusion-ADJACENT pattern in every commissioner guide
surveyed ("trades with an agreement to trade back later"). The computation already
existed: `leagueBuybacks` (`lib/agency/index.js`) was built for `/deals#buybacks` (D51)
and is fully tested, but nothing on the one page whose entire job is "what should a
commissioner check" pointed at it - a reader would have had to already know to look on
`/deals` to find it. This is D51's own pattern (surface a buried computation at the
actual decision moment) applied to the actual decision-maker's own page.

**THE FIX IS A DOORWAY, NOT A NEW VERDICT.** `app/commissioner/page.jsx` gained one
section, "Round-trip picks," between Stale rosters and Picks that can't resolve
(grouping the two manager-behavior checks ahead of the one data-integrity check): the
same `leagueBuybacks(h)` call `/deals` already makes, a neutral count tag (never
warn/negative - a round trip is not evidence of anything on its own, and research is
explicit that over-flagging ordinary trades is itself the failure mode to avoid), the
same "a fact worth knowing, not evidence of anything... a pick can come home as a
throw-in as easily as on purpose" framing `/deals#buybacks` already uses, and a link to
the full record rather than a second render of it. Zero new derivation, zero new test
surface (the underlying function's 15+ existing cases in `lib/agency/agency.test.js`
are untouched and still govern its behavior); D6 (no verdicts) and D19 (never
speculate beyond the data) are both satisfied by construction because the section says
exactly what D51's section already says, from the page a commissioner actually opens
to check league health rather than the page that happens to host the trade record.

**WHAT WAS DELIBERATELY NOT BUILT.** A lopsided-trade / value-imbalance detector
("2:1 threshold") that some commissioner tools ship: real guides warn this produces
false positives on ordinary win-now-for-picks trades this app's own D6/D23 already
treat as legitimate strategy, not a defect, and computing one honestly would need
research and calibration this round did not do (D54's bar for shipping a new metric at
all). A "stalled rebuild" alert: the signal a reader would need - posture read the same
way for several seasons running - is already visible without a new computation on
every dossier's existing "Posture by season" chips; inventing a threshold for when a
rebuild counts as "stalled" is exactly the unearned precision D19 forbids, and no
dynasty-community source surveyed offered a specific one to check against.

Verified: `pnpm lint` clean. `pnpm test`: baseline 1045 passed (62 files) - unchanged,
since the fix touches only `app/commissioner/page.jsx` and adds no new logic beyond a
call to an already-tested function. `pnpm build` succeeds after `rm -rf .next`. Full
`pnpm e2e` (`rm -rf .next` first): **78 passed**, zero failures - including
`/commissioner renders cleanly` and its color-contrast pass in both themes.
`axe-scan` clean on `/commissioner` in dark and light. Screenshotted at 390px in both
themes against the live fixture league, confirming the new section renders between
Stale rosters and Picks that can't resolve exactly as designed, with the real fixture
round trip ("1 pick has returned... across 1 of 14 rosters") printing correctly.

Rejected: inventing a collusion-detection heuristic beyond stating the round-trip fact
(the research itself warns this is the wrong shape - most trades should be allowed
through absent real evidence, so the tool's job is facts a human weighs, not a
verdict); a value-imbalance/lopsided-trade check (no calibration work done this round,
and D6/D23 already treat asymmetric-looking trades as legitimate strategy rather than
a defect to flag); touching any page outside this cluster's explicit list, including
`/deals` itself (only linked to, never edited) and every page the sibling round already
covers.

## D79. "YOUR TEAM & DECISIONS" AUDITED AGAINST REAL DYNASTY PAIN, AND THE ONE REAL GAP: `/trade`'S OWN EVALUATOR HAD NEITHER OF THE TWO SHAPE-OF-THE-DEAL READS THE FINDER ALREADY EARNED

A direction from the owner, not a bug report: stop asking whether this cluster (`/`,
`/roster`, `/plan`, `/ledger`, `/trade`, `/trade/finder`, `/values`, `/rank`) looks
right and start asking whether each page answers a question a real dynasty manager
actually has, said in a way that hands them the next move rather than more homework.

**THE RESEARCH, VERIFIED RATHER THAN ASSUMED.** Dynasty basketball/football strategy
writing and trade-calculator FAQs converge on a short, consistent list, and this round
checked it against this app's own feature set rather than treating it as a checklist to
re-derive from scratch: knowing whether you are rebuilding or contending - and the
specific failure of being stuck in the middle, "too good to get top picks, not good
enough to win," which multiple independent sources name as the single worst place in a
dynasty league to sit; valuing draft picks against known players, which every trade-
calculator vendor's own material flags as the hardest input because a pick's worth
depends on who you already are (a rebuilder should price a pick above a redraft chart,
a contender below it); judging whether a trade is fair, which is the literal first
thing every dynasty trade-calculator FAQ exists to answer, with the standing caveat
(found on more than one vendor's own site) that a market-value number is a guide, not a
verdict, because it cannot see roster fit or timeline; remembering WHY a trade was made
once a season has passed judgment on it; telling a genuinely weak roster spot from one
that only looks weak because the depth chart is thin; the "perpetual rebuild" failure
mode - a manager who announced a rebuild years ago, still holds all the youth, and is
now shopping his best young piece because it "doesn't fit the timeline" it never
actually had an exit condition for; and selling an aging asset before, not after, the
decline shows up in the numbers. All eight are dynasty-specific in the way the prompt
asked to verify - every one of them turns on the multi-year horizon a redraft league
never has to reason about.

**WHAT THE AUDIT FOUND: seven of eight pages in this cluster already answer their
question well, several of them after rounds of work earlier today (D72, D73, D74, D75,
D77) this round did not need to redo.**

- **`/` (Home)** answers "what changed and what should I do about it" with the
  revealed-vs-stated headline first, contradictions surfaced in red only when real,
  and a three-step `Onward` rather than a menu (D52). Not touched.
- **`/roster`** answers "which of my spots are actually weak" with the SPOF name and
  damage share plus `depthBeyondStarters` stated as a sentence ("3 bodies short of
  filling your 9 slots"), not just a bar chart a reader has to interpret themselves -
  exactly the "real vs. cosmetic weakness" question from the research, already solved.
  Not touched.
- **`/plan`** answers "am I stuck in the middle" directly: `windowSynthesis` prints
  the number of rosters sharing your value window, and the Timeline Check names a
  `straddling` roster in red with the sentence "your assets do not agree about when you
  win" - the stuck-in-the-middle failure named above, read from data rather than
  asserted. `buildGamePlan`'s REBUILD-path move ("Sell the veterans while they still
  have value... declining assets only get cheaper") is the aging-star-timing answer,
  and the ASCEND-path move ("Hold the picks. Don't cash them yet... the classic error
  from this position is spending them a year early") is this app's own answer to
  perpetual-rebuild's mirror image - selling out too early rather than never selling at
  all. Not touched.
- **`/ledger`** answers "remember why" with one pinned card per visit (D58) rather than
  the twenty-nine-question exam it used to be, and Home's contradiction card is the
  other half of the same question - whether the reasoning held up. Not touched.
- **`/values`** and **`/rank`** each state plainly, in their own copy, what they are
  FOR (`/values`: "a transparent, tunable model, not a scraped market"; `/rank`: the
  banner stating that whatever is saved here is what the Trade Finder actually prices
  against) - the exact "is this reachable and does it say what it's for" bar D51 set.
  Not touched.
- **`/trade/finder`** is the pick-valuation and trade-fairness answer at its most
  complete: dossier-driven partner reads, TCI/RFI printed at the point a trade is
  actually being weighed rather than only on a page admired in isolation, and - as of
  today's earlier D75/D77 - both the Fragility note and the Positional Leverage shift
  on every suggested package. Not touched.

**THE ONE REAL GAP: `/trade` - the page where a manager evaluates a SPECIFIC deal,
most often one someone else proposed to them, which the research above found is the
single most common real request a dynasty trade tool gets - carried the thesis (D6)
but neither of the two shape-of-the-deal reads its sibling page already had.**
`evaluateTrade` (`lib/trade/index.js`) has always returned `yourBet`/`theirBet`/
`keyAssumption`/`historyCheck`/`consolidationNote`/`agencyNotes`, and `/trade/finder`'s
`PackageDetail` reuses that exact function so a hand-built deal and a suggested one
read identically (the comment on that component says so explicitly). But `findTrades`
(`lib/tradefinder/index.js`) layers TWO more reads on top of every suggested package
before it reaches the finder - `packageFragilityNote` (does this deal make the season
lean on fewer names or more) and `packageLeverageShift` (D77, today) - and neither
layer ever touched `evaluateTrade` itself. So a manager who typed their OWN proposed
deal into `/trade` got a full thesis and no answer to "does this concentrate my season
onto one man" or "what does this do to my positional depth," while the exact same deal
priced through the finder's suggestion path got both. The two reads existed, were
already proven safe (D6/D19-compliant, real fixture-league tests, shipped hours
earlier), and simply never reached the page a manager is most likely to open with a
real trade already in hand.

**THE FIX, and why it cost no new derivation.** `valueSide()` (the function that turns
a give/get side into priced assets) already builds exactly the `{kind, id, value}`
shape both `packageFragilityNote` and `packageLeverageShift` want; it was one line short
- `position` was never carried onto a player asset, because nothing had needed it
before. Added, read-only, from the same player record `age` already reads. With that,
`evaluateTrade` calls both functions directly on its own already-computed
`give.assets`/`get.assets` and attaches `fragility`/`leverageShift` to its return value,
mirroring `buildAgencyNotes`'s existing guard (`h.me.rosterId == null` -> both `null`) -
the identical pattern this file already uses one function below. `components/
TradeBuilder.jsx` renders them exactly as `/trade/finder`'s `PackageDetail` already
does - the same title wording ("What it takes off one man" / "What it puts on one
man"), the same `Positional Leverage` link to `/lab/leverage`, no new color, no new
component pattern. `null` on both when the shift is too small to clear either metric's
own noise floor (the same `SPOF_SHIFT_MIN`/`LEVERAGE_SHIFT_MIN` thresholds, unchanged) -
an omitted block is honest; a "no change" block on a page that already runs one
Evaluate click per look would be exactly the clutter this app keeps refusing to ship.

**WHY THIS NEVER TOUCHED `app/api/`, respecting this round's own boundary.**
`/trade`'s evaluation is a client component (`TradeBuilder.jsx`) that posts to
`POST /api/trade`, which does nothing but `NextResponse.json(evaluateTrade(h,
parsed.data))` - the whole returned object, no field allowlist. Every field this round
added to `evaluateTrade`'s return value therefore reaches the client through that route
completely unchanged, with zero edits to `app/api/trade/route.js` or anything else
under `app/api/`. The two functions reused (`packageFragilityNote`, `packageLeverageShift`)
live in `lib/tradefinder/`, not `lib/db.js`, not `lib/history.js`'s caching, not
Prisma - none of the ground the parallel backend-audit round owns. Both cost one
league-wide pass each (`leagueReplacementValue`, `leaguePositionPools`), which is the
identical cost class `buildHistoryCheck` already pays one line above inside the same
function (a `leagueTimelines` pass) and the identical cost class D75/D77 already
accepted on the finder side - not a new tier of expense, one more pass of the same one.

**Considered and rejected:** editing `app/api/trade/route.js` to shape the response -
unnecessary once the fields live on `evaluateTrade`'s own return value, and out of
scope for this round regardless; a NEW `/trade`-specific derivation of either read -
would be the exact "second answer to a question the app already answered" failure
SHELVED.md's S6 entry documents, for a fact two existing pure functions already state
correctly; surfacing an "asset hoarding" warning as a new labelled feature - the
research's perpetual-rebuild failure mode is already answered by `/plan`'s ASCEND-path
"don't cash picks early" move and REBUILD-path "sell veterans while they still have
value" move, which name the SAME failure from both ends without needing a new signal
invented to restate it.

**Verified.** `pnpm lint` clean. `pnpm test`: baseline was 1045 passed (62 files); now
**1051 passed (62 files)** - the +6 are in `lib/trade/trade.test.js`, covering the new
fields always being present (`toHaveProperty`) rather than absent, the real fixture-
league fragility direction in both directions (selling the SPOF relieves it, a
three-for-one consolidation creates one), the position(s) named on a real multi-piece
leverage-touching package, an explicit `null` on both for a pure pick-for-pick swap,
and the banned-verdict-word check (D6, D19) - reusing the exact player names and
directions `lib/tradefinder/fragility.test.js`/`leverage.test.js` already pinned against
this fixture, deliberately, rather than re-deriving new fixture assertions for
arithmetic already proven elsewhere. `pnpm build` succeeds after `rm -rf .next`. Full
`pnpm e2e` (`rm -rf .next` first): **78 passed**, zero failures. Screenshotted at 390px
in both themes against `/trade?give=p1&get=p24,p23` (Luka Doncic out, De'Aaron Fox +
Darius Garland in - the real fixture-league SPOF-relief case) after clicking "Evaluate
trade," confirming both new blocks render with no second accent colour (D47, D61,
D64) - the one link either block adds (`Positional Leverage`) uses the same
`text-accent-text` treatment the finder's own version already uses. `axe-core` clean
in both themes against the same evaluated state, which sits outside `ALL_SURFACES`'s
static-route sweep (the blocks render only after a client-side Evaluate click), so this
round scanned that state directly rather than relying on the registry-driven CI sweep
to reach it.

**A backend-shaped note for the parallel audit, not acted on here.** `/trade`'s
evaluation round-trips through `POST /api/trade` on every Evaluate click, re-pricing
every asset and re-running two league-wide passes from a cold `getLeagueHistory()` call
each time - `/trade/finder`, by contrast, computes everything once per server-rendered
page load with no client round trip at all. Both were within this round's own
boundary; the round trip's cost profile is not - it touches `app/api/` and whatever
`getLeagueHistory()`'s own caching does under repeated calls, which is exactly the
ground the parallel backend/architecture round owns this same day. Named here rather
than touched.

## D80. THE DESK REOPENED THE LEAK D35 SEALED - a stranger's first screen was showing the deploy owner's identity again, one layer of chrome over

The owner asked every feature to be re-examined against one question: does this solve
a real problem a dynasty manager actually hits, shown in the most intuitive way? This
round's assignment was the one surface that question matters most for and gets tested
least, because nobody who already knows the app ever sees it again after their first
visit: `/teams`, `/claim`, `/claim/invalid`, `/more`, and the Desk's own chrome on a
session that has picked nobody yet.

**WHAT A FIRST-TIME VISITOR ACTUALLY EXPERIENCES TODAY, WALKED THROUGH.** A stranger
opens the deployed link with a completely fresh browser - no cookies at all.
Middleware (`lib/auth/entry.ts`, D35) reads that there is no `parquet_roster` cookie
and bounces them to `/teams` before any other page can render, deep link preserved.
`/teams` greets them with "Whose team are you?", a one-line explanation of what
picking a team actually does, a "your Sleeper username" box for a real leaguemate, a
search box and a scrollable list of all fourteen teams - each row already showing a
name, owner, live record, one of three plain-English roster-window words
(win-now/rebuilding/balanced), up to three dossier tags and a total value, so this is
not fourteen anonymous options; a returning visitor's own row is checkmarked, a
stranger's is not. Below the list, "New to Parquet?" links to `/about`, which explains
the app's whole vocabulary in plain language and states outright that "switching
chairs is public and free." Tapping a team POSTs the choice, sets the lens cookie and
returns to whatever page they were actually headed for. All of this was already
correct and is UNCHANGED by this round - it was screenshotted and re-verified, not
assumed, and none of the "14 unlabeled options" or "assumes context you don't have"
failure modes this brief warned about were actually present.

**THE REAL GAP was one level of chrome below the page content, in the one component
that was never in front of D35 when it shipped.** `getDeskData()` (`lib/desk.ts`), the
Desk's persistent bottom bar shown on literally every route including the three that
must render with NO lens at all (`/teams`, `/about`, `/claim/invalid` - the open
prefixes `needsEntryPick` carves out), calls `getLeagueHistory()` and reads `h.me`
unconditionally. `h.me` falls back to the DEPLOY OWNER'S own roster whenever there is
no lens cookie to read (`resolveMe`, `lib/history.ts`) - which is exactly the leak D35
was written to stop, for page content. The Desk did not exist when D35 shipped; it
arrived later, across D41/D52/D53/D65, and nobody re-ran D35's own reasoning against
it. Curled with a genuinely cookieless request and confirmed by screenshot: `/teams` -
the one page whose entire job is asking "whose team are you?" - rendered a persistent
chip at the bottom of that same screen reading the deploy owner's real team name
("Parquet Kings" in the shipped fixture, "5-Year Plan" against one internal fixture
variant), with his actual record and league standing ("5-15 · 2025 final · 12th of
14") printed as fact, plus a "Switch team"/"Open my team in Sleeper" menu behind it -
full chrome for an identity nobody in the conversation had chosen yet, one screen
below a headline asking them to choose one. The exact bug D35's own writeup describes
("a browser with no lens cookie was silently rendered the deploy owner's seat - his
headline, his record"), reopened by a component that inherited the same fallback
without inheriting the guard.

**THE SECOND, SMALLER GAP: reversibility was true and undiscoverable.** Switching
teams later is real and reversible - `TeamPicker.choose()` is a plain POST that can be
called again from anywhere, any number of times, and the Desk's seat-chip popover
(`Switch team` -> `/teams`) is the mechanism, already built. But nothing on `/teams`
itself said so; a first-time picker had to already know that popover existed (which
requires having picked a team once, i.e. having already made the choice) or click
through to `/about` to read "switching chairs is public and free" before ever seeing
that reassurance next to the actual decision. The one moment this mattered most - a
stranger staring at fourteen options, unsure if this is a one-shot commitment - was
the one place it wasn't said.

**THE FIX, both scoped to exactly what was broken.**

1. `lib/desk.ts`: `getDeskData()` now asks the identical question
   `needsEntryPick` already asks - `readLensRosterId()`, a cookie read, no corpus
   involved - BEFORE calling `getLeagueHistory()` at all, and returns
   `{ seat: null, status: null }` when there is no lens yet. Not merely "hide the
   identity after fetching it" - the corpus is never touched, so a stranger's neutral
   chrome does not even depend on the league provider being reachable.
2. `components/Desk.tsx`: the context row now has three states instead of two -
   `data.seat` present (unchanged: the real seat chip and status link), `data` present
   but `data.seat` null (new: a plain "No team picked yet" label, no avatar, no fake
   name, and one honest link - "Pick your team" -> `/teams`, using the same
   `text-accent-text` treatment every other in-body CTA already uses, no new colour),
   and `data` null (unchanged: the existing quiet "Parquet" fallback for a corpus
   outage). The seat-chip popover trigger and its contents are both gated on
   `data?.seat` now, since "Switch team"/"Open my team in Sleeper"/Settings behind a
   chip presenting nobody's identity was the same leak restated as a menu.
3. `app/teams/page.jsx`: the picker's own subtitle now says the thing that was
   previously only on `/about` - "Nothing here is permanent: tap your team's name at
   the bottom of any page to switch to a different one later" - stated at the moment
   the choice is actually being made, not one click removed from it.

**WHAT WAS CHECKED AND LEFT ALONE, because it was already right.** `/claim`'s one GET
route: signs and verifies a seat token, sets the seat cookie and the lens together
(best-effort on the lens, so a corpus hiccup never loses the unforgeable half), and
redirects home or to `/teams` - a real, understandable job with no confusing extra
step, and legacy (no `AUTH_SECRET`) deployments correctly skip the whole notion rather
than erroring. `/claim/invalid` states plainly that the link did not verify, refuses
to guess WHY (expired vs. tampered vs. old secret - D19's discipline, applied to a
copy string rather than a metric), offers a fresh-link path and an explore-without-one
path, and needed no changes. `/more`: reachable from the Desk drawer's own "See
everything on one page" link, correctly redirects through `/teams` first for a lens-
less visitor with the deep link preserved (confirmed by screenshot - `/more` bounces
to `/teams?next=%2Fmore` and returns to `/more` once a team is picked), and its
no-JS/crawler role (stated in its own page comment) is intact. None of D6 (no
verdicts) or D19 (no speculation beyond data) needed enforcing here - this cluster's
copy was already either factual or, per the one gap above, simply missing; no
judgment language was ever present to strip out.

**Verified.** `pnpm lint` clean. `pnpm test`: baseline was 1045 passed (62 files); now
**1048 passed (63 files)** - the +3 are `lib/desk.test.js`, pinning that a missing or
garbage lens cookie returns `{ seat: null, status: null }` and never calls
`getLeagueHistory` at all (the load-bearing half - not just a masked identity, no
corpus dependency), and that a real lens cookie still reads the chosen roster's own
identity through the unchanged path. `pnpm build` succeeds. Full `pnpm e2e` (`rm -rf
.next` first): **78 passed**, zero failures - `primeLens` cookie-primes every other
spec in the suite, so none of them touch the branch this round changed, and that
blast-radius assumption was verified rather than trusted. `axe-scan` clean in both
themes on `/teams`, `/about`, `/claim/invalid` and `/more`, scanned with a genuinely
cookie-less browser context (not the usual `primeLens`-style helper, which would have
hidden the exact bug this round found). Screenshotted at 390px in both themes against
a fresh context with zero cookies: the Desk now reads "No team picked yet · Pick your
team" on all three lens-less pages in both themes, and a returning visitor's normal
seat chip ("Parquet Kings · 1 new decision to capture") is confirmed unchanged.

**Rejected:** hiding the seat chip's CONTENT while still calling `getLeagueHistory`
for it (the corpus dependency itself was part of the bug - a lens-less render should
not need the league provider to be reachable at all, and D35's own fix for page
content didn't need it either); a toast or banner on Home confirming "seat claimed"
after `/claim` succeeds (Home is outside this round's cluster, and landing on your own
revealed strategy and record is already a strong, wordless confirmation that the link
worked - the two are not the same problem); redesigning `/teams`' team-row density or
adding photos/avatars to the picker (explicitly out of scope - this round changes
clarity of what a choice DOES and WHETHER it's reversible, not how the rows look, and
the existing rows already carry name/record/window/tags/value, which the brief's
assumed failure mode of "14 unlabeled options" turned out not to describe); moving the
reversibility sentence into `/more` or the Desk drawer instead of onto `/teams`
itself (the moment it needs to land is the moment of the choice, not one tap away from
it - `/about` already had it and that placement was exactly the problem).
