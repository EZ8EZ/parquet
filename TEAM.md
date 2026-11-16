# Parquet Front Office

The standing agent team for Parquet. Each member is a Claude Code subagent defined in
`.claude/agents/<name>.md`. Invoke one by name, for example "use the phd-value-curve
agent to ...". The chief of staff owns this file and updates it at the end of every
session.

House rules every agent carries: no grades or verdicts (D6), never fabricate (D19),
measurements ship with n and caveats, plain JS, derivations are offline scripts whose
outputs are committed constants, decisions logged in `DECISIONS.md` as Dxxx, and use the
system git.

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

## HANDOFF - 2026-11-16

Branch: `claude/parquet-redesign-3b7kcp`. Owner reviews and merges.

- **Direction (D119):** the spine is this week's lock-in decisions; ledger, strategy and
  trade/valuation surfaces stay but are deprioritised. D91 (no AI) stands. D120: a
  forward-looking lean is allowed, labelled as the model's.
- **Merged, wrong-advice fixes:** production term off (D121); future picks slotted by
  this season (D122); contend needs top-half standing (D123); plan moves are finder
  packages (D124); replacement-line cuts and one tier ladder (D125); two copy fixes (D126).
- **Merged, data layer:** one Sleeper client with timeouts and a cache table, visible
  gaps (D127); Prisma off the read path, `proxy.js`, /league bundle, dead code (D128);
  hourly lineup snapshots to a `data` branch (D129).
- **Merged, engine:** `lib/lockin/` (D130-D133). No page reads it yet.
- **Not merged:** four-tab nav (This Week, Team, Trade, League), rebuilt Home, lock-or-hold
  cards and charts. README and SHELVED S1 say so.

## Open threads

- [ ] Re-measure the production weight against the blended anchor (D121).
- [ ] Merge the snapshot workflow to `main` so the schedule runs (D129).
- [ ] Re-test the average teammate-out lift (+1.7) in the backtest before using it (D133).
- [ ] Star-tier flag still keyed on the redraft rank; `/drafts/grades` conflicts with D6.

## Dashboard
Published at https://claude.ai/artifact/3nPsdEqw6mShPGN6NiJiXA (private to Eric). Source: `.claude/team-dashboard.html` - edit it and republish to the same URL (pass the URL from a new session).

## Memory & token ledger
Every member has a memory file at `.claude/agent-memory/<agent>.md` (lessons, newest first) and logs each task in `.claude/agent-memory/USAGE.md`. The chief of staff reviews the ledger before staffing a job: keep the members whose cost per merged outcome is lowest, and retire roles that stop earning their tokens.

## Roster moves
- 2026-10-01: hired `product-lead` (Sasha "Sixth Man" Okafor) - nobody owned the user journey. No releases: every member delivered today.
