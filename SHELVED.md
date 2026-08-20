# SHELVED

Things Parquet built, decided not to ship, and did not delete from memory.

An entry here is not a failure. Most of these were correct answers to questions that
turned out to be the wrong questions, or right ideas whose data has not arrived yet.
Each one names the condition that would bring it back, so a future round can check the
condition instead of re-litigating the argument.

**How to read this file.** It is written for whoever is standing here in six months
wondering whether to revive something, not for whoever wants to know what changed last
week — that is `DECISIONS.md`'s job. So every entry answers three questions in order:
what it was, why it went, and what would have to be true for it to come back. Nothing
here was deleted from the repository's history; every line of it is still in the commits
that shipped it, and the entries name the files so `git log --` finds them.

Shelved by committee review, 2026-08-10, against `main` @ `5e8dd02`. Executed in the
same pass; see `DECISIONS.md` for the decision record.

S9 was added 2026-08-20 against `main` @ `f982cb0`, as part of the depth-chart rung
redesign. It is the first entry that records prose removed because a **drawing** started
carrying its argument correctly, rather than because the idea behind it was wrong.

S7 and S8 were added 2026-08-19 against `main` @ `4e71e51`, by owner decision rather
than by committee: *"lets shelve the ai subjective component and focus more on this
statistical call and other intuitive nuance feature set."* They are the only two
entries here that record a change of **direction** rather than a defect. Everything
above them went because it was wrong; the Analyst went because the app turned out to
be a different kind of thing than the one that wanted it.

S9 was added 2026-08-20 during the Trade Finder redesign (D97). It is a defect entry,
and the second one in this file with the same shape as S6 - a hand-tuned tag-scored
answer standing beside a searched one, with nothing pinning them together.

---

## S1. The start line — the nightly board and the ten-game log

**What it was.** `/lab/startline`, an in-season lineup surface: a seven-day nightly
board showing who plays when with back-to-backs marked, a pick-one-player ten-game log
annotated with minutes and third-quarter margins, the week's slot state as seven chips,
and a framing card explaining that the page would not recommend anybody. 1,786 lines
across `lib/lab/startline/index.ts` (497), `load.ts` (238), `startline.test.ts` (388)
and `app/lab/startline/page.tsx` (663). Never registered in `ALL_SURFACES` (D42), so it
was reachable only from `/lab`.

**Why it was shelved.** Four of five committee members voted to shelve it, from four
different lenses, and not one of the four was about correctness:

- It is **structurally wrong out of season**, and a dynasty league is out of season for
  most of the calendar. The page opens by promising *"Every other page in Parquet is the
  same when you come back. This one is not"* and then, a few lines down, reports zero
  slots left and zero player-games left above roughly seventy rows reading "played".
- It was **the app's clearest case of overclutter-by-honesty** — a page whose own
  reviewers counted more words spent refusing than describing, against a single 62px
  drawing. Every refusal on it was individually correct.
- The board and the log are **strictly worse than the Sleeper tab the manager already
  has open**: no projection, no ranking, no live scores. The page's own copy concedes
  it — *"the rows are in name order inside each night, because any other order would be
  a ranking and this page does not rank."* Right principle, wrong conclusion: the answer
  was not to render an unranked list, it was not to render the list.
- It was **the worst risk-per-line in the repo**. It was the only feature depending on
  undocumented Sleeper endpoints across two different hosts; `load.ts` — which
  orchestrated the fetches, the week clamping and the live/not-live branch — had zero
  tests (the 388-line test file covered `index.ts` only); it had no e2e by construction,
  being unregistered; and it failed soft in three bare `catch {}` blocks, so a Sleeper
  shape change would have presented as a quietly emptier page rather than as an error.

The one member who did not vote to shelve was not arguing the other way: they verified
that the page's *denominators* were disclosed honestly. That is a correctness finding
and it does not conflict with any of the above.

**What was kept.** **Slot par** — the distribution of every lineup slot every manager in
this league has ever banked. It is the one genuinely distinctive thing that page held:
it tells a manager what a slot has been *worth in this league*, from data no public
source holds, while projecting nothing. It works year-round because it is history.

It now lives at `lib/lab/regret/slotPar.ts` and renders on `/lab/regret`, which already
read exactly the data it needs — `loadLockInWeek` returns all fourteen rosters for a
week, and the regret ledger was already fetching every week of the season and discarding
thirteen fourteenths of each payload. **Par therefore costs zero additional requests.**
Verified live on the 2025 season the day it moved: 2,124 scoring slots across 322
team-weeks, mean 25, median 26, p90 36, highest 64, with 126 of 2,254 slots banking
exactly nothing and 4 finishing below zero. Its tests moved with it.

Also kept: `lib/lab/regret/source.ts`, shared with `/lab/regret`, along with its memo.

