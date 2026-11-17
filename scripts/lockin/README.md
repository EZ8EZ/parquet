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
