/**
 * Ingest: assemble the FULL multi-season history by walking previous_league_id
 * backward, then persist idempotently to the DB.
 *
 * Re-runnable safely (upserts by transaction_id). `pnpm ingest` calls ingestAll.
 * The app also calls ensureIngested() lazily so a fresh clone works with no
 * manual ingest step against the default fixture provider.
 */
import { prisma } from "./db";
import { activeLeagueId, getLeagueProvider } from "./providers";
import type {
  LeagueDetail,
  LeagueProvider,
  TradedPick,
  Transaction,
} from "./providers/types";

const MAX_WEEKS = 25; // NBA fantasy weeks run ~1-22; sweep to 25 to be safe.

/** Walk previous_league_id backward. Returns oldest → newest. */
export async function assembleChain(
  provider: LeagueProvider,
  startLeagueId: string,
): Promise<LeagueDetail[]> {
  const chain: LeagueDetail[] = [];
  let id: string | null = startLeagueId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const league: LeagueDetail = await provider.getLeague(id);
    chain.push(league);
    id = league.previousLeagueId ?? null;
  }
  return chain.reverse();
}

async function transactionsForWeek(
  provider: LeagueProvider,
  leagueId: string,
  week: number,
  season: string,
): Promise<Transaction[]> {
  if (provider.getTransactionsForSeason) {
    return provider.getTransactionsForSeason(leagueId, week, season);
  }
  return provider.getTransactions(leagueId, week);
}

/**
 * Traded picks across the WHOLE chain, de-duplicated.
 *
 * Each season's league keeps its own traded_picks snapshot covering roughly that
 * season plus the next few. The current league therefore only knows about future
 * picks (2026+), so historical pick movement — including picks moved in
 * commissioner-executed trades years ago — is only recoverable by reading every
 * league in the chain. Picks matter as much as players in dynasty, so we collect
 * all of them.
 */
export async function collectTradedPicks(
  provider: LeagueProvider,
  chain: LeagueDetail[],
): Promise<TradedPick[]> {
  const seen = new Set<string>();
  const out: TradedPick[] = [];
  for (const league of chain) {
    const picks = await provider.getTradedPicks(league.leagueId);
    for (const p of picks) {
      // Same pick can appear in several snapshots; keep the first (oldest league)
      // occurrence keyed by identity + parties so distinct hops are preserved.
      const key = `${p.season}|${p.round}|${p.rosterId}|${p.previousOwnerId}|${p.ownerId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/**
 * Assemble every transaction across a season chain, chronological. Used both by
 * ingest (to persist) and by the live read path in history.ts (so the app never
 * requires a DB for reads — critical for serverless/Vercel). For Sleeper the
 * per-week fetches are cached by Next's data cache across invocations.
 */
export async function collectTransactions(
  provider: LeagueProvider,
  chain: LeagueDetail[],
): Promise<Transaction[]> {
  const out: Transaction[] = [];
  for (const league of chain) {
    for (let week = 1; week <= MAX_WEEKS; week++) {
      const txs = await transactionsForWeek(
        provider,
        league.leagueId,
        week,
        league.season,
      );
      out.push(...txs);
    }
  }
  return out.sort((a, b) => a.created - b.created);
}

export interface IngestSummary {
  provider: string;
  leagueId: string;
  seasons: string[];
  totalTransactions: number;
  newTransactions: number;
  players: number;
}

export async function ingestAll(
  opts: { leagueId?: string; log?: (m: string) => void } = {},
): Promise<IngestSummary> {
  const log = opts.log ?? (() => {});
  const provider = getLeagueProvider();
  const leagueId = opts.leagueId ?? activeLeagueId();
  log(`Provider: ${provider.name}. Assembling chain from ${leagueId}…`);

  const chain = await assembleChain(provider, leagueId);
  log(`Chain: ${chain.map((l) => l.season).join(" → ")} (${chain.length} seasons)`);

  // Collect all transactions across the chain.
  const all: Array<{ league: LeagueDetail; tx: Transaction }> = [];
  for (const league of chain) {
    let seasonCount = 0;
    for (let week = 1; week <= MAX_WEEKS; week++) {
      const txs = await transactionsForWeek(
        provider,
        league.leagueId,
        week,
        league.season,
      );
      for (const tx of txs) all.push({ league, tx });
      seasonCount += txs.length;
    }
    log(`  ${league.season}: ${seasonCount} transactions`);
  }

  // Idempotent persist: only create rows not already present.
  const existing = new Set(
    (
      await prisma.ingestedTransaction.findMany({ select: { transactionId: true } })
    ).map((r) => r.transactionId),
  );
  const fresh = all.filter(({ tx }) => !existing.has(tx.transactionId));
  if (fresh.length) {
    await prisma.ingestedTransaction.createMany({
      data: fresh.map(({ league, tx }) => ({
        transactionId: tx.transactionId,
        leagueId: league.leagueId,
        season: tx.season,
        week: tx.week,
        type: tx.type,
        createdMs: BigInt(tx.created || 0),
        creator: tx.creator,
        payload: JSON.stringify(tx),
      })),
    });
  }

  // Cache players (only worthwhile for the heavy Sleeper payload).
  let playerCount = 0;
  if (provider.name === "sleeper") {
    const players = await provider.getPlayers();
    playerCount = players.length;
    // Chunk upserts to keep it re-runnable and avoid a giant transaction.
    for (const p of players) {
      await prisma.playerCacheEntry.upsert({
        where: { playerId: p.playerId },
        create: {
          playerId: p.playerId,
          fullName: p.fullName,
          position: p.position,
          team: p.team,
          age: p.age,
          searchRank: p.searchRank,
          payload: JSON.stringify(p),
        },
        update: {
          fullName: p.fullName,
          position: p.position,
          team: p.team,
          age: p.age,
          searchRank: p.searchRank,
          payload: JSON.stringify(p),
        },
      });
    }
  } else {
    playerCount = (await provider.getPlayers()).length;
  }

  await setMeta("provider", provider.name);
  await setMeta("activeLeagueId", leagueId);
  await setMeta("lastIngestAt", new Date().toISOString());

  return {
    provider: provider.name,
    leagueId,
    seasons: chain.map((l) => l.season),
    totalTransactions: all.length,
    newTransactions: fresh.length,
    players: playerCount,
  };
}

async function setMeta(key: string, value: string) {
  await prisma.meta.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/**
 * Lazily ingest on first read so the app works with zero manual steps against
 * the default fixture provider. Idempotent and cheap once populated.
 */
let ensuring: Promise<void> | null = null;
export async function ensureIngested(): Promise<void> {
  if (ensuring) return ensuring;
  ensuring = (async () => {
    const count = await prisma.ingestedTransaction.count();
    if (count === 0) {
      await ingestAll();
    }
  })().catch((e) => {
    // Reset so a transient failure can be retried on the next request.
    ensuring = null;
    throw e;
  });
  return ensuring;
}
