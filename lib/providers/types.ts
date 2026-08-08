/**
 * Platform-agnostic domain model.
 *
 * The entire app depends ONLY on these types and the `LeagueProvider` /
 * `StatsProvider` interfaces — never on a concrete provider. Sleeper, CSV, and
 * fixture implementations all normalize into these shapes. Swapping providers is
 * a one-line change in `lib/providers/index.ts`.
 */

export type Sport = "nba";

/**
 * Sleeper transaction types. The common ones are trade / waiver / free_agent, but
 * the live API also emits others (e.g. "commissioner"). Kept as a widened string so
 * unknown types never break ingestion; consumers filter on the literals they care
 * about.
 */
export type TransactionType = "trade" | "waiver" | "free_agent" | (string & {});

export interface User {
  userId: string;
  username: string;
  displayName: string;
  avatar?: string | null;
}

export interface League {
  leagueId: string;
  name: string;
  season: string;
  sport: string;
  status: string;
  previousLeagueId?: string | null;
  totalRosters: number;
}

export interface LeagueDetail extends League {
  /** e.g. ["PG","SG","SF","PF","C","UTIL","UTIL","BN",...] */
  rosterPositions: string[];
  /** Read live from the league; NEVER hardcoded. Drives positional scarcity. */
  scoringSettings: Record<string, number>;
  settings: Record<string, number>;
}

export interface RosterSettings {
  wins: number;
  losses: number;
  ties: number;
  /** Fantasy points scored (already includes the .decimal component). */
  fpts: number;
  fptsAgainst: number;
  /** Potential points (max if optimal lineup) — a "manager efficiency" signal. */
  ppts: number;
  waiverBudgetUsed: number;
  waiverPosition: number;
  totalMoves: number;
}

export interface Roster {
  rosterId: number;
  ownerId: string | null;
  coOwners: string[];
  /** Sleeper player_id strings. */
  players: string[];
  starters: string[];
  reserve: string[];
  taxi: string[];
  settings: RosterSettings;
}

export interface LeagueUser {
  userId: string;
  displayName: string;
  /** Sleeper user-avatar id. Render via sleepercdn.com/avatars/thumbs/{id}. */
  avatar?: string | null;
  teamName?: string | null;
  /**
   * Custom team logo. Sleeper puts this in `metadata.avatar` as a FULL URL
   * (sleepercdn.com/uploads/...), distinct from the user-avatar id above. Only some
   * managers upload one, so consumers must fall back.
   */
  teamLogoUrl?: string | null;
  isOwner: boolean;
  isBot: boolean;
}

/** A draft pick as referenced inside a transaction or the traded-picks snapshot. */
export interface DraftPickRef {
  round: number;
  season: string;
  /** The roster the pick originally belongs to. */
  rosterId: number;
  /** Who owns the pick after the referencing event. */
  ownerId: number;
  /** Who owned it before. */
  previousOwnerId: number;
}

export interface Transaction {
  transactionId: string;
  type: TransactionType;
  status: string;
  /** The league season this transaction belongs to (added during ingest). */
  season: string;
  /** Sleeper "leg" — the week within the season. */
  week: number;
  created: number; // ms epoch
  statusUpdated: number; // ms epoch
  /** user_id that initiated the transaction. Key for dossiers (initiator). */
  creator: string | null;
  /** roster_ids involved. */
  rosterIds: number[];
  /** roster_ids that consented (both sides of a trade). */
  consenterIds: number[];
  /** player_id -> roster_id receiving. */
  adds: Record<string, number>;
  /** player_id -> roster_id dropping. */
  drops: Record<string, number>;
  draftPicks: DraftPickRef[];
  /** FAAB bid for waiver claims, if any. */
  waiverBid?: number | null;
}

export interface TradedPick {
  round: number;
  season: string;
  rosterId: number;
  ownerId: number;
  previousOwnerId: number;
}

export interface Matchup {
  rosterId: number;
  matchupId: number | null;
  points: number;
  week: number;
}

export interface Player {
  playerId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  team: string | null;
  position: string | null;
  fantasyPositions: string[];
  age: number | null;
  yearsExp: number | null;
  birthDate: string | null;
  /**
   * Sleeper `injury_status`. In live NBA data this is only ever DTD / Out / IR, and it
   * is a far weaker severity signal than its vocabulary implies (a ruptured Achilles
   * and a bruised quad are both "DTD"). The two fields below carry the real signal.
   */
  injuryStatus: string | null;
  /** Sleeper `injury_body_part`, e.g. "Knee". Present on every live flag. */
  injuryBodyPart: string | null;
  /** Sleeper `injury_notes`, e.g. "Surgery". Present on about two thirds of flags. */
  injuryNotes: string | null;
  depthChartOrder: number | null;
  status: string | null;
  number: number | null;
  /** Sleeper's consensus-ish rank; lower = better. Free proxy for value. */
  searchRank: number | null;
  espnId: string | null;
}

