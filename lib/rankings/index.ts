/**
 * Ranking sources, custom rankings, and blending.
 *
 * The valuation model takes exactly one rank per player as its spine, which makes this
 * cheap to layer in: swap or blend the rank input and every downstream number (player
 * value, roster value, trade evaluation, pick capital comparisons) follows automatically.
 *
 * Three ideas, kept separate on purpose:
 *   1. A SOURCE is somewhere ranks come from. The baseline source is the league
 *      platform's own ordering, which ships free with the player payload.
 *   2. A CUSTOM ranking is the user's own ordering. It only needs to cover the players
 *      the user actually has an opinion about; everything else falls through.
 *   3. A BLEND mixes them, with the weight exposed. Blending rather than replacing is
 *      the defensible default: your read on 30 players is probably sharper than
 *      consensus, and your read on the 400th player almost certainly is not.
 *
 * Disagreement between your ranking and consensus is itself a product surface: it is
 * exactly where your edge (or your bias) lives, so it is computed here rather than
 * being left implicit.
 */
import type { Player } from "../providers/types";

export type RankSourceId = "consensus" | "custom" | "blend";

export interface RankSource {
  id: RankSourceId;
  label: string;
  /** Human note on where these ranks come from and what they are worth. */
  provenance: string;
  /** playerId -> rank (1 = best). Sparse is fine. */
  ranks: Map<string, number>;
}

/**
 * The baseline ordering that ships with the player data. It is somebody else's number
 * and we do not control it, but it is free, always present, and empirically a credible
 * dynasty ordering at the top of the board.
 */
export function consensusSource(players: Player[]): RankSource {
  const ranks = new Map<string, number>();
  for (const p of players) {
    if (p.searchRank != null) ranks.set(p.playerId, p.searchRank);
  }
  return {
    id: "consensus",
    label: "Consensus",
    provenance:
      "The league platform's own player ordering, shipped with the player payload. " +
      "Free and always available, but not ours and not dynasty-specific.",
    ranks,
  };
}

/**
 * A user-authored ranking. Accepts an ordered list of playerIds (best first) and
 * turns it into ranks. Only the listed players are ranked; the rest fall through to
 * whatever it is blended with.
 */
export function customSource(orderedPlayerIds: string[]): RankSource {
  const ranks = new Map<string, number>();
  orderedPlayerIds.forEach((pid, i) => ranks.set(pid, i + 1));
  return {
    id: "custom",
    label: "Your ranking",
    provenance: `Your own ordering of ${orderedPlayerIds.length} players.`,
    ranks,
  };
}

/**
 * Blend two rank sources. `weight` is how much to trust the override, 0..1:
 *   0   = pure base (consensus)
 *   1   = pure override wherever it has an opinion
 *   0.5 = split the difference
 *
 * Players the override does not rank keep the base rank untouched, so a 30-player
 * custom list does not silently demote the other 2000 players to unranked.
 */
export function blendSources(
  base: RankSource,
  override: RankSource,
  weight: number,
): RankSource {
  const w = Math.min(1, Math.max(0, weight));
  const ranks = new Map(base.ranks);
  for (const [pid, overrideRank] of override.ranks) {
    const baseRank = base.ranks.get(pid);
    ranks.set(
      pid,
      baseRank == null ? overrideRank : baseRank * (1 - w) + overrideRank * w,
    );
  }
  return {
    id: "blend",
    label: `Blend (${Math.round(w * 100)}% yours)`,
    provenance:
      `${Math.round((1 - w) * 100)}% ${base.label} / ${Math.round(w * 100)}% ` +
      `${override.label}, over the ${override.ranks.size} players you ranked.`,
    ranks,
  };
}

export interface Disagreement {
  playerId: string;
  name: string;
  yourRank: number;
  consensusRank: number;
  /** Positive = you are higher on them than consensus. */
  delta: number;
}

/**
 * Where your ranking and consensus disagree, biggest gaps first.
 *
 * This is the honest-mirror surface: it shows both your strongest convictions and, read
 * the other way, exactly where you are most likely to be wrong. It does not editorialise
 * about which is which.
 */
export function disagreements(
  custom: RankSource,
  consensus: RankSource,
  players: Map<string, Player>,
): Disagreement[] {
  const out: Disagreement[] = [];
  for (const [pid, yourRank] of custom.ranks) {
    const consensusRank = consensus.ranks.get(pid);
    if (consensusRank == null) continue;
    const p = players.get(pid);
    out.push({
      playerId: pid,
      name: p?.fullName ?? pid,
      yourRank,
      consensusRank,
      // Lower rank number is better, so consensus - yours is positive when you are
      // higher on the player than consensus is.
      delta: consensusRank - yourRank,
    });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * Apply a rank source to players, returning copies with `searchRank` overridden.
 *
 * Returning modified copies (rather than threading a rank map through every valuation
 * signature) means the whole existing pipeline picks up custom ranks with no changes:
 * valuation, roster analysis, the trade evaluator and pick comparisons all read
 * `player.searchRank` already.
 */
export function applyRanks(players: Player[], source: RankSource): Player[] {
  return players.map((p) => {
    const r = source.ranks.get(p.playerId);
    return r == null ? p : { ...p, searchRank: Math.round(r) };
  });
}
