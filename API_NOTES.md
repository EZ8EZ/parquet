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

### ⚠️ `commissioner` transactions — a real-data trap (verified)
`type` is NOT limited to trade/waiver/free_agent. The live league also emits
**`commissioner`**, and it breaks two assumptions:

1. **Multi-team trades are shredded.** Sleeper's UI can't express a 3-team trade, so
   the commissioner executes it by hand and it lands as N separate `commissioner`
   rows, one per player, with nothing linking them. Verified example — NSL Fantasy
   Hoops, **2023-07-03**, four rows that are actually ONE three-team trade:
   | tx | player | from → to |
   |---|---|---|
   | 981392875004981248 | Devin Booker | NSLKB → EZ8 |
   | 981393045398618112 | Jordan Poole | EZ8 → NSLKB |
   | 981396413038772224 | Klay Thompson | NSLKB → aidsnuge |
   | 981392784131178496 | Deandre Ayton | aidsnuge → NSLKB |
   All four share `creator: 882656931146457088` (the commissioner) and week/`leg` 1.
   → Handled by `lib/derive/coalesce.ts` (time-window + roster union-find → one trade).

2. **`draft_picks` is ALWAYS EMPTY on commissioner rows.** Confirmed: every
   commissioner transaction in 2023 has `draft_picks: []` and `waiver_budget: []`.
   Picks moved as part of a commissioner trade therefore have **no transaction record
   whatsoever** — the only evidence is the `traded_picks` snapshot (which carries no
   timestamp). → Handled by `lib/picks.ts` reconciliation: any pick ownership change
   in `traded_picks` that no transaction's `draft_picks` explains is surfaced as an
   unrecorded/commissioner-era transfer and attributed to the matching parties.

Consequence for analytics: without both fixes, commissioner-era trades are invisible
to strategy/dossier/ledger, and their pick components are lost entirely.

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

### Drafts

Probed empirically 2026-07-29 against all five leagues in the chain. **NBA drafts
return full, usable pick data** — no NFL-only gaps. Every endpoint below returned
`HTTP 200` for every real id in the chain.

#### `/league/{league_id}/drafts` → `200`, array

One draft per league season (14-team `NSL Fantasy Hoops`). Verified ids:

| Season | league_id | draft_id | `status` | `type` | `rounds` | picks |
|---|---|---|---|---|---|---|
| 2026 | 1347007735815766016 | 1347007735828324352 | `pre_draft` | `linear` | 3 | **0** |
| 2025 | 1240499656799039488 | 1240499656807424000 | `complete` | `linear` | 3 | 42 |
| 2024 | 1120065345508716544 | 1120065345508716545 | `complete` | `linear` | 3 | 42 |
| 2023 | 939559419015180288 | 939559419015180289 | `complete` | `linear` | 3 | 42 |
| 2022 | 882658029521240064 | 882658030053965824 | `complete` | **`snake`** | **17** | **238** |

Observed keys: `draft_id, league_id, season, season_type, sport ("nba"), status,
type, created, start_time, last_picked, last_message_id, last_message_time,
creators[], metadata{name,description,scoring_type}, settings{rounds, teams,
pick_timer, reversal_round, player_type, slots_*, ...}, draft_order`.

⚠️ **`slot_to_roster_id` is NOT on the list endpoint.** The `/drafts` array items
carry `draft_order` but omit `slot_to_roster_id`. It only appears on
`/draft/{draft_id}`. Since `slot_to_roster_id` is the *entire* basis of pick
lineage, drafts must be re-fetched individually — the list alone is not enough.

#### `/draft/{draft_id}` → `200`, object

Same shape as the list item **plus** `slot_to_roster_id`:
```json
"slot_to_roster_id": { "1": 11, "2": 2, "3": 7, ... }   // draft slot -> roster_id
"draft_order":       { "882695796544577536": 6, ... }    // user_id -> draft slot
```
Verified the two agree via `/league/{id}/rosters` (`owner_id` of
`slot_to_roster_id[slot]` === the `draft_order` user at that slot) — 14/14 for 2025.

