# Parquet

Parquet is a phone-first companion for one real league: NSL Fantasy Hoops, a 14-team
dynasty basketball league on Sleeper that plays in lock-in mode. It is built for the
managers in that league, not for the dynasty market in general. A first visit asks whose
team you are (`/teams`), then remembers it. Sleeper already does the matchup,
the lineup screen and the news. Parquet adds numbers Sleeper does not show, computed from
this league's own data.

## Direction

By owner decision on 2026-11-16, the spine of the app is **this week's decisions in
lock-in mode**: bank a score now or hold the slot for a later game. The decision ledger,
the revealed-vs-stated strategy read and the trade and valuation surfaces stay, but are
no longer the centre. The engine for the weekly decision is in `lib/lockin/`. It is
merged and tested; no page reads it yet.

<!-- PLACEHOLDER (unmerged work): the four-tab navigation (This Week, Team, Trade,
League), the rebuilt Home and the lock-or-hold cards and charts are on other branches.
Describe them here once they merge. Until then the pages are those listed in lib/nav.js. -->

An earlier owner decision still holds (2026-08-19, D91): no AI and no subjective
component. Every number is a statistical call from the league's own data.

## The lock-in numbers

Each of the 7 starting slots banks one game per week. A manager may lock a starter's
score after a game and before his next tip. A starter never locked scores his last game
of the week, which is 0 if he does not play. For each starter `lib/lockin` computes:

- **Expected if held**: what holding is worth on average, given the games he has left. It
  comes from a model of his next game (recent form, and the spread of his last 30 games).
- **Chance a later game beats it**: the probability that a later game this week is played
  and scores more than the score he could lock now.
- **The lean**: lock, hold or none, labelled as the model's. It weighs the whole lineup
  (open slots, who still plays tonight and later), not one player alone. Its record in a
  backtest against what managers actually banked: **+9.4 points per team-week, 95%
  interval +5.5 to +14.7, n=240 active team-weeks** (2025 weeks 1-23, 2026 weeks 1-3).

What they are not:

- Not a reading of lock state, which Sleeper does not expose. A lock is certain only when
  the banked score differs from his latest completed game and matches an earlier one.
- Not free of assumptions. The backtest knew who would play his next game. Sleeper does
  not record mid-week lineup moves; under the most pessimistic reading of them the simpler
  per-player rule gains only +0.8 (+0.3 to +1.5) per team-week.
- Not exact at the top: the chance a later game beats it overstates by up to 13 points
  in the 0.6-0.8 band (n=731 of 4,109 games).
- Opponent history (noise: partial rho 0.026, n=18,812 games) and per-player teammate
  effects (+1.7 points on average when a teammate is out, n=6,432 games, but split-half
  r 0.15 per player) are left out.

Constants and sources: `MODEL_INFO` and `LEAN_RECORD` in `lib/lockin/index.js`.
`/methodology` explains them for a manager.

## House rules

1. **No grades or verdicts on a manager's past choices.** A forward-looking lean is
   allowed and is labelled as the model's (D6, refined by D120). Known tension:
   `/drafts/grades` and some awards still score past choices.
2. **Never state what the data cannot support** (D19). A failed Sleeper request shows as a
   named gap in a banner, not as a quiet week.
3. **Every number carries its n**, plus method and caveats where it is a measurement.
4. Plain JavaScript. Fits run offline in `scripts/` and are committed as constants in
   `lib/`; nothing is fitted at request time.

## Run it

