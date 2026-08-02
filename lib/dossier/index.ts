/**
 * Manager dossiers — behavioral profiles of leaguemates derived from their
 * transaction history. This is MANAGER scouting (how they behave), not roster
 * scouting (what they hold). Private to the user; never exported by default.
 *
 * Note on responsiveness: Sleeper exposes only COMPLETED transactions, not
 * rejected/ignored offers, so "responsiveness" is inferred from how often a
 * manager appears as a trade responder vs initiator — a proxy, flagged as such.
 *
 * PRINCIPAL-AWARE. A roster that changed hands is not one manager, it is two, and a
 * dossier that blends both tenures together describes a person who never existed.
 * Every dossier is scoped to the ONE principal it is about - see lib/principals.ts.
 * A CURRENT principal gets a dossier keyed by the roster they hold today
 * (`identity.kind === "current"`); a FORMER principal, who holds no roster at all,
 * gets one keyed by their own owner id (`identity.kind === "former"`), scoped to the
 * seasons they actually ran the team. Both funnel through one tag/read/tip engine
 * below so the two entry points cannot drift apart.
 */
import type { LeagueHistory } from "../history";
import { deriveManagerProfile, type ManagerProfile } from "../derive/manager";
import { tenureLabel, tenureSeasons, type PrincipalIndex } from "../principals";

export type DossierIdentity =
  | { kind: "current"; rosterId: number }
  | { kind: "former"; ownerId: string; lastRosterId: number; tenureLabel: string };

export interface Dossier {
  identity: DossierIdentity;
  profile: ManagerProfile;
  tags: string[];
  read: string;
  approachTips: string[];
  tradesPerSeason: number;
}

function tradesPerSeason(p: ManagerProfile, seasons: number): number {
  return Math.round((p.trades / Math.max(1, seasons)) * 10) / 10;
}

/**
 * The actual tag/read/tip derivation, shared by both entry points below. Takes an
 * already-derived (and already-scoped, where applicable) profile and the season
 * count to rate it against - the whole league's for an unscoped profile, or the
 * principal's own tenure length when scoped, so "trades/season" describes the
 * person's actual reign rather than diluting it against seasons they never played.
 */
function assembleDossier(
  p: ManagerProfile,
  seasonCount: number,
  identity: DossierIdentity,
): Dossier {
  const tps = tradesPerSeason(p, seasonCount);
  const tags: string[] = [];
  const tips: string[] = [];
  const read: string[] = [];

  const initiateRatio = p.trades ? p.tradesInitiated / p.trades : 0;

  // Volume / engagement
  if (p.trades === 0) {
    tags.push("Never trades");
    read.push(`${p.displayName} has not completed a single trade in the recorded history.`);
    tips.push("Don't build your plan around dealing with them - they simply don't trade.");
  } else if (tps >= 3) {
    tags.push("High-volume trader");
    read.push(`${p.displayName} is one of the most active traders in the league (~${tps} trades/season).`);
    tips.push("They'll engage. Volume means you can float multiple ideas without burning goodwill.");
  } else if (tps < 1) {
    tags.push("Rarely trades");
    read.push(`${p.displayName} trades sparingly (~${tps}/season).`);
    tips.push("Bring your best offer first - you may only get one bite.");
  }

  // Initiator vs responder
  if (p.trades >= 2) {
    if (initiateRatio >= 0.6) {
      tags.push("Initiator");
      read.push(`They usually start the conversation (${p.tradesInitiated}/${p.trades} trades self-initiated).`);
    } else if (initiateRatio <= 0.25) {
      tags.push("Responder");
      read.push(`They rarely initiate (${p.tradesInitiated}/${p.trades}); they wait for offers.`);
      tips.push("You'll have to make the first move - they won't come to you.");
    }
  }
  if (p.totalTransactions <= 2) {
    tags.push("Ghost");
    read.push(`Almost inactive overall (${p.totalTransactions} total transactions) - hard to engage.`);
  }

  // Pick behavior
  if (p.picks.net >= 3) {
    tags.push("Pick hoarder");
    read.push(`A draft-capital collector: net +${p.picks.net} picks (${p.picks.firstsAcquired} firsts acquired).`);
    tips.push("They value picks highly - a player-for-picks package plays into what they want.");
  } else if (p.picks.net <= -3) {
    tags.push("Pick spender");
    read.push(`Spends future capital freely: net ${p.picks.net} picks.`);
    tips.push("They'll give up picks - target their draft capital in your ask.");
  }

  // Age / name behavior
  if (p.overpaysForAge) {
    tags.push("Name chaser");
    read.push(`Repeatedly acquires 30+ veterans via trade - pays for name recognition over dynasty value.`);
    tips.push("Shop your aging vets here first; they'll pay a premium the market won't.");
  }
  if (p.acquisitions.avgAge != null && p.acquisitions.avgAge <= 24) {
    tags.push("Youth builder");
    read.push(`Skews young - average acquisition age ${p.acquisitions.avgAge}.`);
    tips.push("They want upside and youth; dangle young players and rookie picks.");
  }

  // Tilt / timing
  if (p.afterLoss && p.afterLoss.total >= 2 && p.afterLoss.afterLoss > p.afterLoss.afterWin) {
    tags.push("Reactive after losses");
    read.push(`Trades disproportionately after losses (${p.afterLoss.afterLoss}/${p.afterLoss.total}) - a tilt tell.`);
    tips.push("Approach them right after a rough week - they're most movable on tilt.");
  }
  if (p.deadline.buys > p.deadline.sells && p.deadline.buys >= 2) {
    tags.push("Deadline buyer");
    tips.push("They buy at the deadline - hold your sellable vets until then for max return.");
  } else if (p.deadline.sells > p.deadline.buys && p.deadline.sells >= 2) {
    tags.push("Deadline seller");
    tips.push("They dump at the deadline - a good late-season source of talent for picks.");
  }

  // Streaming
  if (p.freeAgents + p.waivers >= 20) {
    tags.push("Streamer");
    read.push(`Heavy waiver/FA churn (${p.waivers + p.freeAgents} moves) - works the margins hard.`);
  }
  if (p.faabAggression != null && p.faabAggression >= 25) {
    tags.push("Aggressive on FAAB");
  }

  if (read.length === 0) {
    read.push(`${p.displayName} is a balanced manager without a strong behavioral tell yet.`);
  }
  if (tips.length === 0) {
    tips.push("No sharp edge to exploit yet - approach with a fair, straightforward offer.");
  }

  return {
    identity,
    profile: p,
    tags: [...new Set(tags)],
    read: read.join(" "),
    approachTips: tips,
    tradesPerSeason: tps,
  };
}

