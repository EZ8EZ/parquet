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
