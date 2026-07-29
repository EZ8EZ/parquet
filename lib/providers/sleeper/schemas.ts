/**
 * Zod schemas for RAW Sleeper API responses + mappers into domain types.
 *
 * Every external response is validated here (no exceptions, per project rules).
 * Schemas are intentionally lenient with `.nullish()` because Sleeper returns
 * `null` for many fields; the mappers apply safe defaults so callers get clean
 * domain objects.
 */
import { z } from "zod";
import type {
  DraftMeta,
  DraftPick,
  DraftPickRef,
  League,
  LeagueDetail,
  LeagueUser,
  Matchup,
  Player,
  Roster,
  TradedPick,
  Transaction,
  User,
} from "../types";

const num = z.number();
const str = z.string();

// ---------- User ----------
export const RawUser = z.object({
  user_id: str,
  username: str.nullish(),
  display_name: str.nullish(),
  avatar: str.nullish(),
});
export function toUser(r: z.infer<typeof RawUser>): User {
  return {
    userId: r.user_id,
    username: r.username ?? "",
    displayName: r.display_name ?? r.username ?? r.user_id,
    avatar: r.avatar ?? null,
  };
}

// ---------- League ----------
export const RawLeague = z.object({
  league_id: str,
  name: str,
  season: str,
  sport: str,
  status: str.nullish(),
  previous_league_id: str.nullish(),
  total_rosters: num.nullish(),
  roster_positions: z.array(str).nullish(),
  scoring_settings: z.record(str, num).nullish(),
  settings: z.record(str, num).nullish(),
});
export function toLeague(r: z.infer<typeof RawLeague>): League {
  return {
    leagueId: r.league_id,
    name: r.name,
    season: r.season,
    sport: r.sport,
    status: r.status ?? "unknown",
    previousLeagueId: r.previous_league_id ?? null,
    totalRosters: r.total_rosters ?? 0,
  };
}
export function toLeagueDetail(r: z.infer<typeof RawLeague>): LeagueDetail {
  return {
    ...toLeague(r),
    rosterPositions: r.roster_positions ?? [],
    scoringSettings: r.scoring_settings ?? {},
    settings: r.settings ?? {},
  };
}

// ---------- Roster ----------
export const RawRosterSettings = z
  .object({
    wins: num.nullish(),
    losses: num.nullish(),
    ties: num.nullish(),
    fpts: num.nullish(),
    fpts_decimal: num.nullish(),
    fpts_against: num.nullish(),
    fpts_against_decimal: num.nullish(),
    ppts: num.nullish(),
    ppts_decimal: num.nullish(),
    waiver_budget_used: num.nullish(),
    waiver_position: num.nullish(),
    total_moves: num.nullish(),
  })
  .nullish();

export const RawRoster = z.object({
  roster_id: num,
  owner_id: str.nullish(),
  co_owners: z.array(str).nullish(),
  players: z.array(str).nullish(),
  starters: z.array(str).nullish(),
  reserve: z.array(str).nullish(),
  taxi: z.array(str).nullish(),
  settings: RawRosterSettings,
});
export function toRoster(r: z.infer<typeof RawRoster>): Roster {
  const s = r.settings ?? {};
  const whole = (a?: number | null, dec?: number | null) =>
    (a ?? 0) + (dec ?? 0) / 100;
  return {
    rosterId: r.roster_id,
    ownerId: r.owner_id ?? null,
    coOwners: r.co_owners ?? [],
    players: r.players ?? [],
    starters: (r.starters ?? []).filter((p) => p && p !== "0"),
    reserve: r.reserve ?? [],
    taxi: r.taxi ?? [],
    settings: {
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      ties: s.ties ?? 0,
      fpts: whole(s.fpts, s.fpts_decimal),
      fptsAgainst: whole(s.fpts_against, s.fpts_against_decimal),
      ppts: whole(s.ppts, s.ppts_decimal),
      waiverBudgetUsed: s.waiver_budget_used ?? 0,
      waiverPosition: s.waiver_position ?? 0,
      totalMoves: s.total_moves ?? 0,
    },
  };
}

