# scripts/calibration - the D116 studies, kept as reference

These are the research scripts behind DECISIONS.md **D116** (the price anchor moves
onto Sleeper's dynasty market, the base curve becomes a measured hybrid, thresholds
become ranks, rookie picks are refit). They are **frozen reference material**, not app
source: nothing in `lib/` or `app/` imports them, they are not tested, and the numbers
they produced were pasted by hand into the comments of `lib/valuation/config.js`,
`lib/valuation/market.js` and the D116 entry - the same "run by hand, paste the output"
convention `scripts/derive-age-curve.js` and `scripts/derive-production.js` use.

Re-run them to check a number or to refit after another season of data, not as part
of any build. They are deliberately left close to how they were run (dense, pure
Python / plain Node, no numpy, no deps); the only edit on the way in was making the
data directory portable (`CALIB_DATA`, below).

## Getting the data

Every script reads local copies of Sleeper's public API, not the live API. All of it
is unauthenticated and free. Default location is `scripts/calibration/data/`
(gitignored, ~9 MB); set `CALIB_DATA=/some/dir` to point every script elsewhere.

The one-shot way (skips files already present, 4 concurrent requests):

```sh
cd scripts/calibration/anchor && mkdir -p ../data && node fetch.mjs
```

Or by hand:

```sh
D=scripts/calibration/data; mkdir -p $D; B=https://api.sleeper.app/v1
curl -s $B/players/nba                       -o $D/players.json     # ~2.5 MB
for y in 2021 2022 2023 2024 2025 2026; do                         # ~190-255 KB each
  curl -s $B/projections/nba/regular/$y      -o $D/proj$y.json
done
for y in $(seq 2013 2026); do                                      # ~140-320 KB each
  curl -s $B/stats/nba/regular/$y            -o $D/stats$y.json
done
```

`picks/pickcal.py` additionally walks this league's chain live
(`/league/{id}`, `/league/{id}/drafts`, `/draft/{id}/picks`, via `curl`) starting from
`1347007735815766016` and writes `leaguedrafts.json` into the data directory. The
other pick and room scripts read that file, so run `pickcal.py` first.

Endpoint semantics (the `999` sentinel, `gp = 1` per-game rows, why the 2021-2025
projection stat lines are hindsight while their ADPs are not) are in `API_NOTES.md`
under "Projections" and "Season stats". Read that before trusting a new number.

**The snapshots are frozen.** `anchor/drift.mjs` re-fetched 2021, 2024, 2026
projections and 2025 stats on 2026-10-01 and found 0 changed rows - so a re-run today
reproduces the published numbers. The 2026 projection snapshot is the exception that
will NOT stay frozen: its ADPs move daily until the season starts.

## The studies

| dir | question | run | result went to |
|---|---|---|---|
| `curve/` | What shape should `base(rank)` have? | `python3 curve/curve.py` then `python3 curve/curve.py hyb` | `rankDecay` / `rankPower` and their comment in `lib/valuation/config.js`; D116 (f) |
| `picks/` | What is a rookie pick worth, by slot? | `python3 picks/pickcal.py` (fetch), then `python3 picks/calibrate.py` (old base) and `python3 picks/calibrate_hybrid.py` (new base) | `pick.*` in `lib/valuation/config.js`; `classStrength` comment; D116 (h) |
| `room/` | Does this league's own draft order beat the market? | `python3 room/room.py` | `lib/valuation/market.js` header ("deliberately does not do"); the draft recap; D116 (d) |
| `anchor/` | Which market should the price descend from, how much age survives on it, and where are its holes? | `sh anchor/run_all.sh` | `DYNASTY_WEIGHT` in `lib/valuation/market.js`; `marketAgeExponent` in `config.js`; D116 (a), (c), (e) |

### `curve/curve.py` - the base curve