**What went with it, and is worth knowing.** Three things became dead the moment the
board did, and were removed rather than left as spares:

- `loadSeasonSchedule()` in `lib/lab/regret/source.ts`, and the `ScheduleGame` /
  `ScheduleSide` types and Zod schemas behind it. This was the reader for
  `GET /schedule/nba/regular/{season}` — one of the three undocumented endpoints, on a
  different host path, ~1.05MB a season. The regret ledger never used it. The endpoint's
  quirks are still documented in that file's header if it is ever needed again.
- `sleeperMatchupUrl()` in `lib/sleeperLinks.ts`. The route is still in the verified
  route table in that file's header; only the three-line builder went.
- `LocalTime` in `components/LocalDate.tsx`, which existed for the start line's "read at
  HH:MM" stamp. Nothing else in Parquet goes stale while you read it. `LocalDate` stays.

**What would bring it back.** Either condition, independently:

1. **The season-gated rebuild.** The app is reading a live in-progress week
   (`currentLeague.status` in a running state) **and** per-week history is loaded for the
   live provider. Bring it back gated: the full board in season, and out of season a
   single line pointing at the slot-par distribution rather than a page full of zeros.
2. **A Sleeper-endpoint contract.** If the undocumented endpoints get documented, or get
   a schema smoke test that runs somewhere other than a reader's page load, the
   maintenance objection lifts and only the seasonality one remains.

There is also a standing question for the owner that this entry does not answer: whether
the start line was asked for or arrived because agents were in motion. If it was asked
for, condition 1 is the shape to rebuild in. If it was not, this entry is the end of it.

---

## S2. Home's "Since your last visit" digest panel

**What it was.** A change digest at the top of `/`, the second element on the landing
page, reporting what had moved in the league since the reader's previous visit: trades,
picks that resolved into players, and TCI or fragility shifts above a five-point
threshold. `components/DigestPanel.tsx`, backed by `lib/digest/`.

**Why it was shelved.** **It burned its own baseline on the first page view.** The panel
is what advances the last-seen marker, so first load renders *"No earlier visit to
compare against"*, and a reload thirty seconds later renders *"Nothing has moved since
just now."* For a weekly visitor the realistic steady state is a labelled empty box
occupying roughly 190px above the four numbers that are actually about their season.

D40 already established that a zero in the offseason is anti-information and fixed it in
`StreakPanel`. The digest was still doing it, on the front page. An empty box that
explains why it is empty is still an empty box. Two committee members reached this
independently, from different directions — one measuring the page, one reading it cold.

**What was kept.** The derivation. `lib/digest/` is untouched: the marker codec, the
diff, `currentMetrics`, `resolvedPickTimeline` and `/api/digest-seen` all still work,
and `homeNext()` still reads "did anything move" to decide whether Home's onward rail
should point at `/deals`.

What replaced the panel is `components/DigestBeacon.tsx`, which **renders nothing** and
exists only to keep posting the marker. That is deliberate and it is the difference
between a shelf and a bin: freeze the marker and "did anything move" rots into "yes,
always" for every returning reader, and a revived panel would start from no history at
all. The panel is off; the memory is still being written.

**What would bring it back.** The baseline is anchored to something other than "last
page view" — a stored last-*session* timestamp with a floor of, say, twelve hours — so
that when the panel appears it has something to say. Until then it should render
**nothing at all** rather than a labelled empty state.

**Note:** this is also the natural delivery vehicle for posture-drift alerts, which the
review ranked fourth among the unbuilt ideas. Fixing this baseline is a prerequisite for
that idea, not a separate task.

---

## S3. `/drafts` — "Around the league"

**What it was.** A block at the foot of `/drafts` listing twelve of the other managers'
resolved traded picks, each row linking to that pick's slot on its draft board. It was
headed by its own truncation — the review recorded it rendering as "12 of 56".

**Why it was shelved.** Neither complete nor yours. It sat at the bottom of an already
long page, with no filter and no reason to care which twelve, and
`/drafts/grades` already answers "how did that class go" properly. A sample that
announces its own incompleteness is not a view. The page above it is *your* pick
lineage; this was a different page's content, truncated, wearing the same styling.

**What would bring it back.** Re-aimed at a question a reader actually has while on
their own draft page: **which players did other managers take with *your* picks?** The
lineage data already supports it — `getTradedPickLineages` carries `fromRoster`,
`usedByName` and `playerName` on every row, which is exactly the join — and the answer
would be specific to the reader rather than an arbitrary twelve.

**Revived.** `/drafts`' own "Picks you traded away" section — which predates this
shelving and was never the thing shelved — turned out to already be running that exact
join: `gave = all.filter(l => l.fromRoster === me)`. Complete (every one of your
resolved outbound picks, no truncation) and specific to the reader by construction, it
only lacked the "drafted by" fact stated plainly on every row (it previously surfaced
only on the rarer multi-hop mismatch) and a line naming what the section answers. See
`DECISIONS.md` for the entry.

