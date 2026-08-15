import { getLeagueProvider } from "./providers";
/**
 * Build the index from per-season ownership. Pure, so succession logic is testable
 * without a provider.
 *
 * `seasonsAsc` must be ascending, and the last entry is treated as "now".
 */
export function buildPrincipals(seasonsAsc, currentRosters, currentUsers) {
  const currentSeason = seasonsAsc[seasonsAsc.length - 1]?.season ?? null;
  // rosterId -> ordered list of (season, ownerId)
  const timeline = new Map();
  for (const s of seasonsAsc) {
    for (const [rosterId, ownerId] of s.owners) {
      if (!ownerId) continue;
      const list = timeline.get(rosterId) ?? [];
      list.push({ season: s.season, ownerId });
      timeline.set(rosterId, list);
    }
  }
  // Best-known user record for an id: prefer the current league, else the most recent
  // season that knew them. A departed manager only exists in the older seasons.
  const userOf = (ownerId) => {
    const cur = currentUsers.get(ownerId);
    if (cur) return cur;
    for (let i = seasonsAsc.length - 1; i >= 0; i--) {
      const u = seasonsAsc[i].users.get(ownerId);
      if (u) return u;
    }
    return undefined;
  };
  const nameOf = (ownerId) => userOf(ownerId)?.displayName ?? ownerId;
  // Split each roster's timeline into contiguous tenures, and record handovers.
  const tenuresByOwner = new Map();
  const successions = [];
  for (const [rosterId, rows] of timeline) {
    let run = null;
    const runs = [];
    for (const row of rows) {
      if (run && run.ownerId === row.ownerId) {
        run.seasons.push(row.season);
      } else {
        if (run) {
          runs.push(run);
          successions.push({
            rosterId,
            season: row.season,
            fromOwnerId: run.ownerId,
            fromName: nameOf(run.ownerId),
            toOwnerId: row.ownerId,
            toName: nameOf(row.ownerId),
          });
        }
        run = { ownerId: row.ownerId, seasons: [row.season] };
      }
    }
    if (run) runs.push(run);
    for (const r of runs) {
      const list = tenuresByOwner.get(r.ownerId) ?? [];
      list.push({
        rosterId,
        ownerId: r.ownerId,
        seasons: r.seasons,
        firstSeason: r.seasons[0],
        lastSeason: r.seasons[r.seasons.length - 1],
        isCurrent: currentSeason != null && r.seasons.includes(currentSeason),
      });
      tenuresByOwner.set(r.ownerId, list);
    }
  }
  // A manager present in the current rosters but absent from the season data still
  // deserves a principal (e.g. a provider with no per-season rosters at all).
  for (const r of currentRosters) {
    if (!r.ownerId || tenuresByOwner.has(r.ownerId)) continue;
    tenuresByOwner.set(r.ownerId, [
      {
        rosterId: r.rosterId,
        ownerId: r.ownerId,
        seasons: currentSeason ? [currentSeason] : [],
        firstSeason: currentSeason ?? "",
        lastSeason: currentSeason ?? "",
        isCurrent: true,
      },
    ]);
  }
  const currentOwnerIds = new Set(
    currentRosters.map((r) => r.ownerId).filter((x) => !!x),
  );
  const principals = [];
  for (const [ownerId, tenures] of tenuresByOwner) {
    tenures.sort((a, b) => a.firstSeason.localeCompare(b.firstSeason));
    const seasons = [...new Set(tenures.flatMap((t) => t.seasons))].sort();
    const current = tenures.find((t) => t.isCurrent) ?? null;
    const last = tenures[tenures.length - 1];
    const u = userOf(ownerId);
    const isFormer = !currentOwnerIds.has(ownerId);
    const handedOff = successions.find((s) => s.fromOwnerId === ownerId);
    const inherited = successions.find((s) => s.toOwnerId === ownerId);
    principals.push({
      ownerId,
      displayName: u?.displayName ?? ownerId,
      teamName: u?.teamName ?? null,
      avatar: u?.avatar ?? null,
      teamLogoUrl: u?.teamLogoUrl ?? null,
      tenures,
      seasons,
      currentRosterId: current?.rosterId ?? null,
      lastRosterId: last.rosterId,
      isFormer,
      succeededBy: handedOff
        ? {
            ownerId: handedOff.toOwnerId,
            displayName: handedOff.toName,
            season: handedOff.season,
          }
        : null,
      succeeded: inherited
        ? {
            ownerId: inherited.fromOwnerId,
            displayName: inherited.fromName,
            season: inherited.season,
          }
        : null,
    });
  }
  // Current managers first, then former, each alphabetical. Stable output.
  principals.sort(
    (a, b) =>
      Number(a.isFormer) - Number(b.isFormer) ||
      a.displayName.localeCompare(b.displayName) ||
      a.ownerId.localeCompare(b.ownerId),
  );
  const ownerBySeasonRoster = new Map();
  for (const s of seasonsAsc) {
    for (const [rosterId, ownerId] of s.owners) {
      ownerBySeasonRoster.set(`${s.season}|${rosterId}`, ownerId);
    }
  }
  const currentOwnerByRoster = new Map(
    currentRosters.map((r) => [r.rosterId, r.ownerId]),
  );
  return {
    principals,
    byOwnerId: new Map(principals.map((p) => [p.ownerId, p])),
    successions: successions.sort(
      (a, b) => a.season.localeCompare(b.season) || a.rosterId - b.rosterId,
    ),
    ownerAt: (season, rosterId) =>
      ownerBySeasonRoster.get(`${season}|${rosterId}`) ??
      currentOwnerByRoster.get(rosterId) ??
      null,
    hasSuccessions: successions.length > 0,
  };
}
let slot = null;
const TTL_MS = 5 * 60_000;
async function assemblePrincipals(h) {
  const provider = getLeagueProvider();
  const rows = await Promise.all(
    h.chain.map(async (league) => {
      try {
        const [rosters, users] = await Promise.all([
          provider.getRosters(league.leagueId),
          provider.getUsers(league.leagueId),
        ]);
        return { season: league.season, rosters, users };
      } catch {
        return { season: league.season, rosters: [], users: [] };
      }
    }),
  );
  const seasonsAsc = rows
    .filter((r) => r.rosters.length > 0)
    .sort((a, b) => a.season.localeCompare(b.season))
    .map((r) => ({
      season: r.season,
      owners: new Map(
        r.rosters
          .filter((x) => !!x.ownerId)
          .map((x) => [x.rosterId, x.ownerId]),
      ),
      users: new Map(r.users.map((u) => [u.userId, u])),
    }));
  return buildPrincipals(seasonsAsc, h.rosters, h.usersById);
}
/**
 * Load per-season ownership across the chain and build the index.
 *
 * Deliberately NOT part of the corpus: it costs two requests per season and only the
 * pages that attribute history to people need it. Cached in-process the same way the
 * draft index is, and a season that fails to load is skipped rather than fatal.
 */
