/**
 * The study's lineup-aware nightly policy (backtest.js `lineupAware`), split into the
 * pieces a live desk needs and the backtest replay reuses:
 *   slotWeight     - value of a player for an unlocked slot just before night d
 *   assignTonight  - pre-tip max-weight assignment, with "try-outs" in slots held for later players
 *   chooseLocks    - post-game lock subset, re-solving the assignment for each subset
 * One-step option-value approximation, not a Monte Carlo over the week (as in the study).
 * Nothing else in lib/lockin may depend on its output: it feeds only the `lean` field.
 */
import { maxWeightAssign } from "./assign.js";
import { MODEL } from "./model.js";

const BIG = 1e4;
const MAX_SUBSET = 10;
const capK = (k) => Math.min(k, MODEL.kMax);

export function eligible(positions, label, usePos = true) {
  return !usePos || label === "UTIL" || (positions || []).includes(label);
}

/**
 * p: { id, positions, games: [{date, plays: true|false|null}], x, inSlot, done }
 * `plays` is known for tonight's game (injury report at the deadline), else null.
 */
export function slotWeight(p, d, modelAt) {
  if (p.done) return -Infinity;
  const i0 = p.games.findIndex((g) => g.date >= d);
  const left = i0 < 0 ? 0 : p.games.length - i0;
  const playsTonight = i0 >= 0 && p.games[i0].date === d && p.games[i0].plays === true;
  if (p.x !== null && p.inSlot) {
    if (left === 0) return p.x;
    const m = modelAt(p.id, d);
    if (playsTonight) return m.r[capK(left)];
    return m.H(capK(left), p.x);
  }
  if (left === 0) return -Infinity;
  const m = modelAt(p.id, d);
  if (playsTonight) return m.r[capK(left)];
  let v = 0;
  for (let k = 1; k <= capK(left); k++) v = m.q.value * m.r[k] + (1 - m.q.value) * v;
  return v;
}

/** Value of holding a score through his next game (index nextIdx), seen at that deadline. */
export function holderHoldValue(p, nextIdx, modelAt) {
  if (nextIdx >= p.games.length) return p.x;
  const left = p.games.length - nextIdx;
  const m = modelAt(p.id, p.games[nextIdx].date);
  if (p.games[nextIdx].plays === false) return Math.max(0, m.H(capK(left - 1), 0));
  return m.r[capK(left)];
}

/**
 * Pre-tip assignment for night d. openLabels: labels of unlocked slots.
 * Returns { assigned: Map id->slotIdx, tonight: Map id->slotIdx (in a slot and playing),
 *           displaced: ids of riders who lose their slot }.
 */
export function assignTonight({ openLabels, cand, d, modelAt, playsOn, usePos = true }) {
  const W = openLabels.map((l) =>
    cand.map((p) => (eligible(p.positions, l, usePos) ? slotWeight(p, d, modelAt) : -Infinity)),
  );
  const A = maxWeightAssign(W);
  const assigned = new Map();
  A.assign.forEach((j, i) => {
    if (j >= 0) assigned.set(cand[j].id, i);
  });
  const displaced = cand.filter((p) => p.inSlot && !assigned.has(p.id)).map((p) => p.id);
  const tonight = new Map();
  for (const [id, i] of assigned) if (playsOn(cand.find((c) => c.id === id), d)) tonight.set(id, i);
  const free = openLabels
    .map((_, i) => i)
    .filter((i) => {
      const j = A.assign[i];
      if (j < 0) return true;
      const p = cand[j];
      return !playsOn(p, d) && !(p.inSlot && p.x !== null);
    });
  const extras = cand
    .filter((p) => playsOn(p, d) && !assigned.has(p.id))
    .map((p) => ({ p, w: slotWeight(p.inSlot ? { ...p, inSlot: false, x: null } : p, d, modelAt) }))
    .sort((a, b) => b.w - a.w);
  for (const { p } of extras) {
    const k = free.findIndex((i) => eligible(p.positions, openLabels[i], usePos));
    if (k >= 0) {
      tonight.set(p.id, free[k]);
      free.splice(k, 1);
    }
  }
  return { assigned, tonight, displaced };
}

/**
 * Post-game lock subset. holders: players in a slot holding x who may lock now, each
 * with `holdW` (value of not locking). others: everyone else still eligible, weighed
 * at night dn. Returns the best mask and, per holder, the best weekly value with and
 * without locking him (delta > 0 means the policy locks).
 */
export function chooseLocks({ openLabels, holders, others, dn, modelAt, usePos = true }) {
  const n = Math.min(holders.length, MAX_SUBSET);
  const P = holders.slice(0, n);
  const ppl = [...P, ...others];
  const otherW = others.map((p) => slotWeight(p, dn, modelAt));
  let best = { val: -Infinity, mask: 0 };
  const withJ = new Array(n).fill(-Infinity);
  const withoutJ = new Array(n).fill(-Infinity);
  for (let mask = 0; mask < 1 << n; mask++) {
    const Wm = openLabels.map((l) =>
      ppl.map((p, j) => {
        if (!eligible(p.positions, l, usePos)) return -Infinity;
        if (j < n) return (mask >> j) & 1 ? p.x + BIG : p.holdW;
        return otherW[j - n];
      }),
    );
    const a = maxWeightAssign(Wm);
    const lockedN = P.filter((_, j) => (mask >> j) & 1).length;
    const cnt = a.assign.filter((j) => j >= 0 && j < n && (mask >> j) & 1).length;
    if (cnt < lockedN) continue; // a locked player must fit a slot
    const val = a.value - BIG * lockedN;
    if (val > best.val + 1e-9) best = { val, mask };
    for (let j = 0; j < n; j++) {
      if ((mask >> j) & 1) withJ[j] = Math.max(withJ[j], val);
      else withoutJ[j] = Math.max(withoutJ[j], val);
    }
  }
  const perHolder = P.map((p, j) => ({
    id: p.id,
    locks: ((best.mask >> j) & 1) === 1,
    valueIfLock: Number.isFinite(withJ[j]) ? withJ[j] : null,
    valueIfHold: Number.isFinite(withoutJ[j]) ? withoutJ[j] : null,
  }));
  return { mask: best.mask, value: best.val, perHolder, truncated: holders.length > n };
}

/** The open slot a lock goes into: first eligible, position slots before UTIL (as the study). */
export function pickLockSlot(slots, positions, usePos = true) {
  const order = slots
    .map((_, i) => i)
    .filter((i) => !slots[i].locked && eligible(positions, slots[i].label, usePos))
    .sort((a, b) => Number(slots[a].label === "UTIL") - Number(slots[b].label === "UTIL"));
  return order.length ? order[0] : -1;
}