---

## S4. `windowForRoster()`

**What it was.** A single-roster convenience wrapper in `lib/metrics/window.ts`,
returning one roster's value window from one `getTimelineProfile` call, without walking
the league.

**Why it was shelved.** **Zero production callers** — verified by grep across the repo;
its only caller was one assertion in `lib/metrics/window.test.ts`. And its one
distinguishing behaviour was *disagreeing* with the function every page uses: costing a
single profile meant it carried the **absolute** posture fallback rather than the
league-relative one, which the review measured as differing on 6 of 14 rosters on the
live league. Its own docstring warned about this, honestly — which is exactly the
warning the next person in a hurry does not read.

A dead convenience function that gives a different answer than the live one is a loaded
gun, not a spare. A note now stands where it stood, pointing at `windowsByRoster()`.

**What would bring it back.** A caller that genuinely needs a single-roster window
**and** a signature that makes disagreement impossible — i.e. one that takes
`leagueDurations` as a required argument. If it comes back without that, it should not
come back.

---

## S5. `lib/providers/stats/`

**What it was.** Three things behind one directory: `FixtureStatsProvider` (a synthetic
implementation), `ExternalStatsProvider` (a stub that threw a "not configured for v1"
error on every call), and `getStatsProvider()`, a factory returning the fixture one.
All implementing the `StatsProvider` interface declared in `lib/providers/types.ts`.

**Why it was shelved.** **Zero inbound edges**, production or test — verified by grep for
`providers/stats`, `getStatsProvider` and both class names, which found nothing outside
the directory itself and four lines of documentation. It implemented an interface D4 says
v1 does not use, and the only thing it actually did was make the codebase look as though
per-player stats were plumbed when nothing had ever asked for them.

**What was kept.** The `StatsProvider` interface in `lib/providers/types.ts`. It is a
reasonable forward declaration of a shape D4 committed to, it costs nothing, and it now
says out loud that nothing implements it. The fixture implementation of an unused
interface was the wrong half to preserve.

**What would bring it back.** A version that actually consumes `StatsProvider` — most
likely whichever round loads per-week history for the live provider, which is also the
unblocker for S1's season-gated rebuild.

---

## S6. `tierOf()` — the second tier system

**What it was.** A function in `lib/valuation/index.ts` mapping a value to a tier name
through six hardcoded literals (7000 = Franchise, 4500 = Cornerstone, 2800, 1500, 700,
250), consumed by the trade evaluator and the analyst corpus and re-exported through
`lib/gameplan`.

**Why it was shelved.** It was a second, perishable answer to a question the app already
answered from the live distribution. The literals were not arbitrary when written —
7,000 sat cleanly below a real break at 7,133 — but the age-curve recalibration moved
that break to 7,605 and left the literal where it was, so **Alperen Şengün (7,179) and
Luka Dončić (7,112) rendered "Franchise" on a trade receipt and "Cornerstone" on
`/values`, on the same afternoon.** Nothing threw. No test compared the two systems; the
review measured 126 of 1,745 priced players disagreeing.

The fix was not a better literal — a better literal has the same expiry date. It was
deleting the second system, so that a tier label can only ever come from the
distribution it describes.

