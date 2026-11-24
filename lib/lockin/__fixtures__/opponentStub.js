/**
 * LOCAL STUB of the opponent / win-probability contract (branch lockin-opponent), for
 * UI tests and the dev-only fixture preview until the engine's own fixture lands.
 * Every value here is invented; nothing in production imports this file (lib/lockin/
 * source.js loads it only with LOCKIN_OPPONENT_STUB=1 outside production). Delete it
 * once the engine commit is merged.
 *
 * withOpponentStub(desk) -> a copy of a fixture WeekDesk with: opponent (+ profile,
 * intent), winProb, whatIf, history (+ profile, byWeek), and per card lean.winProb*,
 * profile, availability and decision.action / deadline / waitTriggers.
 */

const r1 = (x) => Math.round(x * 10) / 10;
const q = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))] : null);

// Listed fixture tip: date + 1 day at 00:30Z (7:30 PM EST); PHX 00:00Z, UTA 01:00Z, DAL 02:30Z (lib/lockin/fixture.js).
const TIP_OFFSET = { PHX: 0, UTA: 60, DAL: 150 };
function tipIso(date, team) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return new Date(Date.parse(`${d.toISOString().slice(0, 10)}T00:00:00Z`) + (TIP_OFFSET[team] ?? 30) * 60000).toISOString();
}

export const STUB_OPPONENT = Object.freeze({
  rosterId: 2,
  teamName: "Glass Cleaners",
  ownerName: "sample_owner",
  avatar: null,
  record: "8-3",
  bankedTotal: 150,
  slots: [
    { index: 0, label: "PG", playerId: "op01", name: "Rory Vance", banked: 38.5, lockState: "locked", lockCertain: true },
    { index: 1, label: "SG", playerId: "op02", name: "Teo Marchetti-Ballard", banked: 33, lockState: "unknown_until_next_tip", lockCertain: false },
    { index: 2, label: "SF", playerId: "op03", name: "Sid Okoro", banked: 0, lockState: "reset", lockCertain: true },
    { index: 3, label: "PF", playerId: "op04", name: "Wes Lindgren", banked: 27.5, lockState: "final", lockCertain: true },
    { index: 4, label: "C", playerId: "op05", name: "Abe Kowalczyk", banked: 29, lockState: "unknown_until_next_tip", lockCertain: false },
    { index: 5, label: "UTIL", playerId: null, name: null, banked: null, lockState: null, lockCertain: false },
    { index: 6, label: "UTIL", playerId: "op07", name: "Nico Brandvold", banked: 22, lockState: "unknown_until_next_tip", lockCertain: false },
  ],
  playersStillToPlay: 5,
  gamesRemaining: 9,
  projectedTotal: { mean: 196.8, p10: 178.1, p90: 216.0 },
  profile: {
    lockTiming: { earlyShare: 0.61, cutoffDay: "Thu", league: 0.48 },
    lockThreshold: { median: 31.5, vsForecast: 1.14, league: 1.06 },
    emptySlotRate: { value: 0.04, league: 0.05 },
    zeroRate: { value: 0.07, league: 0.09 },
    benchUse: { value: 0.31, league: 0.27 },
    weeks: 32,
    shrinkage: 0.22,
    halfLifeWeeks: 8,
    seasons: [
      { season: "2026", weeks: 9, weight: 0.58 },
      { season: "2025", weeks: 23, weight: 0.42 },
    ],
  },
  intent: { label: "contending", confidence: "moderate", confidenceScore: 0.66, evidence: ["8-3", "inside the playoff line", "added production last week"] },
});

export const STUB_WIN = Object.freeze({
  now: 0.62,
  sims: 4000,
  mine: { mean: 205.3, p10: 186.0, p90: 224.5 },
  theirs: { mean: 196.8, p10: 178.1, p90: 216.0 },
  unknownLockWeight: 0.58,
  assumptions: [
    "Each remaining game is drawn from that player's own next-game forecast.",
    "Your lineup follows the model's calls for the rest of the week.",
    "Their open slots are filled the way they have filled them in past weeks.",
  ],
});

export const STUB_HISTORY = Object.freeze({
  weeks: 12,
  leftOnTablePerWeek: 14.2,
  lockedEarlyPerWeek: 6.1,
  heldTooLongPerWeek: 8.1,
  n: 12,
  byWeek: [
    { season: "2026", week: 1, leftOnTable: 9.5, lockedEarly: 4, heldTooLong: 5.5 },
    { season: "2026", week: 2, leftOnTable: 21, lockedEarly: 12.5, heldTooLong: 8.5 },
    { season: "2026", week: 3, leftOnTable: 11.5, lockedEarly: 2, heldTooLong: 9.5 },
  ],
  profile: {
    lockTiming: { earlyShare: 0.42, cutoffDay: "Thu", league: 0.48 },
    lockThreshold: { median: 28, vsForecast: 1.02, league: 1.06 },
    emptySlotRate: { value: 0.02, league: 0.05 },
    zeroRate: { value: 0.11, league: 0.09 },
    benchUse: { value: 0.35, league: 0.27 },
    weeks: 26,
    shrinkage: 0.3,
    halfLifeWeeks: 8,
    seasons: [
      { season: "2026", weeks: 3, weight: 0.35 },
      { season: "2025", weeks: 23, weight: 0.65 },
    ],
  },
});