/**
 * The provider contract. Every method returns normalized domain types.
 * Implementations: SleeperProvider (real), CsvProvider (import), FixtureProvider
 * (synthetic, built first, the default).
 */
export interface LeagueProvider {
  readonly name: string;
  getUser(username: string): Promise<User>;
  getLeagues(userId: string, sport: string, season: string): Promise<League[]>;
  getLeague(leagueId: string): Promise<LeagueDetail>;
  getRosters(leagueId: string): Promise<Roster[]>;
  getUsers(leagueId: string): Promise<LeagueUser[]>;
  getTransactions(leagueId: string, week: number): Promise<Transaction[]>;
  /** Optional efficient variant: stamps season without re-fetching the league. */
  getTransactionsForSeason?(
    leagueId: string,
    week: number,
    season: string,
  ): Promise<Transaction[]>;
  getMatchups(leagueId: string, week: number): Promise<Matchup[]>;
  getTradedPicks(leagueId: string): Promise<TradedPick[]>;
  getPlayers(): Promise<Player[]>;
  /**
   * Drafts for a league season. OPTIONAL so providers without draft data (CSV)
   * keep compiling; callers must treat `undefined` as "no draft data".
   */
  getDrafts?(leagueId: string): Promise<DraftMeta[]>;
  /** Picks actually made in a draft. Optional for the same reason. */
  getDraftPicks?(draftId: string): Promise<DraftPick[]>;
  /**
   * A season's playoff bracket. OPTIONAL for the same reason as drafts: a provider
   * with no bracket data (CSV) must keep compiling, and callers treat `undefined` as
   * "this league has no decided champion on record" rather than inventing one.
   */
  getBracket?(leagueId: string, kind: BracketKind): Promise<BracketGame[]>;
}

export type BracketKind = "winners" | "losers";

/**
 * One game in a playoff bracket.
 *
 * Sleeper's shape, normalised: `m`/`r`/`p`/`t1`/`t2`/`w`/`l`. Verified live across all
 * four complete seasons of the real league.
 *
 * `t1_from`/`t2_from` are deliberately NOT mapped. They exist to draw a bracket tree,
 * and nothing in this app draws one (a 14-team tree does not fit 390px). This round's
 * whole premise is that fields parsed and read by nobody are a liability, so they stay
 * unmapped until something actually renders them.
 */
export interface BracketGame {
  /** Match id within the bracket. */
  matchId: number;
  /** Round number, 1-based. */
  round: number;
  /**
   * The place this game decides, when it decides one: 1 is the championship, 3 the
   * third-place game, and so on. The winner takes `placement`, the loser
   * `placement + 1`. Null for a game that only advances teams.
   */
  placement: number | null;
  /** Roster ids. Null while a bracket is still being filled in. */
  team1: number | null;
  team2: number | null;
  winner: number | null;
  loser: number | null;
}

/**
 * A draft (one per league season). The `slotToRosterId` map is the load-bearing
 * field for pick lineage — see API_NOTES "Drafts".
 */
export interface DraftMeta {
  draftId: string;
  leagueId: string;
  season: string;
  sport: string;
  /** "pre_draft" | "drafting" | "complete" — widened, Sleeper may add more. */
  status: string;
  /** "linear" | "snake" | "auction" — widened. */
  type: string;
  rounds: number;
  teams: number;
  /** ms epoch, or null when unscheduled. */
  startTime: number | null;
  created: number | null;
  /**
   * Draft slot -> the roster that ORIGINALLY owns that slot. NOT who made the
   * pick (trades move that). Only present on the single-draft endpoint.
   */
  slotToRosterId: Record<number, number>;
  /** user_id -> draft slot. */
  draftOrder: Record<string, number>;
}

/**
 * A pick that was ACTUALLY MADE in a draft — distinct from `DraftPickRef`, which is
 * a *tradeable* future pick. Closing the loop between the two is pick lineage.
 */
export interface DraftPick {
  draftId: string;
  /**
   * Overall pick number, 1-based. AUTHORITATIVE for ordering — never recompute it
   * from round/slot, which breaks on snake drafts (verified, see API_NOTES).
   */
  pickNo: number;
  round: number;
  draftSlot: number;
  /** The roster that actually made the pick, i.e. who owned it at draft time. */
  rosterId: number | null;
  /** user_id of whoever made the pick. */
  pickedBy: string | null;
  playerId: string | null;
  isKeeper: boolean;
  /** Denormalized on the pick itself; a fallback when the player universe churns. */
  playerName: string | null;
  position: string | null;
  team: string | null;
}

/** Per-season production line for a player. Provider-agnostic. */
export interface PlayerSeasonStats {
  playerId: string;
  season: string;
  gamesPlayed: number;
  minutesPerGame: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  tpm: number;
}

/**
 * Stats are abstracted so a real external source can replace the fixture
 * without touching the valuation model. Never called from a render path — always
 * cached to the DB first.
 */
export interface StatsProvider {
  readonly name: string;
  getSeasonStats(season: string): Promise<PlayerSeasonStats[]>;
}