Bad id → `HTTP 404`, body `null`.

#### `/draft/{draft_id}/picks` → `200`, array

All fields the feature needs are present for NBA. Observed keys (identical for all
five seasons): `draft_id, pick_no, round, draft_slot, roster_id, picked_by,
player_id, is_keeper, reactions, metadata`.

```json
{ "draft_id":"1240499656807424000", "draft_slot":1, "pick_no":1, "round":1,
  "roster_id":6, "picked_by":"882695796544577536", "player_id":"4760",
  "is_keeper":null, "reactions":null,
  "metadata":{ "first_name":"Cooper","last_name":"Flagg","player_id":"4760",
               "position":"SF","team":"DAL","status":"ACT","number":"32",
               "sport":"nba","injury_status":"","years_exp":"0",
               "news_updated":"1753899621158" } }
```

Data-quality checks across 2022–2025 (364 picks): **0** missing `player_id`, **0**
null `picked_by`, `is_keeper` is `null` on every single pick.
`picked_by` === the `owner_id` of `roster_id` in 364/364 cases.
`metadata` numeric-ish fields are **strings** (`number`, `years_exp`,
`news_updated`), so schemas must coerce, not assume numbers.
`metadata.team_abbr` / `metadata.team_changed_at` appear in 2024 + 2025 but are
**absent** in 2022 + 2023 → must be optional.

A `pre_draft` draft returns `[]` with `HTTP 200` (2026), **not** a 404. Bad
draft_id → `HTTP 404`, body `null`. A bad league_id on `/drafts` returns `[]` with
`HTTP 200` (so "no drafts" and "no such league" are indistinguishable).

#### ⭐ The lineage key — verified, not assumed

Two different roster ids live on each pick and the distinction is the whole feature:

- `slot_to_roster_id[draft_slot]` = the roster that **originally owned** that slot.
- `pick.roster_id` = the roster that **actually made** the pick, after trades.

Verified against `/draft/{draft_id}/traded_picks` for 2025:
`traded_picks[(season, round, originalRoster)].owner_id ?? originalRoster`
predicted `pick.roster_id` for **42/42 picks, 0 mismatches**. So a traded pick is
resolved to its player by: original roster → slot (reverse `slot_to_roster_id`) →
the pick at that `(round, slot)`.

`/draft/{draft_id}/traded_picks` also exists (`200`) with the same shape as the
league endpoint plus a numeric `draft_id`. Not needed by us — the chain-wide
`h.tradedPicksHistory` already carries this.

#### ⚠️ Do NOT compute `pick_no` from round + slot

`pick_no === (round - 1) * teams + draft_slot` holds for the `linear` rookie drafts
(2023–2026) but is **FALSE for the 2022 `snake` startup draft** — verified: round 2
runs slot 14 → 1 (`pick_no` 15 = slot 14, 16 = slot 13, …). Always order the board
by the API's own `pick_no` and never reconstruct it.

#### Caveats worth remembering

- Roster ids are stable across the chain here, but `slot_to_roster_id` is scoped to
  its own season's league. The 2022→2024 owner swap
  (`882785740399087616` → `866379005824217088`) changed the *user* on a roster, not
  the `roster_id`, so per-season slot maps stay comparable.
- 2022 is a 17-round startup snake draft, not a rookie draft — it has no traded
  picks to trace, but it is still a legitimate, browsable board.
- `metadata` is denormalized onto each pick, which makes the board renderable even
  if a player later drops out of `/players/nba`. Prefer `h.players` for display and
  fall back to `metadata`.

## Stats provider decision
Sleeper stats/projections endpoints are unreliable; **not used** for valuation.
See DECISIONS.md — v1 valuation runs on Sleeper's `search_rank` + age/role signals,
abstracted behind a `StatsProvider` interface with a fixture implementation so a
real stats source (balldontlie.io) can be swapped in without touching callers.
