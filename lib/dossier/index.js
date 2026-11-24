import { deriveManagerProfile } from "../derive/manager.js";
import { tenureLabel, tenureSeasons } from "../principals.js";
function tradesPerSeason(p, seasons) {
  return Math.round((p.trades / Math.max(1, seasons)) * 10) / 10;
}
/**
 * The actual tag/read/tip derivation, shared by both entry points below. Takes an
 * already-derived (and already-scoped, where applicable) profile and the season
 * count to rate it against - the whole league's for an unscoped profile, or the
 * principal's own tenure length when scoped, so "trades/season" describes the
 * person's actual reign rather than diluting it against seasons they never played.
 */
function assembleDossier(p, seasonCount, identity) {
  // Tips describe what their record shows, never a prediction of what they will do
  // (manager habits did not predict better than the league average; D6 no verdicts).
  const tps = tradesPerSeason(p, seasonCount);
  const tags = [];
  const tips = [];
  const read = [];
  const initiateRatio = p.trades ? p.tradesInitiated / p.trades : 0;
  // Volume / engagement
  if (p.trades === 0) {
    tags.push("No trades on record");
    read.push(
      `${p.displayName} has not completed a single trade in the recorded history.`,
    );
    tips.push(
      "No completed trades on record, so there is no pattern to plan around.",
    );
  } else if (tps >= 3) {
    tags.push("Trades often");
    read.push(
      `${p.displayName} is one of the most active traders in the league (~${tps} trades/season).`,
    );
    tips.push(
      `They have traded about ${tps} times a season, so more than one idea at a time has precedent.`,
    );
  } else if (tps < 1) {
    tags.push("Trades rarely");
    read.push(`${p.displayName} trades sparingly (~${tps}/season).`);
    tips.push(`They have traded about ${tps} times a season; lead with your strongest offer.`);
  }
  // Initiator vs responder
  if (p.trades >= 2) {
    if (initiateRatio >= 0.6) {
      tags.push("Usually starts trades");
      read.push(
        `They usually start the conversation (${p.tradesInitiated}/${p.trades} trades self-initiated).`,
      );
    } else if (initiateRatio <= 0.25) {
      tags.push("Usually answers offers");
      read.push(
        `They rarely initiate (${p.tradesInitiated}/${p.trades}); they wait for offers.`,
      );
      tips.push("Most of their trades started with the other side's offer.");
    }
  }
  if (p.totalTransactions <= 2) {
    tags.push("Few moves of any kind");
    read.push(
      `Almost inactive overall (${p.totalTransactions} total transactions).`,
    );
  }
  // Pick behavior
  if (p.picks.net >= 3) {
    tags.push("Adds picks on net");
    read.push(
      `Has added picks on net: +${p.picks.net} (${p.picks.firstsAcquired} firsts acquired).`,
    );
    tips.push(
      "They have added picks on net; a package built around picks matches what they have done.",
    );
  } else if (p.picks.net <= -3) {
    tags.push("Gives up picks on net");
    read.push(`Has given up picks on net: ${p.picks.net}.`);
    tips.push(
      "They have given up picks on net; their draft capital has moved before.",
    );
  }
  // Age / name behavior
  if (p.overpaysForAge) {
    tags.push("Trades for established names");
    read.push(
      `Has traded for 30+ veterans more than once.`,
    );
    tips.push(
      "They have traded for 30+ veterans more than once; an aging vet has found a buyer here before.",
    );
  }
  if (p.acquisitions.avgAge != null && p.acquisitions.avgAge <= 24) {
    tags.push("Acquires young players");
    read.push(
      `Skews young - average acquisition age ${p.acquisitions.avgAge}.`,
    );
    tips.push(
      "Their acquisitions skew young; young players and rookie picks match their record.",
    );
  }
  // Timing
  if (
    p.afterLoss &&
    p.afterLoss.total >= 2 &&
    p.afterLoss.afterLoss > p.afterLoss.afterWin
  ) {
    tags.push("Trades more after losses");
    read.push(
      `More of their trades came after a loss (${p.afterLoss.afterLoss}/${p.afterLoss.total}).`,
    );
    tips.push(
      "More of their trades came in the week after a loss.",
    );
  }
  if (p.deadline.buys > p.deadline.sells && p.deadline.buys >= 2) {
    tags.push("Buys at the deadline");
    tips.push(
      "They have bought at past trade deadlines.",
    );
  } else if (p.deadline.sells > p.deadline.buys && p.deadline.sells >= 2) {
    tags.push("Sells at the deadline");
    tips.push(
      "They have sold at past trade deadlines.",
    );
  }
  // Streaming
  if (p.freeAgents + p.waivers >= 20) {
    tags.push("Works waivers and FA heavily");
    read.push(
      `Many waiver and free-agent moves (${p.waivers + p.freeAgents}).`,
    );
  }
  if (p.faabAggression != null && p.faabAggression >= 25) {
    tags.push("Bids high on FAAB");
  }
  if (read.length === 0) {
    read.push(
      `No strong pattern in ${p.displayName}'s record yet.`,
    );
  }
  if (tips.length === 0) {
    tips.push(
      "No strong pattern in their record yet; a straightforward offer is the usual start.",
    );
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
export function buildDossier(h, rosterId, principals) {
  const roster = h.rostersById.get(rosterId);
  const principal = roster?.ownerId
    ? principals.byOwnerId.get(roster.ownerId)
    : undefined;
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
  const p = deriveManagerProfile(h, rosterId, scope, principals);
  const seasonCount =
    scope?.seasons && scope.seasons.size > 0
      ? scope.seasons.size
      : h.chain.length || 1;
  return assembleDossier(p, seasonCount, { kind: "current", rosterId });
}
/**
 * Dossier for a departed principal, scoped to the seasons they actually ran the
 * team. Returns null when the owner id is unknown or still holds a roster today -
 * a former dossier for a current manager would be a routing bug upstream.
 */
export function buildFormerDossier(h, ownerId, principals) {
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
  const p = deriveManagerProfile(h, rosterId, scope, principals);
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
export function getAllDossiers(h, principals) {
  const meRoster = h.me.rosterId;
  const current = h.rosters
    .filter((r) => r.rosterId !== meRoster)
    .map((r) => buildDossier(h, r.rosterId, principals))
    .sort((a, b) => b.profile.totalTransactions - a.profile.totalTransactions);
  const former = principals.principals
    .filter((pr) => pr.isFormer && pr.ownerId !== h.me.userId)
    .map((pr) => buildFormerDossier(h, pr.ownerId, principals))
    .filter((d) => d != null);
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
export function dossiersByOwner(h, principals) {
  const out = new Map();
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
