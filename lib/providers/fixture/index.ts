/**
 * FixtureProvider — synthetic, realistic, deterministic. Built FIRST so no UI or
 * test is ever blocked on network/API access. It is the DEFAULT provider.
 */
import type {
  BracketGame,
  BracketKind,
  DraftMeta,
  DraftPick,
  League,
  LeagueDetail,
  LeagueProvider,
  LeagueUser,
  Matchup,
  Player,
  Roster,
  TradedPick,
  Transaction,
  User,
} from "../types";
import {
  CURRENT_SEASON,
  generateCorpus,
  leagueIdFor,
  SEASONS,
  SUCCESSION,
  type FixtureCorpus,
} from "./generate";

let cached: FixtureCorpus | null = null;
export function corpus(): FixtureCorpus {
  if (!cached) cached = generateCorpus();
  return cached;
}

export const FIXTURE_LEAGUE_ID = leagueIdFor(CURRENT_SEASON);
export const FIXTURE_USERNAME = "EZ8";

export class FixtureProvider implements LeagueProvider {
  readonly name = "fixture";

  async getUser(username: string): Promise<User> {
    const u = corpus().user;
    if (username.toLowerCase() !== u.username.toLowerCase()) {
      // Fixtures only know EZ8; return the same user so the app never blocks.
      return { ...u, username: username.toLowerCase(), displayName: username };
    }
    return u;
  }

  async getLeagues(
    _userId: string,
    _sport: string,
    season: string,
  ): Promise<League[]> {
    const c = corpus();
    const id = leagueIdFor(season);
    const l = c.leagues[id];
    return l ? [l] : [];
  }

  async getLeague(leagueId: string): Promise<LeagueDetail> {
    const l = corpus().leagues[leagueId];
    if (!l) throw new Error(`fixture: unknown league ${leagueId}`);
    return l;
  }

  async getRosters(leagueId: string): Promise<Roster[]> {
    return corpus().rosters[leagueId] ?? [];
  }

  /**
   * A season's users endpoint knows only who was in the league THAT season - see
   * lib/principals.ts's header on why that matters: the departed manager on the
   * fixture's one succeeded roster must be readable from the older seasons' users
   * list and absent from the current one, exactly like the real API, or a principals
   * lookup that relies on that asymmetry would pass here and fail live.
   */
  async getUsers(leagueId: string): Promise<LeagueUser[]> {
    const season = SEASONS.find((s) => leagueIdFor(s) === leagueId);
    const all = corpus().users;
    if (!season) return all;
    return all.filter((u) => {
      if (u.userId === SUCCESSION.successorUserId) {
        return season >= SUCCESSION.cutoverSeason;
      }
      if (u.userId === SUCCESSION.predecessorUserId) {
        return season < SUCCESSION.cutoverSeason;
      }
      return true;
    });
  }

  async getTransactions(leagueId: string, week: number): Promise<Transaction[]> {
    return (corpus().transactions[leagueId] ?? []).filter((t) => t.week === week);
  }

  async getMatchups(leagueId: string, week: number): Promise<Matchup[]> {
    return (corpus().matchups[leagueId] ?? []).filter((m) => m.week === week);
  }

  async getTradedPicks(leagueId: string): Promise<TradedPick[]> {
    return corpus().tradedPicks[leagueId] ?? [];
  }

  async getPlayers(): Promise<Player[]> {
    return corpus().players;
  }

  /** One synthetic rookie draft per season 2023–2026. 2026 is `pre_draft`/empty. */
  async getDrafts(leagueId: string): Promise<DraftMeta[]> {
    return corpus().drafts[leagueId] ?? [];
  }

  async getDraftPicks(draftId: string): Promise<DraftPick[]> {
    return corpus().draftPicks[draftId] ?? [];
  }

  /**
   * Winners bracket only. The fixture has no consolation bracket: nothing in the app
   * reads one, and a synthetic loser's bracket would be invented data serving no
   * feature.
   */
  async getBracket(leagueId: string, kind: BracketKind): Promise<BracketGame[]> {
    if (kind !== "winners") return [];
    return corpus().brackets[leagueId] ?? [];
  }
}

/** All seasons the fixture knows, newest first — handy for ingest tests. */
export const FIXTURE_SEASONS = [...SEASONS].reverse();
