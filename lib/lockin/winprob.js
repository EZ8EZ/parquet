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
  const shift = team.shift ?? 0;
  // common random numbers: each player has his own stream per draw (seed, his id, draw index),
  // so two branches that differ in one decision differ only by that decision
  const live = team.live || [];
  // streamId: a player's later games in another role (after tonight) draw from their own stream
  const streamOf = (p) => hashId(p.streamId ?? p.id ?? "", seed);
  const streams = [...team.riders, ...team.slots, ...live].map((p) => (p ? streamOf(p) : 0));
  const nR = team.riders.length;
  const nRS = nR + team.slots.length;
  const mix = (s) => Math.imul(s + 1, 0x9e3779b1);
  // a start chain (tonight's player, then the slot's continuation); `withShift` false inside a hold
  const startValue = (p, rnd, s, withShift) => {
    const liveNow = !!p.first.xLive;
    // B-live2: a game in progress draws tonight's final from its projection
    const x = liveNow ? Math.max(0, p.first.xLive.mean + p.first.xLive.sd * gauss(rnd)) : walkPlayer({ ...p.first, x: null }, rnd, ts);
    // a live slot is still an undecided slot (bank tonight or move on), so it takes the team's
    // shift once, as it did before the tip as an ordinary slot
    const sh = liveNow && withShift ? shift : 0;
    if (x >= p.C || !p.pick) return x + sh;
    // a live slot that would move on stays at tonight's score when the manager leaves it empty
    if (liveNow && team.emptyRate && rnd() < team.emptyRate) return x + sh;
    return walkPlayer(p.pick, rngFrom(hashId(p.pick.streamId ?? `${p.pick.id ?? ""}|after`, seed) ^ mix(s)), ts) + sh;
  };
  // review3 MUST: an unlocked score is a chain too: keep x if it reaches the value of the slot's
  // continuation (C), else the continuation (his own later games or a bench player, as the policy
  // assigns), drawn from the stream it has as an ordinary slot so the branches stay paired
  const holdValue = (p, rnd, s) => {
    if (p.wLocked != null && rnd() < p.wLocked) return p.x;
    if (!p.cont || p.x >= p.C) return p.x + shift;
    const r2 = rngFrom(streamOf(p.cont) ^ mix(s));
    return (p.cont.kind === "start" ? startValue(p.cont, r2, s, false) : walkPlayer(p.cont, r2, ts)) + shift;
  };
  for (let s = 0; s < sims; s++) {
    let t = team.fixed;
    for (let i = 0; i < nR; i++) {
      const r = team.riders[i];
      const rnd = rngFrom(streams[i] ^ mix(s));
      if (r.kind === "hold") t += holdValue(r, rnd, s);
      else if (r.wLocked != null && rnd() < r.wLocked) t += r.x;
      else t += walkPlayer(r, rnd, ts) + shift;
    }
    for (let j = 0; j < team.slots.length; j++) {
      const p = team.slots[j];
      if (!p) continue;
      const rnd = rngFrom(streams[nR + j] ^ mix(s));
      if (p.kind === "hold") {
        t += holdValue(p, rnd, s);
        continue;
      }
      const liveNow = p.kind === "start" && p.first.xLive;
      if (team.emptyRate && !liveNow && rnd() < team.emptyRate) continue;
      if (p.kind === "start") {
        t += startValue(p, rnd, s, true);
        continue;
      }
      t += walkPlayer(p, rnd, ts) + shift;
    }
    for (let k = 0; k < live.length; k++) {
      const p = live[k];
      const rnd = rngFrom(streams[nRS + k] ^ mix(s));
      const x = Math.max(0, p.xLive.mean + p.xLive.sd * gauss(rnd));
      t += p.games.length ? walkPlayer({ ...p, x }, rnd, ts) + shift : x;
    }
    out[s] = t;
  }
  return out;
}

/**
 * Expected value of a slot entry under the rule: a plain player from scratch (freshValue); a
 * start chain: tonight's game, banked if it beats the value of its pick; a live first game:
 * E[max(X, v)] over its projection (normal, 41 quantiles). Null entry: 0.
 */
export function entryValue(e) {
  if (!e) return 0;
  if (e.kind !== "start") return freshValue(e);
  const v0 = e.pick ? freshValue(e.pick) : 0;
  const f = e.first;
  if (f.xLive) {
    let acc = 0;
    const n = 41;
    for (let i = 0; i < n; i++) {
      const z = normInv((i + 0.5) / n);
      acc += Math.max(Math.max(0, f.xLive.mean + f.xLive.sd * z), v0);
    }
    return acc / n;
  }
  return freshValue(f, v0);
}

/** Inverse standard normal (Acklam's approximation), enough for quadrature. */
function normInv(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(p, 1 - p);
  let x;
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q));
    x = (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
    return p < 0.5 ? x : -x;
  }
  const r = p - 0.5;
  const t = r * r;
  return ((((((a[0] * t + a[1]) * t + a[2]) * t + a[3]) * t + a[4]) * t + a[5]) * r) / (((((b[0] * t + b[1]) * t + b[2]) * t + b[3]) * t + b[4]) * t + 1);
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
export function freshValue(p, v0 = 0) {
  let v = v0;
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
