# BRAINSTORM.md - Next-feature ideas, the org chart, and how the vote went

This file exists so brainstormed ideas survive past whichever ones get built.
Numbered, not ranked - the ranking lives in the vote tally below once it runs.

## The roster

One Fable 5, two Opus 5, two Sonnet 5, three Haiku 4.5 - eight agents, fixed by
the owner for this run. Org chart:

```
                    FABLE 5 - Chief Architect
        facilitates the vote, breaks ties, does final integration
        review before push, is the escalation point no Lead can
        resolve with a peer alone
                    /                          \
       OPUS 5 - Lead A                 OPUS 5 - Lead B
       owns one feature end to         owns one feature end to
       end; may spawn sub-agents       end; may spawn sub-agents
       or direct a pooled worker       or direct a pooled worker
              |                                |
     SONNET 5 - Lead C                SONNET 5 - Lead D
     owns one feature end to          owns one feature end to
     end (same authority as           end (same authority as
     an Opus Lead, smaller            an Opus Lead, smaller
     feature)                         feature)

          HAIKU 4.5 x3 - pooled workers / verifiers
     dispatched by whichever Lead needs a narrow, well-specified
     sub-task done, or used as an independent checker on a peer's
     work before it is reported done
```

Blockers resolve peer-to-peer (Lead to Lead) or escalate to the Chief. Nobody
waits on or messages the owner - this project's own founding rule already
covers exactly this case: never block, make a reasonable decision, log it,
continue.

**Correction after round 1, load-bearing for everything below:** peer Leads
cannot actually message each other - confirmed when Opus Lead B tried to
reach Sonnet Lead C mid-build and it silently went nowhere. The orchestrator
is the only real relay, whether or not a brief says otherwise. "Escalate to
the Chief" still works, since that always goes through the orchestrator too.

## Round 2 - down to five

Three departures before this round starts. Haiku Worker 1 (the one who
actually did real work last round - Opus Lead A's independent house-style
reviewer) left first. Haiku Worker 2 left next, with nothing to distinguish
the decision from Worker 3 on merit - neither was contacted last round, so
that one was attrition, not performance. Then a Sonnet Lead left - both C
(data-viz) and D (global search) shipped clean, well-verified work last
round with nothing to separate them either, so this is another arbitrary
call: Sonnet Lead C is out, Sonnet Lead D stays.

The team is five: Chief Fable, Opus Lead A, Opus Lead B, Sonnet Lead D,
Haiku Worker 3. Three Leads instead of four means this round targets THREE
winning features, not four - the vote and the assignment both scale down
with the roster rather than forcing a fourth feature onto someone already
carrying one.

Final headcount for this round - no more departures expected, and no new
hire without asking first. If the work genuinely needs a sixth agent, that
gets raised explicitly (which tier, and why) rather than just spawning one.

## The candidates

1. **Trade Finder** - auto-suggest mutually beneficial trades between the
   viewer and any other manager, using valuation gaps, a dossier's "what they
   want" signals, and positional need. New surface under `/trade`.
2. **Manager Compare** - side-by-side comparison of two managers: values,
   timelines, fragility, dossier tags. New page.
3. **Season Recap** - a narrative end-of-season summary pulling from the
   ledger, awards, and timeline shifts. Private, not shareable outside the app.
4. **UI/visual: Home page density + a real light theme** - the app is
   dark-only today (confirmed during the award-badge work); a genuine light
   theme plus a tighter, less scrolly home page layout.
5. **UI/visual: Data visualization upgrade** - replace the hand-rolled bar
   charts with sparklines for value trends and a radar chart for positional
   strength, still no chart library (house rule), still hand-rolled SVG.
6. **Global search** - one search surface for a player, manager, trade, or
   pick, reachable from anywhere, mobile-first.
7. **"What changed" digest** - a panel on Home surfacing new trades, resolved
   picks, and TCI/fragility shifts since the last visit.