// ---------- League user ----------
export const RawLeagueUser = z.object({
  user_id: str,
  display_name: str.nullish(),
  avatar: str.nullish(),
  is_owner: z.boolean().nullish(),
  is_bot: z.boolean().nullish(),
  metadata: z.record(str, z.unknown()).nullish(),
});
export function toLeagueUser(r: z.infer<typeof RawLeagueUser>): LeagueUser {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const teamName = typeof meta.team_name === "string" ? meta.team_name : null;
  return {
    userId: r.user_id,
    displayName: r.display_name ?? r.user_id,
    avatar: r.avatar ?? null,
    teamName,
    isOwner: r.is_owner ?? false,
    isBot: r.is_bot ?? false,
  };
}

// ---------- Draft pick ref ----------
export const RawDraftPick = z.object({
  round: num,
  season: str,
  roster_id: num,
  owner_id: num,
  previous_owner_id: num,
});
export function toDraftPick(r: z.infer<typeof RawDraftPick>): DraftPickRef {
  return {
    round: r.round,
    season: r.season,
    rosterId: r.roster_id,
    ownerId: r.owner_id,
    previousOwnerId: r.previous_owner_id,
  };
}

// ---------- Transaction ----------
export const RawTransaction = z.object({
  transaction_id: str,
  // Widened from an enum: the live API emits types beyond trade/waiver/free_agent
  // (e.g. "commissioner"). Accept any string so a single odd type can't fail a week.
  type: str,
  status: str.nullish(),
  created: num.nullish(),
  status_updated: num.nullish(),
  creator: str.nullish(),
  roster_ids: z.array(num).nullish(),
  consenter_ids: z.array(num).nullish(),
  adds: z.record(str, num).nullish(),
  drops: z.record(str, num).nullish(),
  draft_picks: z.array(RawDraftPick).nullish(),
  settings: z.record(str, num).nullish(),
  leg: num.nullish(),
});
export function toTransaction(
  r: z.infer<typeof RawTransaction>,
  season: string,
): Transaction {
  const settings = r.settings ?? {};
  return {
    transactionId: r.transaction_id,
    type: r.type,
    status: r.status ?? "complete",
    season,
    week: r.leg ?? 0,
    created: r.created ?? 0,
    statusUpdated: r.status_updated ?? r.created ?? 0,
    creator: r.creator ?? null,
    rosterIds: r.roster_ids ?? [],
    consenterIds: r.consenter_ids ?? [],
    adds: r.adds ?? {},
    drops: r.drops ?? {},
    draftPicks: (r.draft_picks ?? []).map(toDraftPick),
    waiverBid: settings.waiver_bid ?? null,
  };
}

// ---------- Traded pick ----------
export const RawTradedPick = z.object({
  round: num,
  season: str,
  roster_id: num,
  owner_id: num,
  previous_owner_id: num,
});
export function toTradedPick(r: z.infer<typeof RawTradedPick>): TradedPick {
  return {
    round: r.round,
    season: r.season,
    rosterId: r.roster_id,
    ownerId: r.owner_id,
    previousOwnerId: r.previous_owner_id,
  };
}

// ---------- Matchup ----------
export const RawMatchup = z.object({
  roster_id: num,
  matchup_id: num.nullish(),
  points: num.nullish(),
});
export function toMatchup(
  r: z.infer<typeof RawMatchup>,
  week: number,
): Matchup {
  return {
    rosterId: r.roster_id,
    matchupId: r.matchup_id ?? null,
    points: r.points ?? 0,
    week,
  };
}

// ---------- Player ----------
export const RawPlayer = z.object({
  player_id: str,
  full_name: str.nullish(),
  first_name: str.nullish(),
  last_name: str.nullish(),
  team: str.nullish(),
  position: str.nullish(),
  fantasy_positions: z.array(str).nullish(),
  age: num.nullish(),
  years_exp: num.nullish(),
  birth_date: str.nullish(),
  injury_status: str.nullish(),
  depth_chart_order: num.nullish(),
  status: str.nullish(),
  number: num.nullish(),
  search_rank: num.nullish(),
  espn_id: z.union([str, num]).nullish(),
});
export function toPlayer(r: z.infer<typeof RawPlayer>): Player {
  const first = r.first_name ?? "";
  const last = r.last_name ?? "";
  return {
    playerId: r.player_id,
    fullName: r.full_name ?? `${first} ${last}`.trim() ?? r.player_id,
    firstName: first,
    lastName: last,
    team: r.team ?? null,
    position: r.position ?? null,
    fantasyPositions: r.fantasy_positions ?? [],
    age: r.age ?? null,
    yearsExp: r.years_exp ?? null,
    birthDate: r.birth_date ?? null,
    injuryStatus: r.injury_status ?? null,
    depthChartOrder: r.depth_chart_order ?? null,
    status: r.status ?? null,
    number: r.number ?? null,
    searchRank: r.search_rank ?? null,
    espnId: r.espn_id != null ? String(r.espn_id) : null,
  };
}