// per card: [winProbIfLock, winProbIfHold, pointsLean, action]
const CARD_STUB = {
  lk02: [0.66, 0.61, "hold", "wait"],
  lk03: [0.68, 0.55, "lock", "lock_now"],
  lk06: [0.65, 0.6, "lock", "lock_now"],
};

function profileFor(card) {
  const s = card.forecast?.shape || [];
  if (s.length < 5) return null;
  const p50 = q(s, 0.5);
  const boomThreshold = Math.round(p50 * 1.35);
  const bustThreshold = Math.round(p50 * 0.6);
  return {
    p10: q(s, 0.1),
    p50,
    p90: q(s, 0.9),
    boomRate: Math.round((s.filter((v) => v >= boomThreshold).length / s.length) * 1000) / 1000,
    bustRate: Math.round((s.filter((v) => v < bustThreshold).length / s.length) * 1000) / 1000,
    boomThreshold,
    bustThreshold,
    n: s.length,
  };
}

function availabilityFor(card) {
  const left = (card.weekGames || []).filter((g) => g.status === "pre_game" || g.status === "postponed");
  if (!left.length || !card.forecast) return null;
  const base = card.forecast.playProbability?.value ?? 0.9;
  const out = /^out$/i.test(card.injury?.status || "");
  const doubtful = /^doubtful$/i.test(card.injury?.status || "");
  const perGame = left.map((g, i) => ({ date: g.date, pPlay: Math.round(Math.max(0, i === 0 && out ? 0 : i === 0 && doubtful ? 0.25 : base - 0.04 * i) * 1000) / 1000 }));
  const pAll = Math.round(perGame.reduce((p, g) => p * g.pPlay, 1) * 1000) / 1000;
  return { perGame, pAll, n: card.forecast.playProbability?.nRows ?? 0, basis: "recent games, back-to-backs and the injury listing" };
}

/** A copy of `desk` with the stubbed opponent contract. Non-board desks pass through. */
export function withOpponentStub(desk) {
  if (!desk || desk.status !== "in_season") return desk;
  const d = structuredClone(desk);
  d.opponent = structuredClone(STUB_OPPONENT);
  d.winProb = structuredClone(STUB_WIN);
  d.history = structuredClone(STUB_HISTORY);
  const options = [];
  for (const c of d.cards) {
    c.profile = profileFor(c);
    c.availability = availabilityFor(c);
    const s = CARD_STUB[c.playerId];
    if (s && c.lean?.value !== "none") {
      const [lock, hold, pointsLean, action] = s;
      c.lean.value = lock >= hold ? "lock" : "hold";
      c.lean.winProbIfLock = lock;
      c.lean.winProbIfHold = hold;
      c.lean.leanBasis = "win_probability";
      c.lean.pointsLean = pointsLean;
      c.lean.disagrees = pointsLean !== c.lean.value;
      const next = c.nextGame;
      c.decision.action = action;
      c.decision.deadline = next ? tipIso(next.date, c.team) : null;
      c.decision.deadlineReason = next ? "his next game" : null;
      c.decision.waitTriggers =
        action === "wait"
          ? [
              { kind: "injury_listing", text: `Lock if he is listed GTD or worse for ${next?.day ?? "his next game"}`, threshold: "GTD" },
              { kind: "opponent_lead", text: "Lock if your opponent's lead passes 25", threshold: 25 },
            ]
          : [];
      const base = STUB_WIN.now;
      options.push({ id: `lock-${c.playerId}`, kind: "lock", playerId: c.playerId, slotLabel: c.slotLabel, winProb: lock, delta: Math.round((lock - base) * 100), pointsMean: r1(c.stopping?.x ?? 0), text: `Lock ${c.name}'s ${(c.stopping?.x ?? 0).toFixed(1)}` });
      options.push({ id: `hold-${c.playerId}`, kind: "hold", playerId: c.playerId, slotLabel: c.slotLabel, winProb: hold, delta: Math.round((hold - base) * 100), pointsMean: r1(c.stopping?.expectedIfHeld ?? 0), text: `Hold ${c.name} for a later game`, noise: Math.abs(hold - base) < 0.015 });
    } else if (c.lean) {
      c.lean.winProbIfLock = null;
      c.lean.winProbIfHold = null;
      c.lean.leanBasis = "points";
      c.lean.pointsLean = c.lean.value;
      c.lean.disagrees = false;
    }
  }
  const brandt = d.cards.find((c) => c.playerId === "lk05");
  const pruitt = d.cards.find((c) => c.playerId === "lk08");
  if (brandt?.nextGame && pruitt) {
    options.push({ id: "swap-lk08-lk05", kind: "swap_in", playerId: "lk08", forPlayerId: "lk05", slotLabel: "C", deadline: tipIso(brandt.nextGame.date, "PHX"), winProb: 0.625, delta: 0, pointsMean: 19.4, text: `Swap ${pruitt.name} in for ${brandt.name}`, noise: true });
  }
  d.whatIf = {
    baseline: STUB_WIN.now,
    options,
    plan: { winProb: 0.74, delta: 12, actions: options.filter((o) => o.kind === "lock" && o.playerId !== "lk02").map((o) => o.id) },
  };
  return d;
}