8. **Live achievements** - ongoing badges that update in real time ("held a
   player 2+ years," "3 trades this month"), distinct from the historical,
   backward-looking Superlatives.
9. **Draft report cards** - grade every past draft class using the existing
   draft-capture metric, presented as a per-season report card.
10. **Settings page** - theme, player-photo toggle, default "viewing as"
    persistence, digest opt-in.
11. **Commissioner tools** - trade veto history, a transaction audit log,
    league health checks (stale rosters, unresolved picks).
12. **Approach-message generator** - turn a dossier's "how to approach them"
    tips into a ready-to-send, copyable draft message.
13. **First-run onboarding** - a short guided tour of the five tabs for a
    first-time viewer.
14. **Cold-start performance audit** - a technical-debt pass: memoize what
    isn't yet, tighten corpus TTLs, measure and cut cold-start cost.
15. **Accessibility audit** - screen-reader labels, focus states, and a
    contrast pass across the whole app.

## The vote

Every agent got this list and voted their top 4 in order, one line of
reasoning each, before knowing what they'd be assigned. Points: 1st=4, 2nd=3,
3rd=2, 4th=1.

| Rank | # | Idea | Points |
|---|---|---|---|
| 1 | 1 | Trade Finder | 20 |
| 2 | 7 | "What changed" digest | 19 |
| 3 | 5 | Data-viz upgrade | 15 |
| 4 | 6 | Global search | 10 |
| 5 | 4 | Light theme + home density | 6 |
| 6 | 12 | Approach-message generator | 5 |
| 7 | 9 | Draft report cards | 3 |
| 8 | 2 | Manager Compare | 1 |
| 8 | 10 | Settings page | 1 |

Every ballot's top 3 included candidate 1 (Trade Finder) - the only idea every
single voter rated highly regardless of model tier. Candidate 7 was the
clearest expression of the app's actual thesis (memory serving self-knowledge)
in every vote that picked it, usually 1st or 2nd.

**Candidate 4 (light theme) is the one real disagreement worth recording.**
Chief Fable read `globals.css` and called it infeasible in one session (no
theme tokens at all). Both Sonnet Leads called it oversized against the
committed dark editorial identity (DECISIONS D15). Opus Lead A agreed with the
identity objection even after confirming the token layer exists. Opus Lead B
did the deepest check of anyone (grepped for literal hex across the whole
component tree) and made a real case FOR it: only 3 files hold hardcoded
color, so a true light theme is a confined, verifiable change, not a redesign.
Four votes down, one strong dissent - and the team's own math resolved it
without anyone overruling anyone: it placed 5th, comfortably below the cutoff.
The dissent is worth keeping on file for whenever this candidate comes back up
(see "Saved for later").

## What got built

Winners: **1 (Trade Finder), 7 (the digest), 5 (data-viz, the UI/visual
pick), 6 (global search)**. Assignments, by self-selection where a Lead's own
vote pointed at an available winner, tie-broken by strength of preference
where two Leads wanted the same one:

- **Opus Lead A -> Trade Finder** (their own 1st-place vote; already scoped
  the partner-matching reuse from `/plan` during the vote's feasibility pass)
- **Opus Lead B -> The digest** (their own 1st-place vote; already scoped the
  `lib/ledger.ts` diff infra and the `viewing-as` cookie pattern for it)
- **Sonnet Lead C -> Data-viz upgrade** (both Sonnets wanted this; C ranked it
  2nd against D's 3rd)
- **Sonnet Lead D -> Global search** (the one winner neither Sonnet personally
  ranked highest - assigned rather than self-selected, which is normal on a
  real team)

**Sonnet Lead C - data-viz upgrade: done.** New `Sparkline` and `PositionRadar`
in `components/charts.tsx`, additive only. Wired into `/roster` only, not
`/league` - a radar answers "is my roster's shape balanced," which is a
single-team question `/roster` already asked with a bar chart; `/league` is a
cross-team ranking surface with no natural home for it. Every asset row on
`/roster` gets a sparkline via a new optional `trajectory` prop on
`ValueAssetRow` (`components/ValuesList.tsx` - one file outside the original
brief, claimed by nobody else, logged rather than asked about). Honesty call
worth recording: this app stores no week-over-week value history, so a literal
value-over-time line would have been fabricated. The sparkline instead
projects each player's OWN value forward on the already-published age curve
with every other multiplier held fixed, labeled in the UI as exactly that -
real model, not invented history. 301/301 tests, typecheck/lint clean,
verified at 390px against live data.

**Opus Lead B - "what changed" digest: done.** `lib/digest/` diffs three
things against a "last seen" marker cookie (modeled on the existing
`viewing-as` pattern): new trades, picks that resolved to a player, and
TCI/fragility movement. 33 tests. Verified on the real league with a real
constructed before/after (a marker from over a year ago correctly surfaced 31
trades, 31 resolved picks, and exactly the two movers deliberately seeded, one
red for a falling TCI and one red for rising fragility - direction read off
the metric, not the sign). Honesty call: TCI/fragility movement comes from a
snapshot carried IN the marker, not a rewound recompute, because commissioner
trades already lose pick components in this corpus and a rewound roster would
be silently wrong; the first visit that stores a snapshot says so explicitly
(`metricsTracked: false`) rather than rendering a movement of zero.

**A real process finding, not just a feature result: peer Leads cannot
message each other directly.** Opus Lead B tried to reach Sonnet Lead C
mid-build to flag a possible chart-reuse question and found peer-to-peer
SendMessage does not resolve - only the orchestrator can relay between two
spawned agents. It didn't matter here (Lead C never built anything the
digest would have needed), but it means the org chart's "resolve peer-to-peer"
step doesn't function as literal agent-to-agent messaging in this harness -
the orchestrator is the actual relay every time, whether or not it says so in
the brief. Worth remembering for next time.

**Sonnet Lead D - global search: done.** New `app/api/search/route.ts`
(diacritic-folded match across players/managers/trades/picks, in-process
memoized valuation) and `components/GlobalSearch.tsx` (a floating trigger
bottom-right, chosen over a header icon since no shared page header exists to
hang one on), mounted once in `app/layout.tsx` - a two-line diff. Correctly
reused every existing routing convention rather than inventing new ones: a
former manager resolves to `/managers/former/{ownerId}` with the right
tenure label, a pick resolves to the exact deep-linked, highlighted board
position `app/drafts/parts.tsx` already produces. One honestly-flagged gap:
no per-trade URL exists anywhere in this app yet, so a trade result expands
inline instead of deep-linking - noted as a real product gap for later, not
papered over. Verified against real search results (a real 2023 trade, a real
former manager, a real draft pick), not just "it loads." 372/372 tests
passing at the time it finished.

**Opus Lead A - Trade Finder: done.** `lib/tradefinder/` scores candidate
packages by pricing every asset through BOTH sides' eyes (a trade only exists
where the two views disagree), reading the viewer's own appetite from their
roster rather than their dossier (their habit of overpaying for age is not a
reason to recommend they do it again), and delegating all pricing to the
existing `evaluateTrade` so the finder and a hand-built `/trade` package can
never tell two different stories - a test pins the two together exactly. 38
tests, strongest is a zero-sum property: two sides that value everything
identically must produce zero suggestions, since any output there would be
invented. Two real calibration bugs the live-data pass caught: rationale text
written in third person leaking onto the viewer's own side, and a 36-year-old
described as "what your window needs" (win-now premium now capped at 34).
Sanity-checked against two real trade proposals for the actual league,
verified end to end at 390px. Used Haiku Worker 1 as an independent house-
style reviewer - confirms direct Lead-to-pooled-worker delegation worked even
though Lead-to-Lead peer messaging did not (see the digest's note above).

**One real cross-team finding for integration:** the global search floating
button (Sonnet Lead D) overlays real content on the Trade Finder detail view
(Opus Lead A) at 390px - covers the value column on package rows and part of
the "room" figure on the partner board. Flagged by Lead A, not yet fixed by
either side. Chief Fable's review, next.

## Chief Fable's integration review

Found and fixed one real cross-feature bug directly: the FAB collision was
geometric, not z-index - the search button's clearance sat at `safe-area +
140px` while `<main>`'s bottom padding was a flat 112px with no safe-area
term, so the last ~30-40px of every page could never scroll clear of it on a
device with a home indicator. Fixed once, globally, in `app/layout.tsx`,
rather than per-page, since the button itself is global.

Both outstanding checklist items held against the actual code, not just the
reports: `GlobalSearch` mounts exactly once (grepped, confirmed), and the
digest panel is genuinely text/numeric with no chart. No Lead's report
claimed a negotiated peer agreement that didn't actually happen - the one
adjacent claim (Lead C's "nobody else claims ValuesList.tsx") checked out.

Added D31 (Trade Finder's star-protection asymmetry), D32 (the upward-only
consolidation premium), and D33 (`stanceOf` deliberately duplicating `/plan`'s
direction read for cost reasons, pinned against drift by a test) to
DECISIONS.md.

Ships as-is. Two non-blocking notes for later: roster sparklines tint red for
any declining trajectory, which for a very young player reads as "bad" when
it is just the model's youth premium unwinding as they age one more year (an
easy follow-up, `Sparkline` already accepts a color override); and the new
search route's normalization helper is a near-duplicate of `/values`' own -
a good shared-helper candidate next round, not a bug now.

## Saved for later

Every candidate not selected this round, with what the team's votes actually
said about each, so the next pass starts from a real read instead of a blank
slate.

- **4. Light theme + home density (6 pts, 5th).** The one real disagreement
  of the whole vote - worth reading the tally section above in full before
  picking this up again. Three technical facts survived the debate and should
  not need re-discovering: `globals.css` IS tokenized under `@theme` (Fable's
  original "zero plumbing" read was the least accurate of the bunch), only 3
  files hold literal hardcoded hex (`PlayerAvatar.tsx`, `Brand.tsx`,
  `layout.tsx` - Opus Lead B's grep), and the objection that actually held up
  across four separate votes was identity, not feasibility: this app has
  committed to a dark editorial aesthetic (DECISIONS D15), and a "genuine"
  light theme is a statement about what the app IS, not a confined bugfix.
  Next time this comes up, that's the real question to answer first - do we
  want a light mode as a mood, or just as an accessibility escape hatch (which
  is a much smaller, clearly-scoped ask).
- **12. Approach-message generator (5 pts).** Small, well-liked, well-scoped
  (turns a dossier's existing `approachTips` into a copyable draft). Good
  candidate for a single Haiku- or Sonnet-sized session next time, not a full
  Lead assignment.
- **9. Draft report cards (3 pts).** Two separate agents noted the underlying
  metric (draft capture, `slotSurplusRate`, `startupSeasons`) is already built
  and calibrated - this is presentation work over existing machinery, near-free
  leverage whenever it's picked up.
- **2. Manager Compare (1 pt).** Reuses the dossier/profile stack directly.
- **10. Settings page (1 pt).** Opus Lead B's read: not a feature on its own,
  fold it into whichever future feature needs its first real preference (the
  light theme, if that ever ships, is the natural trigger).
- **8. Live achievements.** Flagged by two separate voters as overlapping the
  existing Superlatives/AwardBadge system closely enough to risk two badge
  surfaces with different rules - needs a real differentiation story before
  it's worth building, not just a restatement of what awards already do.
- **11. Commissioner tools.** Flagged as partly unbuildable as scoped - Sleeper
  does not reliably expose trade-veto history, so this would need rescoping
  around what the API actually returns before it's a real candidate.
- **13. First-run onboarding.** Weakest candidate on the list by consensus -
  a private single-known-viewer app doesn't need a tour, and the empty states
  already shipped serve the same purpose.
- **14. Cold-start performance audit** and **15. Accessibility audit.** Not
  really features a Lead can own end-to-end the same way the others are - both
  are legitimate, worthwhile, open-ended engineering hygiene better suited to
  a dedicated audit pass than a single-session build. Worth doing; wrong shape
  for this kind of vote.
- **A real gap the team found while building, not while voting:** there is no
  per-trade URL anywhere in this app. Global search's trade results have to
  expand inline rather than deep-link, purely because of this. Whoever
  eventually wires searchParams-based trade selection into `TradeWeb.tsx`
  closes that gap for free on the search side too - worth remembering these
  two features are actually coupled the next time either comes up.

## Round 2 candidates

Mostly last round's saved-for-later list, carried over with the reasoning
intact, plus two new ones the team's own work surfaced. Audits (14, 15) are
deliberately excluded again - confirmed last round they are not Lead-shaped
work, so they don't compete in this vote.

16. **Wire per-trade deep links into the trade web.** The gap both the digest
    and global search independently ran into. `TradeWeb.tsx` selection is
    local `useState`; move it to `searchParams` so a trade has a real URL,
    and global search's inline-expand compromise upgrades to a real link for
    free with no changes needed on the search side.
17. **Approach-message generator** (was 12, 5 pts). Turn a dossier's existing
    `approachTips` into a copyable draft message.
18. **Draft report cards** (was 9, 3 pts). Presentation over the draft-capture
    metric, already built and calibrated twice.
19. **Manager Compare** (was 2, 1 pt). Reuses the dossier/profile stack.
20. **A light/high-contrast toggle, rescoped as accessibility, not identity.**
    Round 1's real disagreement was never about feasibility - the token layer
    already exists. It was about whether a light theme is a mood the app
    commits to or a narrow accessibility escape hatch. Scope it as the
    latter this time: a toggle, not a redesign, and say so in the brief so
    nobody re-litigates the identity question that already got settled.
21. **Live achievements, with a real differentiation angle stated up front.**
    Flagged last round as overlapping Superlatives closely enough to risk two
    badge systems with different rules. The angle that would make it not a
    duplicate: ONGOING and live-updating (a streak in progress), where
    Superlatives is deliberately backward-looking and season-final. State that
    distinction in the brief, or don't build this one.
22. **Commissioner tools, rescoped around what Sleeper actually exposes.**
    Drop trade-veto history (flagged last round as unreliable/unavailable).
    Keep a transaction audit log and league health checks (stale rosters,
    unresolved picks) - both genuinely buildable off data this corpus has.
23. **Wire `/rank`'s disagreement-vs-consensus data into an actual decision
    surface**, not just its own standalone page. Surface "you're 15 spots
    higher on this guy than consensus" inside Trade Finder's rationale or a
    manager dossier, where it can actually inform a trade instead of sitting
    on a page nobody opens mid-decision.

## Round 2 vote

Two of the five original round-2 spawns stalled with no output (infra, not a
judgment call) and were retried clean. Points: 1st=3, 2nd=2, 3rd=1.

| Rank | # | Idea | Points |
|---|---|---|---|
| 1 | 23 | Rank disagreement wired into decisions | 13 |
| 2 | 16 | Per-trade deep links | 12 |
| 3 | 18 | Draft report cards | 3 |
| 4 | 20 | Light/high-contrast toggle | 1 |
| 4 | 17 | Approach-message generator | 1 |

Candidates 16 and 23 were the top-2 pick of every single one of the five
voters - the strongest consensus of either round. Two Opus votes
independently called 17 pooled-worker-sized rather than Lead-sized ("tips
already render in three places, `CopyBlock` already exists"); rather than
leave it on the shelf at 1 point, it's assigned directly to Haiku Worker 3 as
a fourth, smaller feature this round, since the team's own read is that it
fits that tier exactly.

**Assignments:**
- **Opus Lead A -> 23** (rank disagreement into Trade Finder + dossiers).
  Scoping condition surfaced by the vote itself: custom ranks live only in
  `localStorage` (`components/RankingBoard.tsx`), but Trade Finder is a
  server component that cannot read it - this has to be solved with a cookie
  migration (the `viewing-as`/digest-marker precedent already in this repo),
  not discovered mid-build.
- **Opus Lead B -> 16** (per-trade deep links in the trade web). Every voter
  independently named the same fix: `TradeWeb.tsx`'s `sel` is local
  `useState`, move it to `searchParams`.
- **Sonnet Lead D -> 18** (draft report cards). Their own 3rd choice.
- **Haiku Worker 3 -> 17** (approach-message generator), assigned rather than
  voted, on the team's own read that it's correctly sized for this tier.

**Haiku Worker 3 - approach-message generator: done.** New
`lib/dossier/message.ts` (`generateApproachMessage(dossier)`), reusing the
existing `CopyBlock` component rather than a second clipboard mechanism, one
additive section on the dossier page. Technically clean - typecheck/lint/372
tests/browser all pass - but the generated copy itself is thinner than the
rest of this app's voice: real examples for three different managers
("pick spender," "pick hoarder," "name chaser") all close on the identical
line "Interested in talking?" and lean generic ("I've been looking at your
draft capital") rather than citing the specific number behind the tell (net
picks, avg acquisition age). Worth Chief Fable's polish pass, not a blocker -
this was explicitly assigned as worker-tier scope and it met that bar.

**Reorg mid-round:** Opus Lead A stalled twice (a real mid-stream API error,
then a hard stop) after leaving real, substantial work in the tree -
`lib/tradefinder/conviction.ts`, the localStorage-to-cookie migration in
`lib/rankings/customOrderServer.ts` and `app/api/custom-rank/` - but never
filed a final report or finished its own verification pass. Rather than
respawn a fresh peer Lead to re-derive a brief and re-verify code that
mostly already exists, that remaining work folds into Chief Fable's existing
final-review pass instead: Fable already has full context and real edit
authority, so finishing and verifying candidate 23 becomes part of
integration rather than a fourth parallel build. Leaner team for the rest of
this round: Fable (expanded scope), Opus Lead B, Sonnet Lead D.

**Opus Lead B - per-trade deep links: done.** `lib/tradegraph/url.ts` is the
one place the URL-to-view mapping lives (mode, season, manager, pair, trade,
asset - most specific wins, untrusted input degrades to the overview), and
`TradeWeb.tsx`'s selection moved from `useState` to the query string. Commits
go through `history.replaceState` rather than the router on purpose: `/web` is
force-dynamic and prices every traded player on each server render, so routing
per tap would pay that cost per tap, and selections deliberately don't stack in
the back button. Global search's inline-expand compromise upgraded to a real
link (`tradeWebHref`), the pair panel tags the linked deal ("this deal") while
keeping the list in date order (the order is the pair's history), and a trade
id with no strand gets an honest warn card instead of a silent overview. 17
tests. Verified against a real 2024 wk 17 deal: the search result's id lights
exactly the TTT-GOT strand and marks exactly that row; a garbage id shows the
warn card.

**Sonnet Lead D - draft report cards: done.** `lib/metrics/draftGrades.ts`
folds the already-graded picks per SEASON (the per-owner fold already existed
in `./skill`), carrying two settled decisions verbatim instead of re-arguing
them: no letter grades (D6) and no slot-surplus headline for the startup draft
(D27 - there is only one startup, so nothing exists to compare it against).
New `/drafts/grades` page plus a nav pill on `/drafts`. 6 tests. Verified at
390px on live data - the 2025 class reads 64.3% captured with Flagg as the
best take, which matches what the underlying metric already said elsewhere.

**Candidate 23, finished under the reorg (Chief Fable, completing Opus Lead
A's work):** the tree was more complete than the stall suggested - the
conviction module, its four-way verdict matrix, the cookie codec, the API
route, the server reader, and the finder wiring all existed, and the
"untouched board must produce nothing" honesty test was already written and
passing (it reproduces the live corpus's rank ties and holes, which is the
exact drift the 8-place threshold exists to silence). What was genuinely
unfinished was the brief's one scoping condition: the cookie was built as a
MIRROR of localStorage, not a replacement - two stores that drift the moment
one is cleared without the other, plus a debounced mirror whose pending write
was cancelled on unmount, so the tail of a drag could be lost to fast
navigation. Fixed: the cookie is now the single store (RankingBoard reads
`document.cookie` through the same `parseCustomOrderCookie` the server uses,
so the two sides cannot parse differently), localStorage is demoted to a
one-time legacy migration read, and the debounced write is flushed on unmount
and pagehide with `keepalive`. Verified end to end at 390px on the live
league: a real drag wrote the cookie (120 ids, localStorage untouched); a
2-place ranking produced honest silence on the finder; a 15-slot move on RJ
Barrett produced a "supports" note with the exact ranks (you #87, consensus
#100) on the one package containing him while every package value stayed
byte-identical to the unranked render; the board rehydrated from the cookie
across a reload and a full dev-server restart; reset put everything back to
consensus and the finder back to its rank-the-board invite.

## Chief Fable's integration review, round 2

- **`managerWebHref` was exported but used nowhere** - wired into both manager
  dossier pages' "Favorite trade partners" links, which had been pointing at
  the bare ring. A dossier's trade-partner section now lands on that manager's
  actual strands (verified live: the node selected, all partner strands lit).
- **#17 polish pass, requested by Worker 3's own report:** every angle now
  cites the number behind the tell (picks spent, net pick balance, average
  acquisition age, trades per season) and closes in its own words instead of
  the identical "Interested in talking?", and `lib/dossier/message.test.ts`
  now exists - it was the one lib module in the tree without tests. The live
  check reads right: the pick-hoarder dossier's message cites "+3 net", the
  same figure the page's own stat row shows.
- **Cross-feature URL check:** `/web`'s param namespace and the finder's
  (`with`/`pkg`) don't collide, and global search's trade ids agree with the
  graph's `tradeIds` by construction - both iterate the same post-coalesce
  `h.transactions`, so a coalesced commissioner deal gets the same id on both
  sides.
- **Full gate:** 440/440 tests, typecheck and lint clean, all four features
  verified in the browser at 390px against live data.
- **Non-blocking notes for a future round:** digest trade rows still link to
  `/ledger` rather than the new per-trade URL - a real candidate upgrade, but
  it is a product decision (the ledger IS a reasonable destination for "what
  changed") rather than a drive-by fix, so it is named here instead of made.
  The search route's normalization-helper duplication flagged last round also
  still stands.

## Round 3 - down to four

No new departures this round, but Opus Lead A's hard stop mid-round-2 means
the roster settles at four without a replacement: Chief Fable, Opus Lead B,
Sonnet Lead D, Haiku Worker 3. Two Leads means this round targets TWO winning
features, same scaling logic as round 2 - the vote and assignment shrink with
the roster instead of forcing a third feature onto someone already carrying
one. No new hire without asking first, per standing instruction.

### Round 3 candidates

Carried over from round 2's untouched saved-for-later list, plus two new ones
the round 2 integration review surfaced directly.

24. **Manager Compare** (was 19/2, never argued against). Side-by-side of two
    managers - values, timelines, fragility, dossier tags. Reuses the
    dossier/profile stack directly; no new derivation.
25. **A light/high-contrast toggle, scoped as accessibility, not identity**
    (was 20). The token layer already exists and only 3 files hold literal
    hardcoded hex (`PlayerAvatar.tsx`, `Brand.tsx`, `layout.tsx`). Build it as
    a toggle, not a redesign - the dark editorial identity (D15) stays the
    default and the committed mood; this is an escape hatch, not a rebrand.
26. **Live achievements, with the differentiation angle stated up front**
    (was 21). Must be ONGOING and live-updating (a streak in progress) to
    not duplicate Superlatives, which is deliberately backward-looking and
    season-final. If the build can't hold that line, don't ship it.
27. **Commissioner tools, rescoped around what Sleeper actually exposes**
    (was 22). Drop trade-veto history (unreliable/unavailable). Keep a
    transaction audit log and league health checks (stale rosters, unresolved
    picks) - both buildable off data this corpus already has.
28. **Digest trade rows link to the exact deal.** Candidate 16 (this round)
    closed the gap that made this impossible - `lib/digest/`'s trade rows can
    now point at `tradeWebHref(id)` instead of the blanket `/ledger` link.
    Small, mechanical, high-value: "what changed" becomes one tap from "here's
    the actual deal" instead of two.
29. **Dedupe the search-route and `/values` normalization helpers.** Flagged
    in both round 1 and round 2's integration reviews as a near-duplicate
    that should be one shared function. Technical debt, not a feature - if it
    doesn't win the vote, worth folding into whoever's build happens to touch
    either file, or into Chief Fable's own review pass directly.

### Round 3 vote

All four remaining agents voted top-2, one line each, before knowing
assignments. Points: 1st=2, 2nd=1.

| Rank | # | Idea | Points |
|---|---|---|---|
| 1 | 24 | Manager Compare | 6 |
| 2 | 27 | Commissioner tools, rescoped | 3 |
| 3 | 26 | Live achievements | 2 |
| 4 | 25 | Light/high-contrast toggle | 1 |

Candidate 24 placed in the top 2 of every single one of the four ballots -
the strongest consensus of any round so far, stronger even than round 2's
16/23 tie. Every voter independently flagged 28 as worker-shaped rather than
Lead-shaped (the same read three separate times, unprompted) and 29 as pure
tech debt that shouldn't cost a Lead slot at all.

**Assignments:**
- **Opus Lead B -> 24** (Manager Compare). Their only stated preference among
  the two winners; no conflict with Sonnet Lead D's pick.
- **Sonnet Lead D -> 27** (commissioner tools, rescoped). Their own 1st-place
  vote.
- **Haiku Worker 3 -> 28** (digest trade rows link to the exact deal via
  `tradeWebHref`), assigned directly rather than voted, on the team's own
  unanimous read that it fits this tier - same pattern as candidate 17 in
  round 2.
- **Chief Fable** folds 29 (the normalization-helper dedupe) into its own
  integration review rather than spending a build slot on it, per its own
  flag and nobody voting it a priority.

### Round 3 - what got built

**Opus Lead B - Manager Compare: done.** `/managers/compare` with the pair in
the URL (`?a=&b=`), zero new derivation: behaviour from `lib/dossier` (new
`dossiersByOwner`, the viewer included on purpose - `getAllDossiers` backs a
scouting list and deliberately leaves you out, and comparing yourself is the
whole point here), timeline and fragility from the existing league-wide
passes, head-to-head from the trade graph's own edges. The picker holds no
state at all - both selects render from the URL and navigate. Two honest
calls that make the page trustworthy: roster metrics (TCI, duration,
fragility) render only when BOTH sides currently hold a roster, because a
former manager's roster numbers belong to their successor now; and the
head-to-head figure is `edge.tradeIds.length`, NOT `edge.count`, with the
discrepancy disclosed in prose when the two differ. That second call surfaced
a general trap worth recording: `buildTradeGraph` sets `count` to
`max(dossier-derived weight, listable ids)` so a pair is never undersold, but
a commissioner-executed multi-team deal coalesces several transactions into
ONE record, so `count` can exceed what any list can show. Also deduped the
`a-b` edge-key convention into `pairEdgeKey` (three hand-rolled copies) and
added `pairWebHref`. Verified live: a former-manager comparison shows the
guard card and the "2 deals, dossiers count 3" disclosure on real data.

**Sonnet Lead D - commissioner tools: done.** `lib/commissioner.ts` (audit
log via `isNotable` imported from the ledger - one definition of "worth
showing" for the whole app; stale rosters off `lineupSlots()` and a plainly
stated 21-day cutoff) plus `/commissioner`, linked from `/league`. Every
audit row points at the surface that already owns the story: a trade opens
its own strand via `tradeWebHref`, everything else opens the manager. The
mid-build self-correction held up in review: unresolved picks split into
"can't resolve" (orphaned slot or no player - currently zero, honestly shown
as all clear) versus 63 routine in-flight picks behind a disclosure. Verified
live at 390px: 91 of 1,151 transactions in the log grouped by season, and the
audit log's coalesced-trade links resolve end to end (see the review note).

**Haiku Worker 3 - digest deep links: done.** One import and one line in
`DigestPanel.tsx`: each trade row now links `tradeWebHref(t.transactionId)`
instead of the blanket `/ledger`. Correct by construction - the digest and
the trade graph iterate the same post-coalesce `h.transactions`, so their ids
agree, coalesced commissioner deals included. Verified live with a rewound
marker: six trade rows, each deep-linked to its exact deal.

**Chief Fable - the dedupe (29) plus review fixes:** the "two" normalization
helpers were actually three (`TradeBuilder.tsx` had a third copy); all now
call one shared `fold()` in `lib/ui.ts`, pinned by `lib/ui.test.ts` including
the combining-mark case that makes "sengun" find Şengün. Verified live
through the search API.

### Chief Fable's integration review, round 3

- **Ran Lead B's suggested `edge.count` sweep across every surface.** The web
  itself is safe almost everywhere: its season view REBUILDS edges with
  `count = filtered tradeIds.length`, so every figure it prints is already
  the listable one. One real bug found and fixed: the view kept the GRAPH's
  edge order (sorted by raw count), so after the remap "busiest pairing" was
  `view.edges[0]` and could name a pair showing a smaller number than a row
  below it. The view now re-sorts under the remapped counts with the graph's
  own comparator.
- **The riskiest cross-feature path this round verified end to end:** an
  audit-log link to a coalesced multi-team deal
  (`/web?trade=coalesced-...%2B...`, percent-encoded plus signs and all)
  opens the right strand and tags the right record - "this deal" and "3-team
  deal" on the same row, on real data.
- **Commissioner page, two small fixes:** the unresolved-pick split now takes
  the complement of "stuck" rather than a second allowlist -
  `UnresolvedReason` has five values and the two lists only covered four, so
  a `no-draft-support` pick would have silently vanished from a page whose
  premise is that nothing gets silently dropped. And literal backticks in UI
  copy removed.
- **Full gate:** 459/459 tests, typecheck and lint clean, all four
  workstreams verified in the browser at 390px against the live league.
- **Non-blocking notes for later:** the stale-roster recency check reads
  noisy in the offseason (13 of 14 rosters flagged in August, mostly "no
  moves in N days") - the two-reason rosters sort first so real anomalies
  still top the list, but a future pass could put the quiet-lately rows
  behind a disclosure the way routine picks already are. And the round-2 note
  stands: whether the digest's Group header should keep pointing at /ledger
  now that its rows deep-link is a product question, not a bug.