// ---------- Draft (meta) ----------
/**
 * `slot_to_roster_id` is present on `/draft/{id}` but ABSENT from the
 * `/league/{id}/drafts` list (verified — see API_NOTES), hence `.nullish()`. Keys
 * arrive as strings and are re-keyed to numbers by the mapper.
 */
export const RawDraft = z.object({
  draft_id: str,
  league_id: str.nullish(),
  season: str.nullish(),
  sport: str.nullish(),
  status: str.nullish(),
  type: str.nullish(),
  created: num.nullish(),
  start_time: num.nullish(),
  settings: z.record(str, num).nullish(),
  metadata: z.record(str, z.unknown()).nullish(),
  slot_to_roster_id: z.record(str, num).nullish(),
  draft_order: z.record(str, num).nullish(),
});
export function toDraftMeta(r: z.infer<typeof RawDraft>): DraftMeta {
  const settings = r.settings ?? {};
  const slotToRosterId: Record<number, number> = {};
  for (const [slot, rosterId] of Object.entries(r.slot_to_roster_id ?? {})) {
    const n = Number(slot);
    if (Number.isFinite(n)) slotToRosterId[n] = rosterId;
  }
  return {
    draftId: r.draft_id,
    leagueId: r.league_id ?? "",
    season: r.season ?? "",
    sport: r.sport ?? "nba",
    status: r.status ?? "unknown",
    type: r.type ?? "unknown",
    rounds: settings.rounds ?? 0,
    teams: settings.teams ?? 0,
    startTime: r.start_time ?? null,
    created: r.created ?? null,
    slotToRosterId,
    draftOrder: r.draft_order ?? {},
  };
}

// ---------- Draft pick (actually made) ----------
/**
 * `metadata` numeric-ish fields come back as STRINGS (`number`, `years_exp`), and
 * `team_abbr`/`team_changed_at` only exist in newer seasons — so the whole block is
 * lenient and only the fields we display are read out.
 */
const RawDraftPickMetadata = z
  .object({
    first_name: str.nullish(),
    last_name: str.nullish(),
    position: str.nullish(),
    team: str.nullish(),
  })
  .nullish();

export const RawMadeDraftPick = z.object({
  draft_id: str,
  pick_no: num,
  round: num,
  draft_slot: num,
  roster_id: num.nullish(),
  picked_by: str.nullish(),
  player_id: str.nullish(),
  is_keeper: z.boolean().nullish(),
  metadata: RawDraftPickMetadata,
});
export function toMadeDraftPick(r: z.infer<typeof RawMadeDraftPick>): DraftPick {
  const m = r.metadata ?? {};
  const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
  return {
    draftId: r.draft_id,
    pickNo: r.pick_no,
    round: r.round,
    draftSlot: r.draft_slot,
    rosterId: r.roster_id ?? null,
    pickedBy: r.picked_by ?? null,
    playerId: r.player_id ?? null,
    isKeeper: r.is_keeper ?? false,
    playerName: name || null,
    position: m.position ?? null,
    team: m.team ?? null,
  };
}

// Array helpers
export const RawUserArr = z.array(RawUser);
export const RawDraftArr = z.array(RawDraft);
export const RawMadeDraftPickArr = z.array(RawMadeDraftPick);
export const RawLeagueArr = z.array(RawLeague);
export const RawRosterArr = z.array(RawRoster);
export const RawLeagueUserArr = z.array(RawLeagueUser);
export const RawTransactionArr = z.array(RawTransaction);
export const RawTradedPickArr = z.array(RawTradedPick);
export const RawMatchupArr = z.array(RawMatchup);
export const RawPlayerMap = z.record(str, RawPlayer);
