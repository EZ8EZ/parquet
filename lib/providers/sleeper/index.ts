/**
 * SleeperProvider — the real read-only provider.
 * Base: https://api.sleeper.app/v1  (no auth, ~1000 req/min).
 * Every response is Zod-validated in ./schemas before it reaches the app.
 */
import { z } from "zod";
import type {
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
  RawLeague,
  RawLeagueArr,
  RawLeagueUserArr,
  RawMatchupArr,
  RawPlayerMap,
  RawRosterArr,
  RawTradedPickArr,
  RawTransactionArr,
  RawUser,
  toLeague,
  toLeagueDetail,
  toLeagueUser,
  toMatchup,
  toPlayer,
  toRoster,
  toTradedPick,
  toTransaction,
  toUser,
} from "./schemas";

const BASE = "https://api.sleeper.app/v1";

async function getJson<T>(
  path: string,
  schema: z.ZodType<T>,
  { retries = 3 }: { retries?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { accept: "application/json" },
        // Sleeper data is highly cacheable; the app also persists to the DB.
        next: { revalidate: 3600 },
      });
      if (res.status === 429) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`Sleeper ${path} -> HTTP ${res.status}`);
      const json = await res.json();
      return schema.parse(json);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(300 * (attempt + 1));
    }
  }
  throw new Error(
    `Sleeper request failed after ${retries + 1} attempts: ${path}: ${String(
      lastErr,
    )}`,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SleeperProvider implements LeagueProvider {
  readonly name = "sleeper";

  async getUser(username: string): Promise<User> {
    return toUser(await getJson(`/user/${encodeURIComponent(username)}`, RawUser));
  }

  async getLeagues(
    userId: string,
    sport: string,
    season: string,
  ): Promise<League[]> {
    const raw = await getJson(
      `/user/${userId}/leagues/${sport}/${season}`,
      RawLeagueArr,
    );
    return raw.map(toLeague);
  }

  async getLeague(leagueId: string): Promise<LeagueDetail> {
    return toLeagueDetail(await getJson(`/league/${leagueId}`, RawLeague));
  }

  async getRosters(leagueId: string): Promise<Roster[]> {
    const raw = await getJson(`/league/${leagueId}/rosters`, RawRosterArr);
    return raw.map(toRoster);
  }

  async getUsers(leagueId: string): Promise<LeagueUser[]> {
    const raw = await getJson(`/league/${leagueId}/users`, RawLeagueUserArr);
    return raw.map(toLeagueUser);
  }

  async getTransactions(leagueId: string, week: number): Promise<Transaction[]> {
    // Season is stamped by the caller/ingest; getLeague resolves it here so the
    // Transaction.season field is always populated even for a bare call.
    const detail = await this.getLeague(leagueId);
    const raw = await getJson(
      `/league/${leagueId}/transactions/${week}`,
      RawTransactionArr,
    );
    return raw.map((t) => toTransaction(t, detail.season));
  }

  /** Same as getTransactions but avoids re-fetching the league for its season. */
  async getTransactionsForSeason(
    leagueId: string,
    week: number,
    season: string,
  ): Promise<Transaction[]> {
    const raw = await getJson(
      `/league/${leagueId}/transactions/${week}`,
      RawTransactionArr,
    );
    return raw.map((t) => toTransaction(t, season));
  }

  async getMatchups(leagueId: string, week: number): Promise<Matchup[]> {
    const raw = await getJson(
      `/league/${leagueId}/matchups/${week}`,
      RawMatchupArr,
    );
    return raw.map((m) => toMatchup(m, week));
  }

  async getTradedPicks(leagueId: string): Promise<TradedPick[]> {
    const raw = await getJson(
      `/league/${leagueId}/traded_picks`,
      RawTradedPickArr,
    );
    return raw.map(toTradedPick);
  }

  async getPlayers(): Promise<Player[]> {
    const raw = await getJson(`/players/nba`, RawPlayerMap);
    return Object.values(raw).map(toPlayer);
  }
}
