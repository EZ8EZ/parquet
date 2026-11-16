/**
 * Ingest: assemble the FULL multi-season history by walking previous_league_id
 * backward, then persist idempotently to the DB.
 *
 * Re-runnable safely (upserts by transaction_id). `pnpm ingest` (scripts/ingest.ts)
 * and `pnpm seed` (scripts/seed.ts) are the only callers of `ingestAll` — reads never
 * touch the DB (D18: the corpus is read live from the provider on every request, with
 * the provider doing its own in-process caching), so there is no lazy on-first-read
 * ingest path here anymore.
 */
import { activeLeagueId, getLeagueProvider } from "./providers/index.js";
import { gapFrom } from "./util/gaps.js";
const MAX_WEEKS = 25; // NBA fantasy weeks run ~1-22; sweep to 25 to be safe.
/**
 * Walk previous_league_id backward. Returns oldest → newest.
 *
 * The starting league must load (there is no app without it). An OLDER league that
 * fails ends the walk there and, when a `gaps` array is passed, is recorded in it - the
 * chain is then visibly short rather than silently so. Without `gaps` (ingest) it
 * throws, as before.
 * @param {*} provider
 * @param {string} startLeagueId
 * @param {import('./util/gaps.js').Gap[]} [gaps]
 */
export async function assembleChain(provider, startLeagueId, gaps) {
  const chain = [];
  let id = startLeagueId;
  const seen = new Set();
  while (id && !seen.has(id)) {
    seen.add(id);
    let league;
    try {
      league = await provider.getLeague(id);
    } catch (err) {
      if (!gaps || chain.length === 0) throw err;
      gaps.push(gapFrom(err, { endpoint: "league", id }));
      break;
    }
    chain.push(league);
    id = league.previousLeagueId ?? null;
  }
  return chain.reverse();
}
/** `complete` is the cache hint (see lib/providers/sleeper/client.js). */
const hintOf = (league) => ({ complete: league?.status === "complete" });
async function transactionsForWeek(provider, leagueId, week, season, hint) {
  if (provider.getTransactionsForSeason) {
    return provider.getTransactionsForSeason(leagueId, week, season, hint);
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
export async function collectTradedPicks(provider, chain, gaps = []) {
  // Fan out across the chain rather than one season at a time in series - same
  // reasoning `collectTransactions` below already applies (Sleeper's rate limit is
  // nowhere near the bottleneck; round-trip latency times chain length was), just a
  // smaller win here since the chain is 5 requests rather than 125.
  const perLeague = await Promise.all(
    chain.map(async (league) => {
      try {
        return await provider.getTradedPicks(league.leagueId, hintOf(league));
      } catch (err) {
        // Recorded, not swallowed: a missing snapshot drops that season's pick hops.
        gaps.push(
          gapFrom(err, {
            endpoint: "traded_picks",
            season: league.season,
            id: league.leagueId,
          }),
        );
        return [];
      }
    }),
  );
  const seen = new Set();
  const out = [];
  // De-dup order must stay chain order (oldest league wins a shared key), so the
  // requests fan out but the merge still walks the results in `chain`'s sequence.
  for (const picks of perLeague) {
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
/**
 * @param {*} provider
 * @param {import('./providers/types.js').LeagueDetail[]} chain
 * @param {import('./util/gaps.js').Gap[]} [gaps] failed weeks are pushed here. A
 *   failed week contributes no rows, but it is NOT an empty week: the gap is the record
 *   that its trades are unknown, and the corpus carries it to the page.
 */
export async function collectTransactions(provider, chain, gaps = []) {
  // Fan out per league: 5 seasons x 25 weeks sequentially was ~125 round trips in
  // series, which dominated cold-start latency. Sleeper allows ~1000 req/min, so
  // issuing a season's weeks concurrently is well within budget.
  const perLeague = await Promise.all(
    chain.map(async (league) => {
      const weeks = await Promise.all(
        Array.from({ length: MAX_WEEKS }, (_, i) => i + 1).map(async (week) => {
          try {
            return await transactionsForWeek(
              provider,
              league.leagueId,
              week,
              league.season,
              hintOf(league),
            );
          } catch (err) {
            // One bad week must not lose the whole season - but it must not pass for
            // a quiet week either.
            gaps.push(
              gapFrom(err, {
                endpoint: "transactions",
                season: league.season,
                week,
                id: league.leagueId,
              }),
            );
            return [];
          }
        }),
      );
      return weeks.flat();
    }),
  );
  return perLeague.flat().sort((a, b) => a.created - b.created);
}
export async function ingestAll(opts = {}) {
  // Imported here, not at module top: the live read path (lib/history.js) imports
  // this module for assembleChain/collect*, and must not load Prisma to do so.
  const { prisma } = await import("./db.js");
  const log = opts.log ?? (() => {});
  const provider = getLeagueProvider();
  const leagueId = opts.leagueId ?? activeLeagueId();
  log(`Provider: ${provider.name}. Assembling chain from ${leagueId}…`);
  const chain = await assembleChain(provider, leagueId);
  log(
    `Chain: ${chain.map((l) => l.season).join(" → ")} (${chain.length} seasons)`,
  );
  // Collect all transactions across the chain.
  const all = [];
  for (const league of chain) {
    let seasonCount = 0;
    for (let week = 1; week <= MAX_WEEKS; week++) {
      const txs = await transactionsForWeek(
        provider,
        league.leagueId,
        week,
        league.season,
        hintOf(league),
      );
      for (const tx of txs) all.push({ league, tx });
      seasonCount += txs.length;
    }
    log(`  ${league.season}: ${seasonCount} transactions`);
  }
  // Idempotent persist: only create rows not already present.
  const existing = new Set(
    (
      await prisma.ingestedTransaction.findMany({
        select: { transactionId: true },
      })
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
  await setMeta(prisma, "provider", provider.name);
  await setMeta(prisma, "activeLeagueId", leagueId);
  await setMeta(prisma, "lastIngestAt", new Date().toISOString());
  return {
    provider: provider.name,
    leagueId,
    seasons: chain.map((l) => l.season),
    totalTransactions: all.length,
    newTransactions: fresh.length,
    players: playerCount,
  };
}
async function setMeta(prisma, key, value) {
  await prisma.meta.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
