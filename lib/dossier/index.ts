/**
 * Manager dossiers — behavioral profiles of leaguemates derived from their
 * transaction history. This is MANAGER scouting (how they behave), not roster
 * scouting (what they hold). Private to the user; never exported by default.
 *
 * Note on responsiveness: Sleeper exposes only COMPLETED transactions, not
 * rejected/ignored offers, so "responsiveness" is inferred from how often a
 * manager appears as a trade responder vs initiator — a proxy, flagged as such.
 */
import type { LeagueHistory } from "../history";
import { deriveManagerProfile, type ManagerProfile } from "../derive/manager";

export interface Dossier {
  profile: ManagerProfile;
  tags: string[];
  read: string;
  approachTips: string[];
  tradesPerSeason: number;
}

function tradesPerSeason(p: ManagerProfile, seasons: number): number {
  return Math.round((p.trades / Math.max(1, seasons)) * 10) / 10;
}

export function buildDossier(h: LeagueHistory, rosterId: number): Dossier {
  const p = deriveManagerProfile(h, rosterId);
  const seasons = h.chain.length || 1;
  const tps = tradesPerSeason(p, seasons);
  const tags: string[] = [];
  const tips: string[] = [];
  const read: string[] = [];

  const initiateRatio = p.trades ? p.tradesInitiated / p.trades : 0;

  // Volume / engagement
  if (p.trades === 0) {
    tags.push("Never trades");
    read.push(`${p.displayName} has not completed a single trade in the recorded history.`);
    tips.push("Don't build your plan around dealing with them — they simply don't trade.");
  } else if (tps >= 3) {
    tags.push("High-volume trader");
    read.push(`${p.displayName} is one of the most active traders in the league (~${tps} trades/season).`);
    tips.push("They'll engage. Volume means you can float multiple ideas without burning goodwill.");
  } else if (tps < 1) {
    tags.push("Rarely trades");
    read.push(`${p.displayName} trades sparingly (~${tps}/season).`);
    tips.push("Bring your best offer first — you may only get one bite.");
  }

  // Initiator vs responder
  if (p.trades >= 2) {
    if (initiateRatio >= 0.6) {
      tags.push("Initiator");
      read.push(`They usually start the conversation (${p.tradesInitiated}/${p.trades} trades self-initiated).`);
    } else if (initiateRatio <= 0.25) {
      tags.push("Responder");
      read.push(`They rarely initiate (${p.tradesInitiated}/${p.trades}); they wait for offers.`);
      tips.push("You'll have to make the first move — they won't come to you.");
    }
  }
  if (p.totalTransactions <= 2) {
    tags.push("Ghost");
    read.push(`Almost inactive overall (${p.totalTransactions} total transactions) — hard to engage.`);
  }

  // Pick behavior
  if (p.picks.net >= 3) {
    tags.push("Pick hoarder");
    read.push(`A draft-capital collector: net +${p.picks.net} picks (${p.picks.firstsAcquired} firsts acquired).`);
    tips.push("They value picks highly — a player-for-picks package plays into what they want.");
  } else if (p.picks.net <= -3) {
    tags.push("Pick spender");
    read.push(`Spends future capital freely: net ${p.picks.net} picks.`);
    tips.push("They'll give up picks — target their draft capital in your ask.");
  }

  // Age / name behavior
  if (p.overpaysForAge) {
    tags.push("Name chaser");
    read.push(`Repeatedly acquires 30+ veterans via trade — pays for name recognition over dynasty value.`);
    tips.push("Shop your aging vets here first; they'll pay a premium the market won't.");
  }
  if (p.acquisitions.avgAge != null && p.acquisitions.avgAge <= 24) {
    tags.push("Youth builder");
    read.push(`Skews young — average acquisition age ${p.acquisitions.avgAge}.`);
    tips.push("They want upside and youth; dangle young players and rookie picks.");
  }

  // Tilt / timing
  if (p.afterLoss && p.afterLoss.total >= 2 && p.afterLoss.afterLoss > p.afterLoss.afterWin) {
    tags.push("Reactive after losses");
    read.push(`Trades disproportionately after losses (${p.afterLoss.afterLoss}/${p.afterLoss.total}) — a tilt tell.`);
    tips.push("Approach them right after a rough week — they're most movable on tilt.");
  }
  if (p.deadline.buys > p.deadline.sells && p.deadline.buys >= 2) {
    tags.push("Deadline buyer");
    tips.push("They buy at the deadline — hold your sellable vets until then for max return.");
  } else if (p.deadline.sells > p.deadline.buys && p.deadline.sells >= 2) {
    tags.push("Deadline seller");
    tips.push("They dump at the deadline — a good late-season source of talent for picks.");
  }

  // Streaming
  if (p.freeAgents + p.waivers >= 20) {
    tags.push("Streamer");
    read.push(`Heavy waiver/FA churn (${p.waivers + p.freeAgents} moves) — works the margins hard.`);
  }
  if (p.faabAggression != null && p.faabAggression >= 25) {
    tags.push("Aggressive on FAAB");
  }

  if (read.length === 0) {
    read.push(`${p.displayName} is a balanced manager without a strong behavioral tell yet.`);
  }
  if (tips.length === 0) {
    tips.push("No sharp edge to exploit yet — approach with a fair, straightforward offer.");
  }

  return {
    profile: p,
    tags: [...new Set(tags)],
    read: read.join(" "),
    approachTips: tips,
    tradesPerSeason: tps,
  };
}

/** Dossiers for every manager except the user, most active first. */
export function getAllDossiers(h: LeagueHistory): Dossier[] {
  const meRoster = h.me.rosterId;
  return h.rosters
    .filter((r) => r.rosterId !== meRoster)
    .map((r) => buildDossier(h, r.rosterId))
    .sort((a, b) => b.profile.totalTransactions - a.profile.totalTransactions);
}
