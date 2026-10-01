/**
 * Draft recap — measurements of a completed rookie draft.
 *
 * What this computes. For each pick, `value` is the drafted player's current
 * dynasty value and `cost` is what the model said that pick slot was worth
 * immediately before the draft. Both numbers are on the same model scale, so
 * `surplus = value - cost` reads as "value today minus what the slot cost on
 * draft night". `classRank` orders the class by current value (1 = most
 * valuable), and `slotDelta = pickNo - classRank` says how far a player's
 * selection position sits from his value rank: positive means he was taken
 * later than his value rank, negative means earlier.
 *
 * What it is not. These are measurements of the room's ordering against the
 * model and the market at one moment. They are not a verdict on anyone's
 * judgment: a drafter may have had information, roster needs, or a time
 * horizon the model does not see, and no letter grades or "best/worst" labels
 * are produced here (house rule D6). `bestPick` on a team is simply the pick
 * with the largest measured surplus, nothing more.
 *
 * It moves. `value` is today's number, so every surplus, class rank, and
 * slot delta changes as player values change. `cost` is fixed to draft night.
 * A recap run next season will differ from one run today on the same draft.
 *
 * Missing data. A player with no value is treated as 0 and flagged
 * `unpriced: true`; a slot with no cost is treated as 0 and flagged
 * `costUnpriced: true`. Unpriced players rank after every priced player and
 * are left out of `biggestFallers` / `biggestReaches`, because their slot
 * delta reflects missing data rather than the room's ordering. All ties are
 * broken by pickNo (earlier pick first).
 *
 * Pure: no I/O, no clock, no mutation of inputs.
 */

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

const byPickNo = (a, b) => a.pickNo - b.pickNo;

/**
 * @param {{
 *   picks: Array<{pickNo:number, round:number, draftSlot:number, rosterId:any,
 *                 playerId:any, playerName:string, position:string, team:string}>,
 *   valueOf: (playerId:any) => number|null,
 *   slotCost: (pickNo:number) => number|null,
 *   marketRankOf?: (playerId:any) => number|null,
 *   nameOfRoster?: (rosterId:any) => string,
 * }} input
 */
export function recapDraft({ picks, valueOf, slotCost, marketRankOf, nameOfRoster }) {
  const list = Array.isArray(picks) ? [...picks].sort(byPickNo) : [];

  const priced = list.map((p) => {
    const v = num(valueOf ? valueOf(p.playerId) : null);
    const c = num(slotCost ? slotCost(p.pickNo) : null);
    const out = { ...p, value: v ?? 0, cost: c ?? 0 };
    out.surplus = out.value - out.cost;
    if (v === null) out.unpriced = true;
    if (c === null) out.costUnpriced = true;
    if (marketRankOf) out.marketRank = num(marketRankOf(p.playerId));
    return out;
  });

  // Class rank: priced players by value DESC, then unpriced; ties by pickNo.
  const ranked = [...priced].sort((a, b) => {
    const ua = a.unpriced ? 1 : 0;
    const ub = b.unpriced ? 1 : 0;
    if (ua !== ub) return ua - ub;
    if (b.value !== a.value) return b.value - a.value;
    return a.pickNo - b.pickNo;
  });
  ranked.forEach((p, i) => {
    p.classRank = i + 1;
    p.slotDelta = p.pickNo - p.classRank;
  });

  // Teams.
  const teamMap = new Map();
  for (const p of priced) {
    let t = teamMap.get(p.rosterId);
    if (!t) {
      t = {
        rosterId: p.rosterId,
        name: nameOfRoster ? nameOfRoster(p.rosterId) : String(p.rosterId),
        count: 0,
        firsts: 0,
        valueAdded: 0,
        cost: 0,
        surplus: 0,
        bestPick: null,
        picks: [],
      };
      teamMap.set(p.rosterId, t);
    }
    t.count += 1;
    if (p.round === 1) t.firsts += 1;
    t.valueAdded += p.value;
    t.cost += p.cost;
    t.picks.push(p);
  }
  const teams = [...teamMap.values()];
  for (const t of teams) {
    t.surplus = t.valueAdded - t.cost;
    const candidates = t.picks.filter((p) => !p.unpriced);
    for (const p of candidates) {
      if (!t.bestPick || p.surplus > t.bestPick.surplus) t.bestPick = p;
    }
  }
  teams.sort((a, b) => b.valueAdded - a.valueAdded || a.picks[0].pickNo - b.picks[0].pickNo);

  const classTotals = priced.reduce(
    (acc, p) => ({ value: acc.value + p.value, cost: acc.cost + p.cost }),
    { value: 0, cost: 0 },
  );

  const measurable = priced.filter((p) => !p.unpriced);
  const biggestFallers = measurable
    .filter((p) => p.slotDelta > 0)
    .sort((a, b) => b.slotDelta - a.slotDelta || a.pickNo - b.pickNo)
    .slice(0, 3);
  const biggestReaches = measurable
    .filter((p) => p.slotDelta < 0)
    .sort((a, b) => a.slotDelta - b.slotDelta || a.pickNo - b.pickNo)
    .slice(0, 3);

  const result = { picks: priced, teams, classTotals, biggestFallers, biggestReaches };
  if (marketRankOf) result.marketAgreement = marketAgreement(list, marketRankOf);
  return result;
}

/** Average ranks (1-based) with ties sharing the mean of their positions. */
export function averageRanks(xs) {
  const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

/**
 * Spearman rank correlation between draft order (pickNo) and market rank,
 * over picks whose market rank exists. Computed as Pearson correlation of
 * average ranks, so ties are handled correctly. rho = 1 means the room drafted
 * in exactly the market's order; rho is null when n < 2 or either side has no
 * variation.
 *
 * @returns {{ rho: number|null, n: number }}
 */
export function marketAgreement(picks, marketRankOf) {
  const pairs = [];
  for (const p of picks || []) {
    const m = num(marketRankOf ? marketRankOf(p.playerId) : null);
    if (m !== null && num(p.pickNo) !== null) pairs.push([p.pickNo, m]);
  }
  const n = pairs.length;
  if (n < 2) return { rho: null, n };
  const rx = averageRanks(pairs.map((q) => q[0]));
  const ry = averageRanks(pairs.map((q) => q[1]));
  const mean = (n + 1) / 2;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = rx[i] - mean;
    const dy = ry[i] - mean;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { rho: null, n };
  return { rho: sxy / Math.sqrt(sxx * syy), n };
}
