/**
 * MANAGER PRINCIPALS — separating the team from the human who ran it.
 *
 * A dynasty league's history is usually modelled as "roster 11 did these things for
 * five years". That is wrong the moment a team changes hands, and teams change hands
 * constantly in long-running leagues. Roster 11 in this league was run by one manager
 * through 2024 and by a different manager from 2025 on; the roster id, the team name
 * and the trade history all carried over, but the person making the decisions did not.
 *
 * Treating those as one manager corrupts everything downstream. It credits one
 * manager's drafts to another. It reports a trade-partner relationship with a person
 * who was never there. It averages two different risk appetites into one meaningless
 * profile. And for the owner of this app it erases the thing that actually matters
 * about a leaguemate: who you are negotiating with.
 *
 * So the unit of identity here is the PRINCIPAL - a platform user account - and the
 * unit of history is the TENURE, a (principal, roster, span of seasons) triple.
 *
 * HOW SUCCESSION IS DETECTED. Not inferred, not guessed. Every season in the league
 * chain has its own rosters endpoint, and each roster there carries the `owner_id` of
 * whoever held it THAT season. Walk the chain, read the owner off each season's roster,
 * and a handover is simply the season where that id changes. The departing manager's
 * display name is still available from that season's users endpoint, which is the only
 * place it survives - the current league's users list does not contain them.
 *
 * Verified against this league: thirteen of fourteen rosters have one owner id across
 * all five seasons, and one roster changes owner id exactly once, between 2024 and
 * 2025. Fifteen principals over fourteen rosters.
 *
 * A provider that returns the same users and rosters for every season (the fixture)
 * simply finds no successions and produces one principal per roster. Nothing throws.
 */
import type { LeagueHistory } from "./history";
import { getLeagueProvider } from "./providers";
import type { LeagueUser, Roster } from "./providers/types";

/** One continuous span of seasons in which one principal held one roster. */
export interface Tenure {
  rosterId: number;
  ownerId: string;
  /** Seasons held, ascending. */
  seasons: string[];
  firstSeason: string;
  lastSeason: string;
  /** They still hold this roster in the current season. */
  isCurrent: boolean;
}

export interface Succession {
  rosterId: number;
  /** The season the new principal first appears on the roster. */
  season: string;
  fromOwnerId: string;
  fromName: string;
  toOwnerId: string;
  toName: string;
}

export interface Principal {
  /** Platform user id. The stable identity key for a human manager. */
  ownerId: string;
  displayName: string;
  teamName: string | null;
  avatar: string | null;
  teamLogoUrl: string | null;
  tenures: Tenure[];
  /** Every season this principal was in the league, ascending. */
  seasons: string[];
  /** The roster they hold right now, or null if they have left the league. */
  currentRosterId: number | null;
  /** The last roster they held. Always set - used for historical attribution. */
  lastRosterId: number;
  /** No longer in the league. */
  isFormer: boolean;
  /** Set on a departed principal: who took the team over. */
  succeededBy: { ownerId: string; displayName: string; season: string } | null;
  /** Set on a principal who inherited a roster: who they took it from. */
  succeeded: { ownerId: string; displayName: string; season: string } | null;
}

export interface PrincipalIndex {
  /** All principals, current first then former, each group by display name. */
  principals: Principal[];
  byOwnerId: Map<string, Principal>;
  successions: Succession[];
  /**
   * THE ATTRIBUTION KEY. Who held `rosterId` during `season`.
   *
   * Every historical fact - a trade, a draft pick, a season's lineup management -
   * carries a season and a roster id, and this is the only correct way to turn that
   * pair into a person. Falls back to the roster's current owner when the season is
   * unknown to the index (a provider without per-season data), which degrades to the
   * old roster-keyed behaviour rather than dropping the fact.
   */
  ownerAt: (season: string, rosterId: number) => string | null;
  /** True when at least one roster in this league has changed hands. */
  hasSuccessions: boolean;
}

// ---------------------------------------------------------------- pure core

export interface SeasonOwnership {
  season: string;
  /** rosterId -> owner user id for that season. */
  owners: Map<number, string>;
  /** user id -> user record as that season knew them. */
  users: Map<string, LeagueUser>;
}

