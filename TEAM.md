# Parquet Front Office

The standing agent team for Parquet. Each member is a Claude Code subagent defined in
`.claude/agents/<name>.md`. Invoke one by name, for example "use the phd-value-curve
agent to ...". The chief of staff owns this file and updates it at the end of every
session.

House rules every agent carries: no grades or verdicts (D6), never fabricate (D19),
measurements ship with n and caveats, plain JS, derivations are offline scripts whose
outputs are committed constants, decisions logged in `DECISIONS.md` as Dxxx, and git
runs through `/Library/Developer/CommandLineTools/usr/bin/git` (plain `/usr/bin/git`
hits an Xcode license wall).

## Roster

| # | Name | Agent (invoke as) | Role | Model | Strengths |
|---|------|-------------------|------|-------|-----------|
| 00 | Rhea "Timeout" Calloway | `chief-of-staff` | Chief of staff. Talks to Eric, routes work, merges, reports outcomes faithfully, keeps TEAM.md current | opus | Routing, reconciling conflicting results, honest status reports |
| 11 | Dr. Ty "Tape" Marchetti | `postdoc-market-analyst` | Postdoc, market and anchor studies on Sleeper data (dynasty ADP, season stats) | sonnet | Partial correlations against the market, clean nulls, small re-runnable studies |
| 12 | Dr. Juno "Combine" Park | `postdoc-rookie-scout` | Postdoc, rookie prior datasets: NBA draft slot, college stats, Sleeper id mapping | sonnet | Auditable joins, match-rate reporting, never fuzzy-matches silently |
| 21 | Prof. Ada "Arc" Whitlow | `phd-value-curve` | PhD, value-vs-rank curve, surplus over replacement, consolidation math | opus | Curve shape at real ranks, rank-anchored thresholds, 2-for-1 math |
| 22 | Prof. Otis "Lottery" Fennimore | `phd-pick-curve` | PhD, rookie pick curve, class strength, bootstrap by class | opus | Uncertainty intervals, class-level resampling, pick/player scale parity |
| 30 | Mo "Hardwood" Adeyemi | `fullstack-engineer` | Full-stack engineer: Next.js 16, server components, Tailwind v4, mobile-first 390px | opus | Reads the Next 16 docs first, small components, logic stays in `lib/` |
| 40 | Vera "Whistle" Strand | `red-team-reviewer` | Red team, read-only. Challenges every group, returns MUST / SHOULD / NICE | opus | Statistical skepticism, house-rule enforcement, evidence for every call |
| 41 | Benny "Replay" Lindqvist | `qa-engineer` | QA: route crawl for 500s, `visual-review` at 390px in both themes, numbers sanity | sonnet | Evidence-first findings (route, theme, screenshot, status code) |
| 42 | Pearl "Scorebook" Tanaka | `docs-recorder` | Docs: DECISIONS.md entries, README / API_NOTES / PROGRESS upkeep | sonnet | Writes only what shipped, verifies claims against code |
| 50 | Kit "Advance" Romero | `scout` | Fast read-only codebase mapping | haiku | Exact paths, short reports, no speculation |
| 60 | Sasha "Sixth Man" Okafor | `product-lead` | Product lead (hired 2026-10-01): user journeys, what each page leads with, ranked product critiques | opus | Sleeper-style product instincts; decides which number a manager needs today |

Usual flow for a change: scout maps -> specialist builds or measures -> red team reviews
-> QA verifies -> docs records -> chief of staff merges and reports to Eric.

## HANDOFF - 2026-10-01

Branch: all of today's work is on **`dynasty-v2`**, to be merged to **`main`**.

What happened today:

- **2026 rookie draft complete.** NSL Fantasy Hoops' draft ran on Sleeper (draft
  1347007735828324352, 42 picks, 3 rounds, linear).
- **D115, spent picks no longer counted.** Seasons whose rookie draft is `complete` leave
  every pick enumeration. `tradeablePickSeasons()` / `isPickSeasonSpent()` in
  `lib/picks.js` are the single place seasons are enumerated; `/api/trade` refuses a
  spent season. After the 2026 draft, 2027 picks are one season out.
- **D116, price anchor moved** from Sleeper redraft `search_rank` to **Sleeper dynasty
  ADP** (`adp_dynasty` on the projections endpoint). Along with it:
  - age curve **attenuated (exponent 0.5, refined to 0.63 in D117)** on dynasty-anchored prices, since dynasty ADP
    already prices age;
  - new **hybrid base curve** `10000 * r^-0.35 * e^(-0.015 (r - 1))`, replacing
    `exp(-0.021 r)`;
  - thresholds **rank-anchored via `valueAtRank`**;
  - **pick curve refit** onto the same scale;
  - the room's own draft order was **measured to add nothing over the market**
    (partial rho -0.022, n=126).
- **D117, measured hybrid base curve.** Price anchor is a dynasty/redraft blend
  (w = 0.45), age exponent 0.63, pick curve measured as draft-night conversion value.
  Red team challenges (12) had all MUST items addressed; QA swept 47 routes x 3 rosters clean.
- **New surfaces:**
  - "Before tip-off" roster crunch panel on home and `/roster`;
  - the class valued today on `/drafts/[season]`;
  - the game plan now protects developmental players.

## Open threads

- [ ] Merge `dynasty-v2` -> `main` after the D117 gate.
- [ ] Re-measure the production weight (0.23) against the blended anchor.
- [ ] Star-tier flag is still keyed on the redraft rank.
- [ ] Roster crunch ignores `taxi_deadline` and IR relief.
- [ ] Snapshot `/projections/nba/regular/{season}` on a schedule (June-September coverage unknown).
- [ ] Post-doc B college-stats study: fold its findings in when reviewed.
- [ ] The full UX review document (`REVIEW.md`) is the next big lever.

## Memory & token ledger
Every member has a memory file at `.claude/agent-memory/<agent>.md` (lessons, newest first) and logs each task in `.claude/agent-memory/USAGE.md`. The chief of staff reviews the ledger before staffing a job: keep the members whose cost per merged outcome is lowest, and retire roles that stop earning their tokens.

## Roster moves
- 2026-10-01: hired `product-lead` (Sasha "Sixth Man" Okafor) - nobody owned the user journey. No releases: every member delivered today.
