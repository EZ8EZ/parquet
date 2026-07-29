/**
 * Platform-agnostic domain model.
 *
 * The entire app depends ONLY on these types and the `LeagueProvider` /
 * `StatsProvider` interfaces — never on a concrete provider. Sleeper, CSV, and
 * fixture implementations all normalize into these shapes. Swapping providers is
 * a one-line change in `lib/providers/index.ts`.
 */

export type Sport = "nba";

export type TransactionType = "trade" | "waiver" | "free_agent";

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
  avatar?: string | null;
  teamName?: string | null;
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
  injuryStatus: string | null;
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
 * Stats are abstracted so a real source (balldontlie.io) can replace the fixture
 * without touching the valuation model. Never called from a render path — always
 * cached to the DB first.
 */
export interface StatsProvider {
  readonly name: string;
  getSeasonStats(season: string): Promise<PlayerSeasonStats[]>;
}