Needs Node 22 (what CI uses) and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm db:generate     # Prisma client; no database needed
pnpm dev             # http://localhost:3000, the real league, live from Sleeper
LEAGUE_PROVIDER=fixture pnpm dev   # offline, a synthetic five-season league
```

Checks (CI runs lint and test; run the build and the smoke test too):

```bash
pnpm test && pnpm lint && pnpm build
pnpm exec playwright test e2e/smoke.spec.js
```

Playwright starts its own dev server on port 3199 with the fixture league; set `E2E_PORT`
if that port is taken. `pnpm e2e` runs every spec. Environment variables, all optional
(`.env.example` documents each):

| Variable | Default | Effect |
|---|---|---|
| `LEAGUE_PROVIDER` | `sleeper` | `sleeper`, `fixture` or `csv` |
| `SLEEPER_LEAGUE_ID` | NSL Fantasy Hoops 2026 | League to read (`lib/providers/defaults.js`) |
| `SLEEPER_USERNAME` | `EZ8` | Whose team is "you" by default |
| `CSV_DIR` | unset | CSV export directory, with `LEAGUE_PROVIDER=csv` |
| `DATABASE_URL` | unset | Postgres, used only by the decision ledger. Unset, Prisma is not loaded on the read path and a note is kept for the session only. `pnpm db:push` applies the schema |
| `AUTH_SECRET` | unset | Unset is single-user mode. Set, ledger writes need a signed seat; `pnpm claim-links <origin>` prints one link per manager |
| `NEXT_PUBLIC_USE_PLAYER_PHOTOS` | on | `false` turns Sleeper headshots off. A fork's Vercel deploy defaults to off (`lib/photos.js`) |
| `PARQUET_DEBUG_TIMINGS` | unset | `1` logs load times of the two heaviest loaders |

## Deploy (Vercel)

Connect the repository to Vercel; no environment variables are needed. Vercel builds a
preview for each pushed branch and production from the default branch (its standard
behaviour for a Git-connected project). `pnpm build` runs `prisma generate` first.

All Sleeper reads go through one client (`lib/providers/sleeper/client.js`): 5 s timeout
per attempt, and one table of cache lifetimes, from forever for completed seasons to
5 minutes for current rosters and matchups, kept in Next's data cache so it survives cold
starts. A first load with an empty cache made 155 Sleeper requests in about 3 s (one local
run, 2026-11-16).

### Lineup snapshots and the `data` branch

Sleeper keeps neither lock state nor mid-week lineup changes. To measure them later,
`.github/workflows/snapshot-lineups.yml` runs `scripts/snapshot-lineups.js` hourly at
minute 17. It copies the week's matchups to
`snapshots/lineups/{season}/week-{NN}/{timestamp}.json` on an orphan `data` branch and
commits only when the payload changed. The `data` branch carries a `vercel.json` that
disables deployments, its commits say `[skip ci]`, and CI runs only on pull requests and
pushes to `main`. Nothing in the app reads these files yet.

An operator must:

1. Merge the workflow to the default branch; GitHub runs scheduled workflows only from
   there. The first run creates `data`. To start at once, run it by hand (Actions,
   "Snapshot lineups", Run workflow).
2. Let Actions push: the job asks for `contents: write`. If the push is refused, check
   Settings, Actions, General, Workflow permissions.

To try it locally without writing into the repository:
`SNAPSHOT_DIR=/tmp/lineups node scripts/snapshot-lineups.js`.

## Where things live

`app/` pages, `components/` UI, `lib/` logic as pure functions: `lib/providers/`
(Sleeper, CSV or fixture data into one model), `lib/lockin/` (the weekly engine),
`lib/valuation/` (asset values; every weight in `config.js`), `lib/gameplan/` and
`lib/trade*/` (plan and trade tools). `scripts/` holds offline fits, ingest, seed and the
snapshot job. Stack: Next.js 16, React 19, Tailwind 4, Zod 4, Prisma 7 (Postgres,
optional), Vitest 4, Playwright.

## Docs

[DECISIONS.md](DECISIONS.md) (choices and what was rejected; index at the top),
[API_NOTES.md](API_NOTES.md) (Sleeper as observed), [SHELVED.md](SHELVED.md) (what was
removed and what would bring it back), [QUESTIONS.md](QUESTIONS.md) (owner decisions),
[DESIGN.md](DESIGN.md), [TEAM.md](TEAM.md).

## License

MIT. See [LICENSE](LICENSE).