/**
 * Build the index from per-season ownership. Pure, so succession logic is testable
 * without a provider.
 *
 * `seasonsAsc` must be ascending, and the last entry is treated as "now".
 */
export function buildPrincipals(
  seasonsAsc: SeasonOwnership[],
  currentRosters: Roster[],
  currentUsers: Map<string, LeagueUser>,
): PrincipalIndex {
  const currentSeason = seasonsAsc[seasonsAsc.length - 1]?.season ?? null;

  // rosterId -> ordered list of (season, ownerId)
  const timeline = new Map<number, { season: string; ownerId: string }[]>();
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
  const userOf = (ownerId: string): LeagueUser | undefined => {
    const cur = currentUsers.get(ownerId);
    if (cur) return cur;
    for (let i = seasonsAsc.length - 1; i >= 0; i--) {
      const u = seasonsAsc[i].users.get(ownerId);
      if (u) return u;
    }
    return undefined;
  };
  const nameOf = (ownerId: string) => userOf(ownerId)?.displayName ?? ownerId;

  // Split each roster's timeline into contiguous tenures, and record handovers.
  const tenuresByOwner = new Map<string, Tenure[]>();
  const successions: Succession[] = [];
  for (const [rosterId, rows] of timeline) {
    let run: { ownerId: string; seasons: string[] } | null = null;
    const runs: { ownerId: string; seasons: string[] }[] = [];
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
        isCurrent:
          currentSeason != null && r.seasons.includes(currentSeason),
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
    currentRosters.map((r) => r.ownerId).filter((x): x is string => !!x),
  );

  const principals: Principal[] = [];
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

  const ownerBySeasonRoster = new Map<string, string>();
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

// ---------------------------------------------------------------- loader

/**
 * SINGLE-FLIGHT: stores the in-flight PROMISE, not the resolved value (mirrors the
 * fix to `getCorpus` in lib/history.ts). This loader costs two requests per season;
 * without single-flight, N concurrent cold readers each ran their own full pass.
 * `resolvedAt` is only set once the promise settles, so a caller arriving mid-load
 * always joins it, and the TTL is anchored to completion time exactly as before once
 * there is a resolved value that can go stale.
 */
interface PrincipalsSlot {
  key: string;
  promise: Promise<PrincipalIndex>;
  resolvedAt?: number;
}
let slot: PrincipalsSlot | null = null;
const TTL_MS = 5 * 60_000;

async function assemblePrincipals(h: LeagueHistory): Promise<PrincipalIndex> {
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
        return { season: league.season, rosters: [] as Roster[], users: [] as LeagueUser[] };
      }
    }),
  );

  const seasonsAsc: SeasonOwnership[] = rows
    .filter((r) => r.rosters.length > 0)
    .sort((a, b) => a.season.localeCompare(b.season))
    .map((r) => ({
      season: r.season,
      owners: new Map(
        r.rosters
          .filter((x) => !!x.ownerId)
          .map((x) => [x.rosterId, x.ownerId as string]),
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
export async function getPrincipals(
  h: LeagueHistory,
  opts: { fresh?: boolean } = {},
): Promise<PrincipalIndex> {
  const key = `${h.provider}|${h.currentLeague.leagueId}`;
  if (!opts.fresh && slot && slot.key === key) {
    if (slot.resolvedAt === undefined) return slot.promise;
    if (Date.now() - slot.resolvedAt < TTL_MS) return slot.promise;
  }

  const next: PrincipalsSlot = { key } as PrincipalsSlot;
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
export function invalidatePrincipals(): void {
  slot = null;
}

/** Seasons a principal held a given roster, as a set for transaction filtering. */
export function tenureSeasons(p: Principal, rosterId?: number): Set<string> {
  const ts =
    rosterId == null ? p.tenures : p.tenures.filter((t) => t.rosterId === rosterId);
  return new Set(ts.flatMap((t) => t.seasons));
}

/**
 * "2022-2024" for a departed principal, undefined for a current one (nothing to
 * date-range). Shared rather than reimplemented per caller - awards, dossiers and the
 * deal record all need to print the same span for the same principal.
 */
export function tenureLabel(p: Principal): string | undefined {
  if (!p.isFormer || p.seasons.length === 0) return undefined;
  const first = p.seasons[0];
  const last = p.seasons[p.seasons.length - 1];
  return first === last ? first : `${first}-${last}`;
}
