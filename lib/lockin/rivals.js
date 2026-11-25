/**
 * "If I let this score go, who on my roster could still beat it for this slot?"
 *
 * The plan behind the win chance already counts the bench (each unlocked slot keeps its
 * score only if it reaches the value of the slot's continuation, which can be a bench
 * player, D135). This module shows that work for one lock-or-hold slot in the form a
 * manager reasons about it: every player who could still fill the slot this week, his
 * games left with his chance of playing each, and his chance of reaching the score on the
 * table at least once; players who cannot help (no games left, ruled out) are listed so
 * nobody is silently counted.
 *
 * Each player's chance of beating x in one game is the share of his next-game forecast's
 * equally likely outcomes at or above x (the same outcomes the "next game" chart draws),
 * times his chance of playing that game. Games are treated as independent. His chance over
 * the week then goes through the same calibration as the card's "later game beats it"
 * (recalibrate.js, fitted on real lock situations), so the two agree. "Any of them"
 * assumes each option is free for this slot; when the plan uses a bench player in another
 * slot that is said beside him.
 */
import { eligible } from "./policy.js";

/** Share of a forecast sample at or above x. */
export function shareAtLeast(sample, x) {
  if (!Array.isArray(sample) || !sample.length || !Number.isFinite(x)) return null;
  return sample.filter((v) => v >= x).length / sample.length;
}

/** P(at least one of the games reaches x): 1 - prod(1 - pPlay * q). */
export function pBeatAny(games, q) {
  if (q == null) return null;
  let miss = 1;
  for (const g of games) miss *= 1 - Math.max(0, Math.min(1, g.pPlay ?? 0)) * q;
  return 1 - miss;
}

const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

/**
 * card: the lock-or-hold card (starter with stopping.x); cards: every card on the board;
 * optionOf(pid) -> { sample, games:[{date,pPlay}], status } | null (his forecast sample and
 * per-game play chances for his remaining games this week); planStarts: then_start plan
 * actions ({ playerId, slotIndex, slotLabel }).
 * Returns null without a score on the table; else
 * { x, slotLabel, options:[{ playerId, name, role, status, games, pGame, pBeat, elsewhere }],
 *   cannot:[{ playerId, name, status, why }], pAny, note }.
 */
export function slotRivals({ card, cards, optionOf, planStarts = [], calibrate = (p) => p }) {
  const x = card?.stopping?.x;
  if (!Number.isFinite(x) || card.role !== "starter" || !card.slotLabel) return null;
  const options = [];
  const cannot = [];
  const consider = [card, ...cards.filter((c) => c.role === "bench" && c.playerId !== card.playerId && eligible(c.positions || [], card.slotLabel))];
  for (const c of consider) {
    const o = optionOf(c.playerId);
    const status = c.injury?.status ?? o?.status ?? null;
    if (!o || !o.games.length) {
      cannot.push({ playerId: c.playerId, name: c.name, status, why: "no games left this week" });
      continue;
    }
    if (o.games.every((g) => !(g.pPlay > 0))) {
      cannot.push({ playerId: c.playerId, name: c.name, status, why: status ? `listed ${status} for his games left` : "not expected to play his games left" });
      continue;
    }
    const q = shareAtLeast(o.sample, x);
    const raw = pBeatAny(o.games, q);
    const pBeat = raw == null ? null : calibrate(raw);
    const plan = planStarts.find((a) => a.playerId === c.playerId && a.slotIndex !== card.slotIndex);
    options.push({
      playerId: c.playerId,
      name: c.name,
      role: c.playerId === card.playerId ? "self" : "bench",
      status,
      games: o.games.map((g) => ({ date: g.date, pPlay: r3(g.pPlay) })),
      pGame: r3(q),
      pBeat: r3(pBeat),
      elsewhere: plan ? { slotLabel: plan.slotLabel } : null,
    });
  }
  // himself first, then by chance of beating the score
  options.sort((a, b) => (a.role === "self" ? -1 : b.role === "self" ? 1 : (b.pBeat ?? 0) - (a.pBeat ?? 0)));
  const free = options.filter((o) => !o.elsewhere);
  const pAny = free.length ? 1 - free.reduce((t, o) => t * (1 - (o.pBeat ?? 0)), 1) : 0;
  return {
    x,
    slotLabel: card.slotLabel,
    options,
    cannot,
    pAny: r3(pAny),
    note: "Each chance comes from his forecast outcomes at or above the score and his chance of playing each game, calibrated like the card's other chances; games are treated as independent. Players the plan uses in another slot are left out of the combined figure.",
  };
}
