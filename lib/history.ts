/**
 * LeagueHistory — the single corpus object every derivation engine consumes.
 *
 * Transactions + annotations come from the DB (populated by ingest / lazily by
 * ensureIngested). Current league state (rosters, users, players) comes live from
 * the provider. The engines (strategy, dossier, analyst) are pure functions over
 * this object.
 */
import { prisma } from "./db";
import { ensureIngested } from "./ingest";
import {
  activeLeagueId,
  getLeagueProvider,
  providerName,
} from "./providers";
import type {
  LeagueDetail,
  LeagueUser,
  Matchup,
  Player,
  Roster,
  TradedPick,
  Transaction,
} from "./providers/types";
import { assembleChain } from "./ingest";

export interface Annotation {
  transactionId: string;
  reasoning: string;
  posture: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Matchup tagged with its season (the domain Matchup carries only week). */
export type HistoryMatchup = Matchup & { season: string };

export interface Me {
  userId: string;
  rosterId: number | null;
  displayName: string;
  teamName: string | null;
}

export interface LeagueHistory {
  provider: string;
  currentLeague: LeagueDetail;
  chain: LeagueDetail[]; // oldest -> newest
  users: LeagueUser[];
  usersById: Map<string, LeagueUser>;
  rostersById: Map<number, Roster>;
  rosters: Roster[];
  players: Map<string, Player>;
  transactions: Transaction[]; // chronological asc
  tradedPicks: TradedPick[];
  matchups: HistoryMatchup[];
  annotations: Map<string, Annotation>;
  me: Me;
  currentSeasonYear: number;
}

async function loadPlayers(): Promise<Map<string, Player>> {
  const provider = getLeagueProvider();
  // For Sleeper, prefer the DB cache (payload is 2.3MB) if present.
  if (provider.name === "sleeper") {
    const cached = await prisma.playerCacheEntry.findMany({
      select: { payload: true },
    });
    if (cached.length) {
      const m = new Map<string, Player>();
      for (const row of cached) {
        const p = JSON.parse(row.payload) as Player;
        m.set(p.playerId, p);
      }
      return m;
    }
  }
  const players = await provider.getPlayers();
  return new Map(players.map((p) => [p.playerId, p]));
}

async function loadMatchups(chain: LeagueDetail[]): Promise<HistoryMatchup[]> {
  // Only cheap for the in-memory fixture; skip live Sleeper (avoids a call storm).
  if (providerName() !== "fixture") return [];
  const provider = getLeagueProvider();
  const out: HistoryMatchup[] = [];
  for (const league of chain) {
    for (let w = 1; w <= 22; w++) {
      const ms = await provider.getMatchups(league.leagueId, w);
      for (const m of ms) out.push({ ...m, week: w, season: league.season });
    }
  }
  return out;
}

function resolveMe(
  meUserId: string,
  users: LeagueUser[],
  rosters: Roster[],
): Me {
  const user = users.find((u) => u.userId === meUserId) ?? users[0];
  const roster = rosters.find((r) => r.ownerId === user?.userId);
  return {
    userId: user?.userId ?? meUserId,
    rosterId: roster?.rosterId ?? null,
    displayName: user?.displayName ?? "You",
    teamName: user?.teamName ?? null,
  };
}

let cachedHistory: { at: number; value: LeagueHistory } | null = null;
const HISTORY_TTL_MS = 30_000;

export async function getLeagueHistory(
  opts: { fresh?: boolean } = {},
): Promise<LeagueHistory> {
  if (!opts.fresh && cachedHistory && Date.now() - cachedHistory.at < HISTORY_TTL_MS) {
    return cachedHistory.value;
  }
  await ensureIngested();
  const provider = getLeagueProvider();
  const leagueId = activeLeagueId();

  const [currentLeague, users, rosters, tradedPicks, players] = await Promise.all([
    provider.getLeague(leagueId),
    provider.getUsers(leagueId),
    provider.getRosters(leagueId),
    provider.getTradedPicks(leagueId),
    loadPlayers(),
  ]);
  const chain = await assembleChain(provider, leagueId);

  const txRows = await prisma.ingestedTransaction.findMany({
    orderBy: { createdMs: "asc" },
  });
  const transactions = txRows.map(
    (r) => JSON.parse(r.payload) as Transaction,
  );

  const annRows = await prisma.annotation.findMany();
  const annotations = new Map<string, Annotation>(
    annRows.map((a) => [
      a.transactionId,
      {
        transactionId: a.transactionId,
        reasoning: a.reasoning,
        posture: a.posture,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      },
    ]),
  );

  const matchups = await loadMatchups(chain);

  // Resolve "me": the provider's user (fixture=EZ8; sleeper via SLEEPER_USERNAME).
  const username = process.env.SLEEPER_USERNAME ?? "EZ8";
  let meUserId = users[0]?.userId ?? "";
  try {
    const u = await provider.getUser(username);
    meUserId = u.userId;
  } catch {
    // fall back to first user
  }

  const value: LeagueHistory = {
    provider: provider.name,
    currentLeague,
    chain,
    users,
    usersById: new Map(users.map((u) => [u.userId, u])),
    rosters,
    rostersById: new Map(rosters.map((r) => [r.rosterId, r])),
    players,
    transactions,
    tradedPicks,
    matchups,
    annotations,
    me: resolveMe(meUserId, users, rosters),
    currentSeasonYear: parseInt(currentLeague.season, 10),
  };
  cachedHistory = { at: Date.now(), value };
  return value;
}

/** Invalidate the in-process history cache (call after writing an annotation). */
export function invalidateHistory(): void {
  cachedHistory = null;
}
