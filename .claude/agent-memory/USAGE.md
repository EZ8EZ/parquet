# Team usage ledger

One row per task. Tokens are the subagent totals the harness reported at completion (input + output, cached included). Use this to allocate work when budget is tight: cost per merged outcome matters more than cost per task.

| date | agent | model | task | tokens | wall time | outcome |
|---|---|---|---|---|---|---|
| 2026-10-01 | postdoc-market-analyst | sonnet | Market anchor study Q1-Q5 + red-team follow-ups | 306,470 | ~18 min | Changed the shipped design (blend w=0.45, age exponent 0.63). High value. |
| 2026-10-01 | postdoc-rookie-scout | sonnet | NBA draft + college dataset 2020-2026, rookie prior study | (running at handoff) | - | Not yet folded in. |
| 2026-10-01 | phd-value-curve | opus | Value-vs-rank curve on surplus over replacement | 104,622 | 3.5 min | Shipped as D117. High value. |
| 2026-10-01 | phd-pick-curve | opus | Rookie pick curve, bootstrap by class | 109,769 | 3.3 min | Shipped (refit by lead on model scale). |
| 2026-10-01 | fullstack-engineer | opus | Post-draft pick fix D115 (worktree) | 130,835 | 8.2 min | Merged. |
| 2026-10-01 | fullstack-engineer | opus | Roster-crunch engine | 91,382 | 1.6 min | Merged. |
| 2026-10-01 | fullstack-engineer | opus | Draft-recap engine | 89,125 | 1.4 min | Merged. |
| 2026-10-01 | fullstack-engineer | opus | Gameplan developmental protection | 106,060 | 4.5 min | Merged. |
| 2026-10-01 | fullstack-engineer | opus | Draft recap UI (paired with pick PhD) | 109,263 | 3.3 min | Merged; copy later neutralized. |
| 2026-10-01 | fullstack-engineer | opus | Before tip-off panel UI (paired with curve PhD) | 111,577 | 3.9 min | Merged. |
| 2026-10-01 | fullstack-engineer | opus | Tradefinder test fixes for D117 | 86,629 | 0.8 min | Merged. |
| 2026-10-01 | red-team-reviewer | opus | Cross-team review, 12 challenges | 142,461 | 5.5 min | 4 MUST items fixed before merge. Highest value per token. |
| 2026-10-01 | qa-engineer | sonnet | 47-route sweep x3 rosters, axe 390px review | 144,607 | 6.3 min | Caught pick/player scale mismatch. |
| 2026-10-01 | docs-recorder | opus | D116 entry, API_NOTES, calibration scripts | 206,289 | 9.5 min | Merged. |
| 2026-10-01 | docs-recorder | opus | D117 entry, D116 TODOs | 101,618 | 2.1 min | Merged. |
| 2026-10-01 | docs-recorder | opus | Team definitions, TEAM.md, dashboard | 150,314 | 9.7 min | Merged. |
| 2026-10-01 | docs-recorder | sonnet | Dashboard statuses + TEAM.md threads | 118,643 | 2.9 min | Merged. |
| 2026-10-01 | scout | sonnet | 5 parallel codebase maps | 430,317 total (78-91k each) | ~30-50 s each | Cheap, fast, enough to plan. |

## Read-outs (2026-10-01)
- Opus implementation tasks with a tight brief cost ~85-130k tokens and 1-8 minutes each; the brief quality, not the model, decided whether they merged cleanly.
- The red-team pass (~142k) prevented a wrong anchor from shipping: the best cost/benefit of the day.
- Long empirical studies (~300k) are worth it only when their answer can change a shipped constant; scope them to that.
- Scouts on sonnet are the cheapest way to cut the lead's own reading time.
