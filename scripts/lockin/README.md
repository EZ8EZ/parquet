# Lock-in study and reproduction scripts

The offline work behind `lib/lockin`: the model fit, the backtest that gives the lean
its record, and two scripts that rerun both through the production code. Nothing here
runs in the app. Run from the repo root with Node 22.

The study fetches about 1,800 Sleeper responses (league, rosters, users and matchups for
2025 weeks 1-23 and 2026 weeks 1-4, both schedules, the players list, and per-player game
logs for 2023-2026) into `scripts/lockin/cache/`. That directory is git-ignored and is
never committed. Set `LOCKIN_CACHE_DIR` to put it elsewhere. Every output below is
written into the same directory.

## Run order

| Step | Command | Produces |
|---|---|---|
| 1 | `node scripts/lockin/fetch_all.cjs` | the response cache and `universe.json` (rostered and rotation players). Rate-limited, about 220 ms per request; a second run reads the cache only. `REFRESH_CURRENT=1` re-reads the in-progress 2026 week |
| 2 | `node scripts/lockin/rules.cjs` | checks of the lock-in rules against the matchups (study section 1) |
| 3 | `node scripts/lockin/model_study.cjs` | the single-game model comparison behind `MODEL` in `lib/lockin/model.js` (half-life 5, R² 0.42, n=21,757) |
| 4 | `node scripts/lockin/backtest.cjs --pool=core` (and without `--pool` for all) | `backtest_rows_<pool>.json`: every completed team-week replayed under each policy |
| 5 | `node scripts/lockin/summarize.cjs core active` | the backtest tables behind `LEAN_RECORD` (+9.4 per team-week, n=240) |
| 6 | `node scripts/lockin/context_study.cjs` | opponent-history and outlier figures (study section 7) |
| 7 | `node scripts/lockin/calibration.mjs` | `calibration.txt`: quantile coverage and "beats it" bins through `lib/lockin` (n=3,039), cited in `MODEL_INFO.calibration` |
| 8 | `node scripts/lockin/replay.mjs` | `replay_rows.json`, `replay_summary.txt`: step 4 rerun through `lib/lockin`'s own functions, cited in `LEAN_RECORD.reproduction` |

`pit2026.cjs` and `worked.cjs` are the 2026 probability-integral check and the worked
example from the study. Steps 7 and 8 import `lib/lockin` from this checkout and need
steps 1 and 4 first.

## Files

- `fetch.cjs` cached, rate-limited GET; `load.cjs` builds the dataset from the cache.
- `model.cjs` the study's model (the original of `lib/lockin/model.js`); `stats.cjs`
  bootstrap and summary helpers; `hungarian.cjs` slot assignment for the backtest.
- `data.mjs` loads the same cache through `lib/lockin/normalize.js` for steps 7 and 8.

These files are the record of the study and are excluded from `pnpm lint`
(eslint.config.mjs) and from vitest's coverage.

## Opponent, win probability and manager profiles (`opponent_*.mjs`)

The offline work behind `lib/lockin/managerProfiles.js`, `lib/lockin/recalibrate.js`,
`PLAY_MODEL` in `lib/lockin/availability.js`, `priorSeasonWeight` in `lib/lockin/model.js`
and `WIN_LEAN` in `lib/lockin/matchup.js`. They read and write under `LOCKIN_CACHE_DIR`
(default `scripts/lockin/cache/`); Sleeper responses go to `opponent_responses/` inside it.

| Step | Command | Produces |
|---|---|---|
| 1 | `node scripts/lockin/opponent_fetch_data.mjs` | `chain.json` (the league chain: lock-in, `game_mode` 1, in every season 2022-2026), matchups, rosters, users, schedules, scores feeds, and 2024-2026 logs for every rostered player (about 1,000 requests the first time) |
| 2 | `node scripts/lockin/opponent_fetch_old.mjs` | 2022 and 2023 logs for players in those seasons' matchups (about 600 requests) |
| 3 | `node scripts/lockin/opponent_profiles.mjs` | `profiles.json`, `profiles.txt`: league and per-manager profiles (1,358 team-weeks), half-life and credibility chosen out of sample, and the held-out test of manager vs league profile |
| 4 | `node scripts/lockin/opponent_write_profiles.mjs` | rewrites `lib/lockin/managerProfiles.js` from `profiles.json` |
| 5 | `node scripts/lockin/opponent_measures.mjs` | `measures.txt`, `recal.json`: player-spread calibration by tercile, "beats it" on real lock situations with the 2023-2025 / 2026 recalibration, and the prior-season weight test |
| 6 | `node scripts/lockin/opponent_avail.mjs` | `avail.txt`, `avail_coef.json`: the play-probability model, fit on 2025, tested on 2026 |
| 7 | `node scripts/lockin/opponent_backtest_wp.mjs` | `backtest_wp.txt`: points vs win-probability vs wait-to-deadline policies on the 240 active team-weeks. Needs steps 1 and 4 of the study above (it reads the study cache through `data.mjs`). `CALIB=1` writes the P(win) calibration (`calib_wp.txt`) instead; `WIDEN=a,b` widens my and the opponent's totals; `GAP=x` acts on the win-probability lean only above that gap |

`opponent_data2.mjs` loads all five seasons through `lib/lockin/normalize.js`;
`opponent_calib_report.mjs` holds the calibration tables for step 7.