export async function getPrincipals(h, opts = {}) {
  const key = `${h.provider}|${h.currentLeague.leagueId}`;
  if (!opts.fresh && slot && slot.key === key) {
    if (slot.resolvedAt === undefined) return slot.promise;
    if (Date.now() - slot.resolvedAt < TTL_MS) return slot.promise;
  }
  const next = { key };
  next.promise = assemblePrincipals(h)
    .then((value) => {
      next.resolvedAt = Date.now();
      return value;
    })
    .catch((err) => {
      // Clear the slot on rejection so a transient failure doesn't pin a rejected
      // promise for the rest of the TTL window (mirrors `ensureIngested`).
      if (slot === next) slot = null;
      throw err;
    });
  slot = next;
  return next.promise;
}
/** Reset the memo. Test and "fresh reload" hook. */
export function invalidatePrincipals() {
  slot = null;
}
/** Seasons a principal held a given roster, as a set for transaction filtering. */
export function tenureSeasons(p, rosterId) {
  const ts =
    rosterId == null
      ? p.tenures
      : p.tenures.filter((t) => t.rosterId === rosterId);
  return new Set(ts.flatMap((t) => t.seasons));
}
/**
 * "2022-2024" for a departed principal, undefined for a current one (nothing to
 * date-range). Shared rather than reimplemented per caller - awards, dossiers and the
 * deal record all need to print the same span for the same principal.
 */
export function tenureLabel(p) {
  if (!p.isFormer || p.seasons.length === 0) return undefined;
  const first = p.seasons[0];
  const last = p.seasons[p.seasons.length - 1];
  return first === last ? first : `${first}-${last}`;
}
