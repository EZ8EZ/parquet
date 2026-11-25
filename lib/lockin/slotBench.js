/**
 * "Who else could play this slot?" For each of my slots not locked yet: the occupant's
 * projected points for the rest of the week next to every bench player who is eligible for
 * the slot and still has a game, each with his projected points if he took the slot from now.
 *
 * Both sides of the comparison are the value the plan itself uses to fill a slot (freshValue:
 * the expected banked score playing each of his games with his chance of playing it and
 * keeping the best by the stopping rule), so the list ranks bench players the way the win
 * chance does. A held score is part of the occupant's value (the better of locking it now and
 * holding, from the card); moving someone else in gives that score up. A bench player the plan already starts in
 * another slot later in the week says so. Projections only; nothing here is a lineup move.
 */
import { eligible } from "./policy.js";
import { freshValue } from "./winprob.js";

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

const asSim = (o) => ({ sample: o.sample, q: 1, games: o.games.map((g) => (g.pPlay === 0 ? { plays: false } : { plays: null, p: g.pPlay })) });

/**
 * slots: my desk slots; cards: every card; optionOf(pid) -> { sample, games:[{date,pPlay}], status } | null;
 * planStarts: then_start plan actions ({ playerId, slotIndex, slotLabel }).
 * Returns { [slotIndex]: { occupant: { playerId, name, expected, banked } | null, options: [...] } }.
 */
export function slotBench({ slots, cards, optionOf, planStarts = [] }) {
  const out = {};
  const byId = new Map(cards.map((c) => [c.playerId, c]));
  const bench = cards.filter((c) => c.role === "bench");
  for (const s of slots || []) {
    if (s.lockState === "locked" || !s.label) continue;
    const occCard = s.playerId ? byId.get(s.playerId) : null;
    let occupant = null;
    if (s.playerId) {
      const o = optionOf(s.playerId);
      // a held score: keeping him is worth the better of locking it now or holding
      const held = occCard?.stopping?.expectedIfHeld;
      const x = occCard?.stopping?.x;
      const expected = Number.isFinite(held) ? Math.max(held, Number.isFinite(x) ? x : 0) : o && o.games.length ? freshValue(asSim(o)) : (s.banked ?? 0);
      occupant = { playerId: s.playerId, name: s.name, expected: r1(expected), banked: s.banked ?? null, lockNow: Number.isFinite(x) ? r1(x) : null, ifHeld: Number.isFinite(held) ? r1(held) : null };
    }
    const options = [];
    for (const c of bench) {
      if (!eligible(c.positions || [], s.label)) continue;
      const o = optionOf(c.playerId);
      if (!o || !o.games.length || o.games.every((g) => !(g.pPlay > 0))) continue;
      const expected = freshValue(asSim(o));
      const plan = planStarts.find((a) => a.playerId === c.playerId && a.slotIndex !== s.index);
      options.push({
        playerId: c.playerId,
        name: c.name,
        status: c.injury?.status ?? o.status ?? null,
        gamesLeft: o.games.filter((g) => g.pPlay > 0).length,
        expected: r1(expected),
        vsOccupant: occupant ? r1(expected - occupant.expected) : null,
        elsewhere: plan ? plan.slotLabel : null,
      });
    }
    options.sort((a, b) => b.expected - a.expected);
    out[s.index] = { occupant, options };
  }
  return out;
}
