/**
 * Head-to-head win probability for the rest of a lock-in week, by seeded Monte Carlo.
 * A team's week = fixed points (locked, or final scores that stand) + riders (holding a
 * score they may still lock) + open slots filled by the existing policy's assignment.
 * Every player walks his remaining games with his OWN next-game sample (model.js), his
 * play probability, and the per-player reservation rule; the same random numbers serve
 * every branch of a decision, so differences between branches are not simulation noise.
 */
import { MODEL } from "./model.js";

export const SIM = Object.freeze({ sims: 2000, seed: 20261124 });

/** Deterministic PRNG (mulberry32). */
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const capK = (k) => Math.min(k, MODEL.kMax);

/**
 * One player's banked score for the rest of the week.
 * p: { sample, q, r, H, games: [{ plays: true|false|null, p?: play probability }], x: number|null, noLock?: bool }
 * At each deadline before game i: lock x iff (plays ? x >= r_left : x >= H_{left-1}(0)).
 * Unlocked x resets at each tip; a DNP makes it 0. End of week: x (0 if none).
 */
export function walkPlayer(p, rnd, { thresholdShift = 0 } = {}) {
  let x = p.x;
  const G = p.games;
  for (let i = 0; i < G.length; i++) {
    const left = G.length - i;
    const plays = G[i].plays == null ? rnd() < (G[i].p ?? p.q) : G[i].plays;
    if (x !== null && !p.noLock) {
      const bar = plays ? p.r[capK(left)] : p.H(capK(left - 1), 0);
      if (x >= bar + thresholdShift) return x;
    }
    x = plays ? p.sample[Math.floor(rnd() * p.sample.length)] : x === null ? null : 0;
  }
  return x === null ? 0 : x;
}

/**
 * Totals for a team over `sims` draws.
 * team: { fixed, riders: [player & { wLocked? }], slots: [player | null], shift? , emptyRate?, thresholdShift? }
 *   riders: holding x; with probability wLocked (opponent's unknown lock) the x is already locked
 *   slots:  the player the policy assigns to each open slot (null = left empty)
 *   shift:  points added per undecided slot (league or manager behaviour vs the rule), may be 0
 *   emptyRate: per open slot, probability it ends at 0 (empty / unlocked DNP habit)
 *   live:   players whose game is in progress (M7): tonight's final is drawn from the in-game
 *           projection Normal(xLive.mean, xLive.sd), floored at 0, then the rule walks his
 *           later games from that score (banks it if it clears the bar)
 */
export function simulateTotals(team, { sims = SIM.sims, seed = SIM.seed } = {}) {
  const out = new Float64Array(sims);
  const ts = { thresholdShift: team.thresholdShift ?? 0 };
  // common random numbers: each player has his own stream per draw (seed, his id, draw index),
  // so two branches that differ in one decision differ only by that decision
  const live = team.live || [];
  // streamId: a player's later games in another role (after tonight) draw from their own stream
  const streams = [...team.riders, ...team.slots, ...live].map((p) => (p ? hashId(p.streamId ?? p.id ?? "", seed) : 0));
  const nR = team.riders.length;
  const nRS = nR + team.slots.length;
  for (let s = 0; s < sims; s++) {
    let t = team.fixed;
    for (let i = 0; i < nR; i++) {
      const r = team.riders[i];
      const rnd = rngFrom(streams[i] ^ Math.imul(s + 1, 0x9e3779b1));
      if (r.wLocked != null && rnd() < r.wLocked) t += r.x;
      else t += walkPlayer(r, rnd, ts) + (team.shift ?? 0);
    }
    for (let j = 0; j < team.slots.length; j++) {
      const p = team.slots[j];
      if (!p) continue;
      const rnd = rngFrom(streams[nR + j] ^ Math.imul(s + 1, 0x9e3779b1));
      const liveNow = p.kind === "start" && p.first.xLive;
      if (team.emptyRate && !liveNow && rnd() < team.emptyRate) continue;
      if (p.kind === "start") {
        // B-live2: a game in progress draws tonight's final from its projection
        const x = liveNow ? Math.max(0, p.first.xLive.mean + p.first.xLive.sd * gauss(rnd)) : walkPlayer({ ...p.first, x: null }, rnd, ts);
        // a live slot is still an undecided slot (bank tonight or move on), so it takes the team's
        // shift once, as it did before the tip as an ordinary slot
        const sh = liveNow ? (team.shift ?? 0) : 0;
        if (x >= p.C || !p.pick) t += x + sh;
        // a live slot that would move on stays at tonight's score when the manager leaves it empty
        else if (liveNow && team.emptyRate && rnd() < team.emptyRate) t += x + sh;
        else t += walkPlayer(p.pick, rngFrom(hashId(p.pick.streamId ?? `${p.pick.id ?? ""}|after`, seed) ^ Math.imul(s + 1, 0x9e3779b1)), ts) + sh;
        continue;
      }
      t += walkPlayer(p, rnd, ts) + (team.shift ?? 0);
    }
    for (let k = 0; k < live.length; k++) {
      const p = live[k];
      const rnd = rngFrom(streams[nRS + k] ^ Math.imul(s + 1, 0x9e3779b1));
      const x = Math.max(0, p.xLive.mean + p.xLive.sd * gauss(rnd));
      t += p.games.length ? walkPlayer({ ...p, x }, rnd, ts) + (team.shift ?? 0) : x;
    }
    out[s] = t;
  }
  return out;
}

