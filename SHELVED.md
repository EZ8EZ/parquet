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