/** Dossier for whoever currently holds `rosterId`, scoped to their own tenure. */
export function buildDossier(
  h: LeagueHistory,
  rosterId: number,
  principals: PrincipalIndex,
): Dossier {
  const roster = h.rostersById.get(rosterId);
  const principal = roster?.ownerId ? principals.byOwnerId.get(roster.ownerId) : undefined;

  // Only scope when there is something to scope: a league with no handovers must
  // produce byte-identical output to the unscoped version. See lib/superlatives.
  const scope =
    principal && principals.hasSuccessions
      ? {
          ownerId: principal.ownerId,
          displayName: principal.displayName,
          teamName: principal.teamName,
          seasons: tenureSeasons(principal, rosterId),
        }
      : undefined;

  const p = deriveManagerProfile(h, rosterId, scope);
  const seasonCount =
    scope?.seasons && scope.seasons.size > 0 ? scope.seasons.size : h.chain.length || 1;
  return assembleDossier(p, seasonCount, { kind: "current", rosterId });
}

/**
 * Dossier for a departed principal, scoped to the seasons they actually ran the
 * team. Returns null when the owner id is unknown or still holds a roster today -
 * a former dossier for a current manager would be a routing bug upstream.
 */
export function buildFormerDossier(
  h: LeagueHistory,
  ownerId: string,
  principals: PrincipalIndex,
): Dossier | null {
  const principal = principals.byOwnerId.get(ownerId);
  if (!principal || !principal.isFormer) return null;
  const label = tenureLabel(principal);
  if (!label) return null;

  const rosterId = principal.lastRosterId;
  const seasons = tenureSeasons(principal, rosterId);
  const scope = {
    ownerId: principal.ownerId,
    displayName: principal.displayName,
    teamName: principal.teamName,
    seasons,
  };
  const p = deriveManagerProfile(h, rosterId, scope);
  const seasonCount = seasons.size > 0 ? seasons.size : h.chain.length || 1;
  return assembleDossier(p, seasonCount, {
    kind: "former",
    ownerId,
    lastRosterId: rosterId,
    tenureLabel: label,
  });
}

/**
 * Dossiers for every principal except the viewer - current managers first (most
 * active first, matching the old roster-keyed ordering), then former managers
 * after, mirroring the ordering `principals.principals` itself already uses.
 */
export function getAllDossiers(h: LeagueHistory, principals: PrincipalIndex): Dossier[] {
  const meRoster = h.me.rosterId;

  const current = h.rosters
    .filter((r) => r.rosterId !== meRoster)
    .map((r) => buildDossier(h, r.rosterId, principals))
    .sort((a, b) => b.profile.totalTransactions - a.profile.totalTransactions);

  const former = principals.principals
    .filter((pr) => pr.isFormer && pr.ownerId !== h.me.userId)
    .map((pr) => buildFormerDossier(h, pr.ownerId, principals))
    .filter((d): d is Dossier => d != null);

  return [...current, ...former];
}

/**
 * Every principal's dossier keyed by owner id, THE VIEWER INCLUDED.
 *
 * `getAllDossiers` deliberately leaves the viewer out - it backs a scouting list, and
 * scouting yourself is not the point of that page. Comparing yourself against a
 * leaguemate is very much the point of comparing two managers, so this is a second,
 * narrower contract over the same two builders rather than a filter argument bolted
 * onto the first: both entry points keep saying exactly what they mean.
 *
 * Keyed by owner id because that is the identity that survives a handover. Both kinds
 * funnel through the existing builders, so a dossier read here can never disagree with
 * the same manager's own page.
 */
export function dossiersByOwner(
  h: LeagueHistory,
  principals: PrincipalIndex,
): Map<string, Dossier> {
  const out = new Map<string, Dossier>();
  for (const pr of principals.principals) {
    const d = pr.isFormer
      ? buildFormerDossier(h, pr.ownerId, principals)
      : pr.currentRosterId != null
        ? buildDossier(h, pr.currentRosterId, principals)
        : null;
    if (d) out.set(pr.ownerId, d);
  }
  return out;
}