Target: for each of the top 250 players by dynasty ADP in the 2021, 2022 and 2023
snapshots (n = 750 player-snapshots), the discounted (0.9/season) sum over the
following seasons through 2025 of fantasy points per game ABOVE REPLACEMENT, weighted
by availability (`min(gp, 70) / 70`), zero for a season not played. Replacement is the
N-th best per-game scorer among players with 20+ games; N = 98, 112, 126, 140 are all
reported because replacement level is the single biggest lever (see `REPORT.md`,
caveat 1). Fits pure exponential, power, exponential + floor, the old `k = 0.021`, and
the hybrid `r^-a * e^(-k(r-1))` by grid search, plus the consolidation ratios (#10 vs
two #30s, etc.). `REPORT.md` is the study's own write-up, kept verbatim. Writes
`curve/results.json`.

### `picks/` - the rookie pick curve

`pickcal.py` builds `leaguedrafts.json` (every completed draft in the chain: season,
pick_no, player, that season's dynasty ADP) and prints each slot against the old curve.
`calibrate.py` prices every pick of the 2023-2026 rookie drafts (the 2022 startup is
excluded) as `base(rank of the drafted player in that season's dynasty-ADP snapshot)`
- "a pick is worth what it converts into on draft night" - and fits
`V(k) = floor + (top - floor) e^(-d(k-1))` to the per-slot means by raw LS, log LS and
quasi-Poisson WLS, with the exact by-class bootstrap (all 4^4 = 256 resamples of the
four classes). It also reports class strength by round, the 1.01 premium, and a
realized-production check on the 2023-2025 classes. `calibrate_hybrid.py` is the same
script with only the base curve changed (one line: `Vb`) to the D116 hybrid - the
constants that ship come from THIS one, because a pick is priced on the same base as
the player it becomes. Both write `picks/results.json` (the second overwrites the
first). `REPORT.md` is the old-base write-up.

### `room/room.py` - the room vs the market

For the 126 picks of the 2023, 2024 and 2025 rookie drafts: Spearman of this league's
pick order and of Sleeper's dynasty ADP against era-normalized, discounted fantasy
production through 2025; their mutual correlation; the partial correlation of the
room's order given the market's (and its z); and the best blend weight on the room.
Prints only; the output is quoted in `market.js` and D116 (d).

### `anchor/` - which market, how much age, what coverage

`lib.mjs` holds the shared pieces: loading, the league's scoring (with the
`bonus_pt_40p/50p` artefact excluded - see API_NOTES), era normalization, rank
statistics, bootstrap, a Poisson GLM. `run_all.sh` fetches and runs everything below,
writing `out_*.txt` and `results_*.json` and merging them into `results.json`.

- `q1q2.mjs` - Q1: dynasty ADP vs redraft ADP vs a log-space blend, predicting
  three-season era-normalized production (pooled n = 986 over 2021-2023). Q2: how much
  youth predicts beyond each anchor. Source of `DYNASTY_WEIGHT = 0.45`.
- `q1b.mjs` - Q1 at every horizon 1-5 seasons, per snapshot (does the dynasty side
  gain with horizon? about +0.01 rho per season).
- `q2b.mjs` - the age exponent gamma: re-derives a horizon-matched age curve from the
  2013-2019 seasons and fits `gamma` in `E[T] = exp(a + f(anchor) + gamma * log m(age))`
  on the dynasty, redraft and both-ADP anchors. Source of `marketAgeExponent = 0.5`.
- `q3pre.mjs` - are the 2021-2025 projection stat lines real projections? (No: they
  match the realized season, rho 0.99.)
- `q3.mjs`, `q3b.mjs` - the same anchor questions on rookies only.
- `q4.mjs` - a graduation curve: how fast observed NBA games should displace the
  draft-night prior for a young player. Measured, not yet used.
- `q5.mjs` - coverage of the 2026 dynasty market against `search_rank` (every top-200
  player has a dynasty ADP; every top-300 player without one is a teamless free agent),
  and `search_rank` vs `adp_std`.
- `q6.mjs` - red-team follow-ups (right-tail estimands, young/rookie subsets, snapshot
  dependence of gamma, coverage by age). Not in `run_all.sh`; run on its own.
- `drift.mjs` - re-fetches four endpoints and diffs them against the local copies.
- `merge.mjs` - collects every `results_*.json` into `results.json`.

## Known limits of all four

- Three overlapping market snapshots (2021-2023) share most of their target seasons,
  so "n = 750" or "n = 986" is many player-rows but few independent market draws.
- The 2023 snapshot sees only three seasons of outcome, the 2022 four; a dynasty price
  is about longer than the data can see.
- Sleeper's dynasty ADP is pooled across every Sleeper dynasty league, not scored for
  this one, and per-game targets ignore lock-in's best-of-week option value.
- The head of the base curve (ranks 1-3) rests on about nine player-snapshots.
