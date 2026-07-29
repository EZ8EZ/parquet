# API_NOTES.md — Observed behavior of external APIs

All shapes below are **empirically observed**, not assumed. Probed 2026-07-28.

## Sleeper API — `https://api.sleeper.app/v1`

Read-only, no auth, no key. Rate limit ~1000 req/min. **No write access exists** —
this app can advise but never execute a transaction. Every recommendation therefore
ends in a copyable summary the user pastes into Sleeper.

### Resolve user — `/user/EZ8`
```json
{ "user_id": "882695796544577536", "username": "ez8", "display_name": "EZ8",
  "avatar": "d22e52781a5d7a94bcbf2aa70e748382" }
```
Username is case-insensitive; `EZ8` resolves. `user_id` is the stable handle.

### Leagues — `/user/{user_id}/leagues/nba/{season}`
EZ8 has exactly **one NBA league per season**, name **"NSL Fantasy Hoops"**, a
14-team dynasty. Full `previous_league_id` chain assembled:

| Season | league_id | previous_league_id | status |
|--------|-----------|--------------------|--------|
| 2026 | 1347007735815766016 | 1240499656799039488 | pre_draft |
| 2025 | 1240499656799039488 | 1120065345508716544 | complete |
| 2024 | 1120065345508716544 | 939559419015180288 | complete |
| 2023 | 939559419015180288 | 882658029521240064 | complete |
| 2022 | 882658029521240064 | null (CHAIN START) | complete |

**Resolved `SLEEPER_LEAGUE_ID=1347007735815766016`** (current 2026 season). Ingest
walks `previous_league_id` back to null to assemble the full 5-season corpus.

### League detail — `/league/{league_id}`
Key fields: `name`, `sport` ("nba"), `season`, `status`, `total_rosters` (14),
`previous_league_id`, `roster_positions`, `scoring_settings`, `settings`.

`roster_positions` (2026): `PG, SG, SF, PF, C, UTIL, UTIL, + 9×BN`. No IR slot.
Dynasty markers present: `taxi_slots`, `taxi_years`, `pick_trading: 1`.

`scoring_settings` (2026) — **points league, category-weighted**, NOT H2H categories:
```json
{ "pts": 0.5, "reb": 1.0, "ast": 1.0, "stl": 2.0, "blk": 2.0, "to": -1.0,
  "tpm": 0.5, "dd": 1.0, "td": 2.0, "bonus_pt_40p": 2.0, "bonus_pt_50p": 2.0,
  "ff": -2.0, "tf": -2.0 }
```
Steals & blocks are weighted 4× points and 2× rebounds/assists — the valuation
model must read this from the league object, never hardcode. (See `lib/valuation`.)

### Rosters — `/league/{league_id}/rosters`
14 entries. Keys: `roster_id`, `owner_id`, `co_owners`, `players` (array of
player_id strings), `starters`, `reserve`, `taxi`, `keepers`, `player_map`,
`settings`, `metadata`. `settings` carries the standings:
`{ wins, losses, ties, fpts, fpts_decimal, fpts_against, ppts (potential pts),
   waiver_position, waiver_budget_used, total_moves }`.

### Users — `/league/{league_id}/users`
14 entries. Keys: `user_id`, `display_name`, `avatar`, `is_owner`, `is_bot`,
`metadata` (has `team_name` sometimes, `mention_pn`, `allow_pn`), `settings`.
Note: leaguemate `yagevlevi` is the author of the football competitor cited in the
brief (`yagev-levis-projects.vercel.app`). Same league.

### Transactions — `/league/{league_id}/transactions/{week}`
**Full parity with NFL confirmed.** Keys: `type` ("trade" | "waiver" |
"free_agent"), `status` ("complete" | "failed"), `adds` (map `player_id`→`roster_id`
receiving), `drops` (map `player_id`→`roster_id` dropping), `draft_picks` (array),
`roster_ids` (involved), `consenter_ids` (roster_ids who agreed), `creator`
(user_id who initiated — **key for dossiers: who initiates vs responds**),
`created` (ms epoch), `status_updated` (ms epoch), `metadata`, `settings`
(waiver bid), `waiver_budget`, `leg` (week within season), `transaction_id`.

`draft_picks` entry shape:
```json
{ "round": 1, "season": "2026", "league_id": null,
  "roster_id": 10, "owner_id": 3, "previous_owner_id": 10 }
```
`roster_id` = the pick's original team; `owner_id` = who owns it after this txn;
`previous_owner_id` = who owned it before.

Transactions are **paged by week** (`leg`). NBA weeks run ~1–20+. Empty weeks
return `[]`. Ingest sweeps weeks 1..25 per season and stops safely on empties.
Observed volume 2025: wk1=84, wk2=31, wk5=17, wk10=2, wk15=21.

### Traded picks — `/league/{league_id}/traded_picks`
90 entries for 2025. Shape:
```json
{ "round": 1, "season": "2025", "roster_id": 1, "owner_id": 8, "previous_owner_id": 3 }
```
Snapshot of current pick ownership (vs `draft_picks` which is per-transaction).

### Players — `/players/nba`
**2.3 MB, 2105 players.** Cache aggressively; never call from a render path.
586 have a current `team`; 2053 have `age`. Rich per-player fields:
`player_id, full_name, first_name, last_name, team, position, fantasy_positions[],
age, years_exp, birth_date, height, weight, college, number, status, injury_status,
injury_body_part, depth_chart_position, depth_chart_order, search_rank`, plus
external IDs: `espn_id, yahoo_id, rotowire_id, sportradar_id, ...` (espn_id useful
for optional headshot CDN behind a flag).

### Matchups — `/league/{league_id}/matchups/{week}`
Not yet deep-probed; used for after-win/after-loss behavioral signals. Standard
shape `{ roster_id, matchup_id, points, players, starters, players_points }`.

## Stats provider decision
Sleeper stats/projections endpoints are unreliable; **not used** for valuation.
See DECISIONS.md — v1 valuation runs on Sleeper's `search_rank` + age/role signals,
abstracted behind a `StatsProvider` interface with a fixture implementation so a
real stats source (balldontlie.io) can be swapped in without touching callers.
