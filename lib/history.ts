/**
 * LeagueHistory — the single corpus object every derivation engine consumes.
 *
 * READS ARE DB-FREE. The corpus (chain, rosters, players, transactions) is read
 * live from the provider so the app runs on serverless/Vercel with no database
 * (Sleeper fetches are cached by Next's data cache). The DB is used ONLY to persist
 * user annotations, and even that is best-effort: if it's unavailable, reads still
 * work and the fixture demo seeds its own annotation in code.
 * The engines (strategy, dossier, analyst) are pure functions over this object.
 */
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
import { assembleChain, collectTransactions } from "./ingest";

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

/**
 * Fixture-only seed annotation so the revealed-vs-stated demo works with no DB and
 * no seed script (the 2022 rebuild statement that the 2025 pivot contradicts).
 */
const FIXTURE_SEED_ANNOTATIONS: Annotation[] = [
  {
    transactionId: "fx-2022-rebuildA",
    reasoning:
      "Full rebuild. I'm getting younger and stockpiling first-round picks. " +
      "Not chasing wins for the next 2-3 years — the goal is a young core that " +
      "peaks together. Moving every veteran who isn't part of the future.",
    posture: "rebuild",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
];

/** Best-effort annotation load: DB if reachable, else empty; + fixture seed. */
async function loadAnnotations(providerNm: string): Promise<Map<string, Annotation>> {
  const map = new Map<string, Annotation>();
  if (providerNm === "fixture") {
    for (const a of FIXTURE_SEED_ANNOTATIONS) map.set(a.transactionId, a);
  }
  try {
    const { prisma } = await import("./db");
    const rows = await prisma.annotation.findMany();
    for (const a of rows) {
      map.set(a.transactionId, {
        transactionId: a.transactionId,
        reasoning: a.reasoning,
        posture: a.posture,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      });
    }
  } catch {
    // DB not configured/reachable (e.g. Vercel without Postgres) — reads still work.
  }
  return map;
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
// Longer TTL because the Sleeper corpus assembly is many (cached) fetches.
const HISTORY_TTL_MS = 5 * 60_000;

export async function getLeagueHistory(
  opts: { fresh?: boolean } = {},
): Promise<LeagueHistory> {
  if (!opts.fresh && cachedHistory && Date.now() - cachedHistory.at < HISTORY_TTL_MS) {
    return cachedHistory.value;
  }
  const provider = getLeagueProvider();
  const leagueId = activeLeagueId();

  const [currentLeague, users, rosters, tradedPicks, playerList] = await Promise.all([
    provider.getLeague(leagueId),
    provider.getUsers(leagueId),
    provider.getRosters(leagueId),
    provider.getTradedPicks(leagueId),
    provider.getPlayers(),
  ]);
  const players = new Map<string, Player>(playerList.map((p) => [p.playerId, p]));
  const chain = await assembleChain(provider, leagueId);

  // Corpus read live from the provider — no DB required (Sleeper fetches cached).
  const transactions = await collectTransactions(provider, chain);
  const annotations = await loadAnnotations(provider.name);
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