/** Standard normal draw (Box-Muller) from a uniform stream. */
function gauss(rnd) {
  const u = Math.max(rnd(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

function hashId(id, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * Expected banked value of a player walked from scratch over his games with their play
 * probabilities (the rule's own value): v = p E[max(Y, v_next)] + (1 - p) v_next.
 */
export function freshValue(p) {
  let v = 0;
  for (let i = p.games.length - 1; i >= 0; i--) {
    const g = p.games[i];
    const pp = g.plays === false ? 0 : g.plays === true ? 1 : (g.p ?? p.q);
    let e = 0;
    for (const y of p.sample) e += Math.max(y, v);
    v = pp * (e / p.sample.length) + (1 - pp) * v;
  }
  return v;
}

/**
 * A start: `first` plays tonight's game only; the slot banks his score if it reaches the
 * value of continuing, otherwise it passes to the better of `next` (the player the policy had
 * there, his later games kept, or the incoming player's own later games).
 */
export function startChain(incoming, continuation, { allowAfter = true } = {}) {
  const first = { ...incoming, games: incoming.games.slice(0, 1) };
  // allowAfter false: his later games already belong to another slot, so they are not offered
  const after = allowAfter && incoming.games.length > 1 ? { ...incoming, games: incoming.games.slice(1), streamId: `${incoming.id}|after` } : null;
  const options = [continuation, after].filter((x) => x && x.games.length);
  let pick = null;
  let C = 0;
  for (const o of options) {
    const v = freshValue(o);
    if (pick === null || v > C) {
      pick = o;
      C = v;
    }
  }
  return { kind: "start", id: incoming.id, first, pick, C };
}

/** P(a > b) + half of ties, paired draws. */
export function pWin(a, b) {
  let w = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) w += a[i] > b[i] ? 1 : a[i] === b[i] ? 0.5 : 0;
  return w / n;
}

export function summarise(a) {
  const s = Array.from(a).sort((x, y) => x - y);
  const q = (t) => s[Math.min(s.length - 1, Math.floor(t * (s.length - 1)))];
  return { mean: s.reduce((t, x) => t + x, 0) / s.length, p10: q(0.1), p50: q(0.5), p90: q(0.9) };
}

/**
 * Win probability if a holder locks now vs holds, everything else as `team`.
 * holderIndex: index into team.riders. Hold = his score resets at his next tip.
 */
export function decisionWinProbs(team, holderIndex, theirs, opts = {}) {
  const h = team.riders[holderIndex];
  const others = team.riders.filter((_, i) => i !== holderIndex);
  const lock = simulateTotals({ ...team, fixed: team.fixed + h.x, riders: others }, opts);
  const hold = simulateTotals({ ...team, riders: others, slots: [...team.slots, { ...h, x: null }] }, opts);
  return { ifLock: pWin(lock, theirs), ifHold: pWin(hold, theirs), lock, hold };
}