**Already executed** in `c997ae3` (PR #11), before this review. `lib/rankings/leagueTiers.ts`
is the single entry point and carries the full argument in its header; a comment stands
where `tierOf` did. It is recorded here because it is the canonical example of the
failure mode this document exists to prevent, and because a reader six months from now
should find it in the same place as the rest.

**What would bring it back.** Nothing. If a surface needs a tier label it calls
`leagueTierLabel(h)`. A future absolute threshold on a rescalable scale should be
treated as a defect on sight.

---

## S7. The Analyst - the app's whole AI/subjective component

**What it was.** `/analyst`, and the module behind it. A 20-line page over a chat
surface (`components/AnalystChat.jsx`, 161 lines) over an API route
(`app/api/analyst/route.js`, 37 lines, zod-validated, `maxDuration = 60`) over
`lib/analyst/` - 269 lines of corpus builder and runner in `index.js`, a 36-line
`system-prompt.js`, and 82 lines of test. 605 lines all told, plus a registry entry, an
icon, its own three-step onward block, one inbound onward step from `/ledger`, and one
branch of `homeNext`.

What made it interesting is worth restating precisely, because it was not a wrapper.
`buildCorpus()` compiled the viewer's revealed strategy, their stated-vs-revealed
contradictions, every transaction they had personally annotated **with their own
recorded reasoning quoted verbatim**, their last 25 trades, their twelve most valuable
players priced on the same league-derived tiers `/values` uses, and a one-line
behavioral read on all thirteen leaguemates - into one text block, on the D7 premise
that three-plus seasons of a fourteen-team dynasty league fits in one context window
and therefore needs neither fine-tuning nor a vector database. That premise was
correct. `system-prompt.js` then named sycophancy as the product's primary failure
mode in a comment addressed to whoever might later soften it, and instructed the model
to lead with the disconfirming case. Per D17 it spoke plain OpenAI-compatible HTTP over
`fetch`, so it ran against Groq, OpenRouter or a local Ollama with no SDK and no vendor
lock-in, and with `LLM_BASE_URL` unset it fell back to a deterministic audit
(`rulesFallback`) rather than to an error.

**Why it was shelved.** Not because any of that was wrong. Because the app it belonged
to no longer wants it. Parquet's direction is a statistical call derived from **this
league's own real history**, plus the intuitive nuance that history supports, and the
Analyst was the one surface whose output was neither: it was prose *about* the
derivations, generated somewhere else, by something with no access to the league beyond
the paragraph Parquet handed it.

Three consequences of keeping it that the direction makes unacceptable rather than
merely awkward:

- **It was the only non-deterministic surface in the app.** Every other page is a pure
  function of the corpus: same history, same page, forever. `/analyst` at
  `temperature: 0.4` could answer the same question two ways on the same afternoon, and
  the app's entire claim on a reader's trust is that its numbers are reproducible and
  its methodology is published.
- **It was the only outbound dependency other than the league provider itself** - the
  only one that needed a key, the only one with a 45-second timeout in the request
  path, and the only one whose being down produced prose rather than an error.
- **It was the app's only privacy exposure of the one genuinely private thing it
  holds.** Every other number Parquet shows is league data the whole league can already
  read. The ledger annotations are not, and the corpus quoted them verbatim into a
  third-party request body. `lib/analyst/index.js` carried a five-line comment guarding
  exactly one leak in that (a trade partner's note on a shared `transactionId`) with a
  test pinning it, which is the right amount of care and also a standing tax that the
  removal now settles permanently. Not-configured-by-default is a weaker guarantee than
  not-possible, and the app now has the stronger one.

**The rescue question, and the answer: nothing needed re-homing.** `rulesFallback()` is
the half of this module that arguably belonged to the new direction rather than the old
one. It is not an LLM at all: it is a rules-based audit over `getStrategyReport` and
`getAllDossiers` that routes a typed question to a manager's read, or to a
posture-by-season line, and otherwise leads with the reader's first contradiction. S1's
precedent says to look hard for the slot-par-shaped piece and move it at zero cost.
**Looked, and there is no such piece here** - every finding it computed already renders
on a surviving surface, most of them more completely than the fallback rendered them:

| What `rulesFallback` said | Where it already renders, today |
|---|---|
| `contradictions[0].narrative`, as "First, the uncomfortable part" | `app/page.jsx` renders **two** contradiction cards above the fold, each with the full narrative plus `said:`/`did:` season tags and a link to the moves. Home leads with them ahead of the four season figures |
| the same gap, as a caution before acting | `lib/gameplan/index.js` puts it **first** in `/plan`'s caveats: "decide whether the plan changed or you're just chasing" |
| the same gap, at the moment of a deal | `lib/trade/index.js` puts it on the `/trade` receipt: "don't repeat the pattern blindly" |
| "you've annotated only N decisions" | Home's quiet branch states the count and links to it; the capture badge above it counts what is outstanding |
| `postureBySeason`, one line | `/managers/[rosterId]` and `/managers/former/[ownerId]` render every season as its own chip |
| `report.findings`, as bullets | Home's "What your record shows" fold renders **all** of them, untruncated |
| a named manager's `read` + `approachTips` | `/managers`, `/managers/[rosterId]`, `/managers/former/[ownerId]`, and `/trade/finder` on the suggested partner |

The one thing genuinely unique to it was the **routing** - type a name, get that
manager; type "am I rebuilding", get posture. That is a chat affordance, which is to
say it is the shelved half, and the Desk's search (`app/api/search/route.js`) already
resolves a manager's name straight to their dossier. Re-homing a router whose every
destination is one tap away would have been thoroughness for its own sake. **So the
correct rescue here was none, and a fair reading of this entry is that
`rulesFallback` was always a *shadow* of the app's real surfaces rather than a feature
of its own** - which is also why it never got a test of its own while `buildCorpus`
did.

**What went with it, and is worth knowing.** Three orphans, on S1's rule that dead code
created by a shelve is part of the shelve:

- `lib/observability/trace.js` in full. It has its own entry below (S8) because its
  revival condition is not this one's.
- The `LLM_BASE_URL` / `LLM_API_KEY` pins in `playwright.config.mjs`'s hermetic
  webServer env. They existed to guarantee the suite never dialled an inference
  endpoint; there is no longer an endpoint to dial.
- `"/analyst": MessageSquareText` in `components/nav-icons.jsx`. Noted because
  `iconForSurface()` falls back rather than throwing, so a stale entry there is
  invisible to every test in the repo.

**What was verified as still used, and left completely untouched.** Everything
`lib/analyst/` consumed is load-bearing elsewhere, confirmed by grep rather than
assumed. Counting `import ... from` statements only, after the removal:
`getStrategyReport` has three remaining callers (Home, `lib/gameplan`, `lib/trade`);
`getAllDossiers` has one (`/managers`), with six more modules reaching `lib/dossier`
through `buildDossier` instead (`/managers/[rosterId]`, `/managers/compare`,
`/managers/former/[ownerId]`, `/teams`, `lib/gameplan`, `lib/tradefinder`);
`lib/principals` has 40 importers, `lib/derive/describe` 20,
`lib/valuation` 19; `lib/rankings/leagueTiers` has three (`lib/rankings/tiers`,
`lib/trade`, `lib/valuation`) and remains the single entry point S6 made it;
`lib/history` is the corpus every page builds. The module was a **consumer** of the
app's engines and never a producer for them, which is why its removal is a subtraction
of 605 lines and not a refactor.

**One thing was moved rather than dropped.** `/ledger`'s third onward step pointed
here, and `homeNext`'s `contradicted` branch pointed here. Both now point at `/plan`,
which is not a shrug: `/plan` is the surface that already leads its caveats with the
stated-vs-revealed gap, so it is where the argument the Analyst opened with actually
lives now. `lib/nav.test.js` gained the test that would have caught a *forgotten* one
of those links, which nothing in the suite could do before - `resolveSteps()` falls
back to the raw href for an unregistered destination, so a dangling step rendered as a
link captioned "/analyst" and stayed green.

**What would bring it back.** Not a better model and not a cheaper one. Both of these,
together:

1. **A question the derivations provably cannot answer.** The Analyst's real job was
   never the summary, which is what `rulesFallback` proved by summarising the same
   material without a model. It was the *hypothetical*: "if I trade this pick for that
   player, does that contradict what I said in 2024?" Nothing in the app answers a
   counterfactual phrased in free text, and `/lab/counterfactual` answers only one
   fixed counterfactual. If a named, recurring, real question turns out to need free
   text as its input, that is the shape to rebuild in - narrow, one question, not a
   chat box.
2. **The private half stays out of the prompt.** A revived version grounded in the
   ledger's verbatim reasoning re-creates the exposure above. Either it is grounded in
   derived findings only, or it runs somewhere the viewer owns end to end (a local
   endpoint by construction, not by configuration).

Absent both, the honest position is that the statistical surfaces made this one
redundant, and this entry is the end of it.

---

## S8. `lib/observability/trace.js` - LangSmith tracing for LLM runs

**What it was.** A 56-line, zero-dependency LangSmith tracer: `traceLLMRun()` posted
one completed run to `https://api.smith.langchain.com/runs` after an LLM call
resolved, gated on `LANGSMITH_API_KEY`, capped at 3 seconds, and swallowing every
failure. Deliberately not the `langsmith` SDK, on the reasoning in its own header:
one traced call site does not justify a dependency. It also exported
`tracingEnabled()`.

**Why it was shelved.** `lib/analyst/index.js` was its only caller - two call sites,
the success path and the failure path, and it traced both, which was the right design
because a traced error without its prompt is the half you cannot debug. With S7
executed it has **zero callers**, and `tracingEnabled()` had zero callers even before
that. It is now a tracer of a kind of call the app no longer makes. S4 is this file's
standing argument about what a zero-caller function is, and leaving a whole zero-caller
module behind while citing S4 would be incoherent.

Worth recording separately rather than as a footnote to S7, because the careful part of
it was not the code. `.env.example` carried an eight-line warning above
`LANGSMITH_API_KEY` explaining that a traced run carries the **full** prompt, that the
prompt carries the viewer's own captured ledger reasoning, that this is the one
genuinely private thing in the app, and that turning tracing on therefore hands it to a
third party. That analysis is the reusable artifact here. It should be re-read, not
re-derived, by whoever next wires observability into anything that sees a ledger note.

**What would bring it back.** Any second outbound model call anywhere in Parquet, S7's
revival included. It is a good, small, honest piece of infrastructure and there is no
argument against the code itself; it is simply an observer with nothing left to
observe. If it returns, the two things to carry back with it are the awaited (not
fire-and-forget) POST, because serverless reclaims the instance once the response
returns and a dangling promise silently drops most traces in production, and the
privacy warning above.

**Note on the env vars.** `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`,
`LANGSMITH_API_KEY` and `LANGSMITH_PROJECT` now have no consumer anywhere in the
repository. `.env.example` says so out loud instead of continuing to document them as
though they worked, because an operator who already has them set in a real `.env` or in
Vercel's project settings needs to learn why they stopped mattering rather than assume
a bug. Nothing was removed from any actual `.env`; that file is gitignored and is the
operator's.

## S9. Five pieces of depth-chart prose, and the two fields that fed them

**What they were.** Five things on `/depth/[team]` and in `lib/depth/index.js`, removed
in one pass because they share one cause. They are recorded together rather than as five
footnotes because the argument against each is the same argument, and a future round
tempted to restore any one of them should meet the whole of it:

1. **`DepthGroup.contiguous`** - a computed boolean, "the orders are exactly 1..n with no
   gap and no repeat", exported in the typedef. Read by **zero** rendering code anywhere
   in the repository (verified across `app/`, `components/`, `lib/`); its only readers
   were its own tests. Its measurement - 117 of 149 live groups are non-contiguous - is
   the fact worth keeping, and that already lives in the module header and `API_NOTES.md`.
2. **The per-group tie-explanation paragraph.** Under every group with a duplicate order:
   *"Sleeper gives two or more of these the same order, so they are level rather than
   ranked. The order they print in here is alphabetical, which claims nothing."*
3. **`DepthGroup.hasTies`** as a separately exported concept - the boolean that paragraph
   was conditioned on.
4. **The duplicated name lists inside the anchored player's standing sentence.** *"Sleeper
   lists 2 ahead of him at C (Walker Kessler, Sandro Mamukelashvili)"*, with the same two
   men drawn in the ladder about 90px below.
5. **The first paragraph of "Where this chart comes from"** - *"This is Sleeper's depth
   chart, not Parquet's reading of one..."* - and **the `<Tag tone="accent">Him</Tag>`**
   on the anchored player's row.

**Why they went.** The rungs took over a job the prose was doing badly. Every one of
these five existed to hold up a geometry that was making the opposite claim: the surface
drew `group.entries` as a flat stack of equal rows, which every reader reads top-down as a
ranking, and then argued underneath that they should not. The paragraph could not win that
argument, because a reader has already concluded that the top row is the starter before
reaching the sentence saying they cannot know that - and on 18 of the 149 live groups
there is no order 1 at all, so the top row was a player Sleeper never called first.

`DepthGroup.layers` moved the partial order into the data (one array per distinct stated
order, tied players sharing an array) so the shape the surface receives cannot express
"kth". Once the tie is drawn as a shared rung, item 2 is restating the picture and item 3
is a boolean that has to agree with a shape - a second source of truth that can drift from
the first. Item 1 was already dead before this round. Item 4 was two copies of one list at
90px separation, and the ladder is the better copy: it shows the relation as geometry,
marks who holds each man, and links each name onward. Item 5 was pure repetition - the
paragraph restated the page's own subtitle at three times the length, and the anchor was
already marked four other ways (`aria-current`, the accent-wash cell, the `h2` naming him,
and the standing sentence about him), so a fifth marker was the redundancy rather than the
safety net. Its accent budget went to marking the viewer's OTHER players instead, which
was previously stated in text only.

**What did NOT go, deliberately.** The standing **sentence** survives, reduced to counts:
*"Sleeper lists 2 ahead of him at C, and one player is level with him on the same
number."* It is the only channel that survives leaving the screen - copied into a group
chat, read aloud, or read before the ladder paints - and deleting it would have made the
page's whole reading visual, which is the failure `lib/refusal.js` was written about one
layer down. The `<Disclosure>` the deleted paragraph sat inside is untouched and its three
caveat paragraphs are intact; that is the caveat layer and it is on a never-remove list.

**What would bring them back.** For `contiguous`: a surface that genuinely needs to
distinguish "1..n exactly" from every other shape - and note that no such surface has been
proposed in nine rounds, and that on the live payload it would be false on 117 of 149
groups, so it is a flag that is almost always off. For the tie paragraph and `hasTies`: a
reader study showing the shared rung and its brace are not read as "level" - at which
point the answer is probably a better mark rather than a return to prose under a list that
contradicts it. For the name lists in the sentence: a channel where the ladder cannot
render at all but the sentence can, and where the reader needs identities rather than
counts. For the `Him` tag: any change that removes one of the anchor's other four markers.

---

---

## S10. The pick-agency split bar - a ratio that improved as you gave your future away

Shelved 2026-08-20 by owner decision, against `main` @ `f982cb0`. Replaced in the same
pass; see `DECISIONS.md` D98.

**What it was.** `SplitBar` in `components/PickAgencyPanel.jsx`: a two-segment bar, 300
by 14, accent for the picks whose slot your own seasons order and the neutral mark for
the rest, with `summary.controlled / summary.total` setting the split. Under it a
two-ended legend (`8 yours · 3,777` / `6 on others · 9,511`) and, above it,
`summary.headline` stating the same ratio in prose: *"8 of 14 picks are set by your own
seasons. The other 6 ride on somebody else's."* It was the smallest chart in the app and
obeyed every house SVG rule it was meant to: fixed viewBox, integer coordinates, tokens
for colour, one full-sentence aria-label, no library.

**Why it was shelved.** The drawing was fine. The fraction was backwards.

The denominator is the picks you **hold**. The numerator is the subset of those whose slot
your own seasons order. So trading your own first away removes it from both ends of the
fraction, and trading somebody else's pick **in** adds to the denominator alone - the bar
therefore goes UP as you divest your own future and DOWN as you accumulate other people's.
It was presented as a reading of how much of your own future you still decide, and it
measured something closer to the reverse. Measured on the live league at the time of
shelving:

| roster | its own picks still at home | the bar read |
| --- | --- | --- |
| roster 1 | 4 of 9 | 80% yours |
| roster 3 | 7 of 9 | 50% yours |

Roster 1 had sent away more than half its own future and was shown a fuller accent segment
than roster 3, which had sent away two picks. No caption fixes a monotonicity that runs
the wrong way.

The second, smaller fault is what the bar did at the edges. A full accent segment is a
strong visual claim, and on a degenerate split it was being made over a set with one kind
of thing in it - "100% yours" and "you hold one category of pick" are not the same
statement, and the bar could not tell them apart. Measured across all fourteen rosters,
the degeneracy depends entirely on which set you count:

| denominator | rosters reading 100/0 or 0/100 |
| --- | --- |
| firsts only, the axis a dynasty manager reads | 8 of 14 |
| live picks only, which is what the list below the bar showed | 3 of 14 |
| every held pick, which is what the bar actually divided | 0 of 14 |

Worth recording precisely, because the shelving brief carried the figure as "9 of 14" and
that number is not reproducible against any of the three denominators. The nearest true
statement is 8 of 14 on firsts. The monotonicity fault above is the load-bearing one and
does not depend on this at all.

**What replaced it.** Not a fixed bar and not a Venn diagram: three rows, no SVG. Rows one
and two sum to what your own seasons decide, rows one and three sum to what you hold, and
the first row is in both. Two overlapping sets have no shared denominator to divide by, so
the ledger prints three counts and one sentence stating the overlap as a fact. The absence
the bar used to render as 100% is now a sentence naming both halves of it. See D98 and
`summarizeAgency` in `lib/agency/index.js`.

**What would bring it back.** A split bar over these picks needs a denominator that does
not move when the reader trades, and there is one: every pick the roster's own seasons will
ever order, which is fixed at (seasons tracked x rounds) and does not shrink when a pick is
sent away. `awayPicks` computes exactly that set now, so the honest version of this chart
is buildable - **own picks still held / own picks total** - and it would answer "how much of
my own future do I still hold" without inverting under trade. It was not built in this pass
because the three-row ledger already prints both numbers, and a chart of a ratio the rows
already state is the duplication D40 and D51 keep finding. If a future round wants a
picture here, that is the fraction to draw, and it should not be drawn as "controlled vs
passenger" over held picks again.

---

## S11. `choosePartner()` — the second answer to "who should I call"

**What it was.** A 30-line private function in `lib/gameplan/index.js` that picked one
leaguemate per move on `/plan`, scored from hand-tuned dossier-tag bonuses: `+8` if the
manager `overpaysForAge`, `+4` for a "Deadline buyer" tag, `+5` for a negative pick net,
`+3` for "High-volume trader", `p.trades * 0.5` as an engagement baseline, `-20` for a
"Ghost" or "Never trades". The winner rendered as a "Try [team]" row on every move card,
linking to their dossier. It also forced `buildGamePlan` to construct **thirteen full
dossiers per render** — the only reason that pass existed.

**Why it was shelved.** It was a **second, unpinned implementation of a question this
app already answers by searching**, which is precisely the shape of failure S6 (`tierOf`)
exists to document. `/trade/finder` answers "who should I call" by pricing every asset on
both rosters through both sides' appetites and searching for packages that clear a value
band and leave both sides better off. `choosePartner` answered it from behavioural tags
alone, and **never checked whether either roster held an asset the other one wanted.**

Nothing tied the two together, so they could disagree — and the disagreement was visible
in one flow, on one roster, three taps apart: `/plan` says "Try [team]", the reader taps
through to that manager, and the finder finds nothing that clears the bar with them. The
tag score cannot see that, because a manager's habit of paying up for veterans says
nothing about whether they own a player you want this season. There was no test comparing
the two, exactly as there was no test comparing `tierOf` against the live distribution.

The fix is the same fix: delete the second system rather than tune it. `/plan`'s move
cards now link to `/trade/finder` — the search — and carry `?move=<assetId>` when the
move names a specific player to send, so the finder is asked the constrained question
("who would take *him*") instead of guessing what the move meant. Dropping the function
also dropped the thirteen-dossier pass, which nothing else in `buildGamePlan` read.

**What would bring it back.** Nothing in this shape. The useful half of it — "these
managers behave like buyers of what you are selling" — is a real signal, and it is
already *in* the finder: `appetiteFor` reads the same dossier (`overpaysForAge`,
`hoardsPicks`, `buildsYouth`, the reluctance tags) and `perceive` turns those tells into
signed reasons attached to specific assets, which is the thing `choosePartner` could not
do. If a future round wants a shortlist on `/plan` rather than a link, it should call
`partnerBoard` — the finder's own prefilter, which already scores every leaguemate over
real assets — and never re-derive a parallel score from tags.
## S12. `postureCensus()` - the league's postures as counts, in `TIMELINE_AXIS` order

Shelved 2026-08-20 by owner decision, against `main` @ `f982cb0`. Replaced in the same
pass; see `DECISIONS.md` D102.

**What it was.** `postureCensus(timelines)` in `lib/metrics/duration.js`: a four-tile
tally of every roster's timeline posture (`contending` / `ascending` / `rebuilding` /
`straddling`), read off the same `leagueTimelines` array the board below it read, so the
census could never disagree with the board it sat above - that guarantee was D40's whole
point and it held. It led `/league` in the highest slot on the page.

**Why it went.** The guarantee it had was never the problem; the question it answered
was. Three of its four counts are not readings of the league - they are counts of
**quartile membership**. `classify` hands out `contending` / `ascending` / `rebuilding`
by `shortnessPercentile`, taken over the league's own duration distribution, and its own
header comment already said the consequence out loud: "somebody carries the label in
every league, however that league is built." A census of a rank is a census of where the
rank lines fell, not a fact about the teams underneath them.

Worse than tautological, and measured rather than asserted: the quartiles are computed
over **all fourteen** rosters, while the three labels are only handed to the **seven**
that clear `COHERENCE_FLOOR` (55). On the fixture league this printed **"1 contending"**
while three of the four shortest-duration rosters (roster 13 at TCI 43, roster 7 at TCI
54, roster 4 at TCI 52 - all below the floor) were disqualified for **incoherence**, not
for timing. A reader took "one team is trying to win now" from a tile that actually meant
"one team is both shortest-duration-quartile and coherent," and a one-word label has
nowhere to put that difference.

The fourth count, `straddling`, was the honest one - it comes off the absolute coherence
floor rather than a quantile, so it is genuinely free to be 0 or 14 on any given league -
and it was already said twice elsewhere on the same page: the split rows on the window
map, and `windowRefusalSummary`, which states it in a sentence with its reason attached.

**What replaced it.** `buildQuadrantView().counts`, already computed for the
coherence/fragility board and now rendered beside the axes it was read from instead of
floating at the page head. It is an intersection of two independent median splits, which
is genuinely allowed to come out 0 - a quartile tally's four counts are fixed by
construction to sum to the roster count and cannot. Measured on the fixture league it is
not degenerate: 4 of 14 rosters sit below the coherence median and above the fragility
median, against 4 / 3 / 3 for the other three corners.

**What would bring it back.** A surface that genuinely needs a straight tally of
`classify`'s four words, read with the quartile-membership caveat stated beside it rather
than implied - and, separately, a survey of whether any *other* dynasty league's duration
distribution produces a similarly split census, since this entry's numbers are one
league's measurement and the defect (percentile-vs-floor mismatch) is structural rather
than data-dependent. Absent a caveat that actually ships with the number, reviving the
four-tile tally is reviving the bug.

---

## Considered, and deliberately not shelved

Recorded here because a near-miss is worth remembering too — the argument was made, and
the next round should know it was heard rather than overlooked.

**`/awards` — "Left On The Bench".** One of twenty superlatives, ranking managers by
available points never started. Proposed for shelving on the grounds that its own
subtitle disarms it: *"Some of this is tanking rather than inattention, and the number
cannot tell them apart"* — which makes it the one place the app publicly ranks people on
something it admits it cannot interpret.

**Kept.** One of five reviewers proposed it, at their own stated low-to-medium
confidence, calling it a genuine coin flip and writing *"a reviewer who weights 'fun'
higher than 'no verdicts' should overrule me."* A second reviewer looked at `/awards`
independently and said keep the set. That is a split, not a verdict, and a permanent
removal is the wrong way to resolve a coin flip: the award is honest about its own limit
in the sentence directly under its title, which is the behaviour the rest of this app is
praised for.

If it is ever revisited, the revival-shaped version is the same one the proposer named:
scope lineup-optimality to seasons where the roster was **trying** — excluding teams
already eliminated from contention — at which point it stops being a tanking detector and
becomes a management metric. The rest of `/awards` is unaffected either way.
