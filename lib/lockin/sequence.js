/**
 * Tonight's sequencing: with more playable players than slots, the earlier tip goes in
 * the slot first because his line is information; a later player can still replace him,
 * an earlier player can never replace a later one (a bench player must be in the lineup
 * before his own game, Sleeper docs). This module turns that into plain data: who to
 * start at each tip, and for each later bench player a swap threshold.
 *
 * Model, per slot and pair (early E in the slot, later L on the bench), at L's tip:
 *   KEEP E:  E[max(Y_E, C)]   Y_E = E's final given his line by then
 *   SWAP L:  E[max(Z_L, C)]   Z_L = L's forecast tonight
 *   C = value of the slot after tonight = max of both players' later-game values (policy.slotWeight)
 * Swap iff KEEP < SWAP; the threshold S is the E projection at which they are equal.
 * Two-player approximation: other slots are held fixed. Y_E's spread at L's tip is the
 * pre-game SD x sqrt(share of E's game left), measured to cover ~83% for a nominal 80%
 * band at quarter marks (ingame.js INGAME_RECORD).
 */
import { slotWeight, eligible } from "./policy.js";
import { holdValue, MODEL } from "./model.js";
import { projectFinal, usualMinutes, gameFractionLeft } from "./ingame.js";
import { tipLabel, indexTips, proxyTipsFromLogs } from "./tipTimes.js";

export const SEQ = Object.freeze({
  gameWallMinutes: 140, // tip to final horn, assumed; not measured here
  finalAfterMinutes: 150, // treat E's game as final by L's tip when L tips this long after E
  minGain: 0.1,
});

const SQRT2 = Math.SQRT2;
function erf(x) {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
const Phi = (z) => 0.5 * (1 + erf(z / SQRT2));
const phi = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

/** E[max(Y, c)] for Y ~ Normal(m, s). */
export function expMaxNormal(m, s, c) {
  if (!(s > 1e-9)) return Math.max(m, c);
  const d = (m - c) / s;
  return c + (m - c) * Phi(d) + s * phi(d);
}

/** E[max(Y, c)] over an empirical sample. */
export function expMaxSample(sample, c) {
  return sample.reduce((t, y) => t + Math.max(y, c), 0) / sample.length;
}

/** Share of E's game left when L tips; 0 once L tips 150+ minutes after E. */
export function shareLeftAt(tipEarlyMs, tipLateMs) {
  if (tipEarlyMs == null || tipLateMs == null) return null;
  const elapsed = (tipLateMs - tipEarlyMs) / 60000;
  if (elapsed >= SEQ.finalAfterMinutes) return 0;
  if (elapsed <= 0) return 1;
  return Math.min(1, Math.max(0.05, 1 - elapsed / SEQ.gameWallMinutes));
}

/**
 * The swap decision for one pair. early: { mean, sd } (tonight's forecast; or a live
 * projection), late: { sample }, C: slot value after tonight, shareLeft: E's game left at L's tip.
 * Returns the threshold on E's projected final, both branch values, and the value of
 * putting E in first (plan) over choosing now without his line.
 */
export function swapAnalysis({ early, late, C, shareLeft }) {
  const f = shareLeft ?? 1;
  const swap = expMaxSample(late.sample, C);
  const sdCond = early.sd * Math.sqrt(f);
  const keepAt = (m) => expMaxNormal(m, sdCond, C);
  let lo = -60;
  let hi = 200;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (keepAt(mid) < swap) lo = mid;
    else hi = mid;
  }
  const threshold = (lo + hi) / 2;
  // preposterior of E's projection at L's tip: Normal(mean, sd*sqrt(1-f)), on a fixed grid
  const grid = [-1.75, -1.25, -0.85, -0.5, -0.17, 0.17, 0.5, 0.85, 1.25, 1.75];
  const spread = early.sd * Math.sqrt(1 - f);
  let plan = 0;
  let keepOnly = 0;
  for (const z of grid) {
    const k = keepAt(early.mean + z * spread);
    plan += Math.max(k, swap);
    keepOnly += k;
  }
  plan /= grid.length;
  keepOnly /= grid.length;
  return { threshold, swapValue: swap, keepValue: keepOnly, planValue: plan, valueOfInformation: plan - Math.max(keepOnly, swap), shareLeft: f };
}

/**
 * Build the `tonight` block. Inputs are the desk's per-player facts (see index.js hook):
 * players: [{ id, name, positions, slotIndex|null, slotLabel|null, lockState, holding (x|null),
 *   game: { gameId, date, status, tipMs, tipSource, row, scheduleGame } | null,  // tonight's game
 *   gamesAfter: [{ date }], log, model (playerModel before tonight), injuryOut }]
 * slots: [{ index, label, playerId, locked }]
 */
export function buildTonight({ today, nowMs, players, slots, modelAt }) {
  const playing = players.filter((p) => p.game && p.lockState !== "locked");
  if (!playing.length) return { date: today, status: "no_games", tips: [], timeline: [], players: [], notes: [] };
  const byId = new Map(players.map((p) => [p.id, p]));
  const tipsKnown = playing.every((p) => p.game.tipMs != null);

  // after-tonight value of each player for a slot (fresh, q-discounted)
  const after = new Map();
  for (const p of players) {
    if (!p.gamesAfter?.length) {
      after.set(p.id, 0);
      continue;
    }
    const v = slotWeight({ id: p.id, positions: p.positions, games: p.gamesAfter.map((g) => ({ date: g.date, plays: null })), x: null, inSlot: false, done: false }, p.gamesAfter[0].date, modelAt);
    after.set(p.id, Number.isFinite(v) ? v : 0);
  }

  // tonight facts per player
  const facts = new Map();
  for (const p of playing) {
    const m = p.model;
    const g = p.game;
    const shareLeft = g.status === "complete" ? 0 : g.status === "in_game" ? gameFractionLeft(g.scheduleGame) : 1;
    const usual = usualMinutes(p.log, today);
    const partial = g.row && (g.status === "in_game" || g.status === "complete") ? { fpSoFar: g.row.fp, minutesSoFar: r1(g.row.sp / 60), secondsSoFar: g.row.sp } : null;
    let projection = null;
    if (g.status === "complete" && partial) projection = { mean: partial.fpSoFar, p10: partial.fpSoFar, p90: partial.fpSoFar, sd: 0, final: true };
    else if (g.status === "in_game" && partial && m) {
      const pr = projectFinal({ fpSoFar: partial.fpSoFar, secondsSoFar: partial.secondsSoFar, gameFractionLeft: shareLeft, pregameMean: m.dist.mean, pregameSd: m.dist.sd, usualMinutes: usual.minutes, priorMinutes: Infinity });
      if (pr) projection = { ...pr, final: false, clockKnown: shareLeft != null };
    }
    const kAfter = p.gamesAfter?.length ?? 0;
    const lockThreshold = m && kAfter >= 1 ? holdValue(m, kAfter, true) : null;
    facts.set(p.id, { p, m, g, shareLeft, usual, partial, projection, lockThreshold, kAfter });
  }

  const openSlots = slots.filter((s) => !s.locked);
  const occupantKind = (s) => {
    if (!s.playerId) return "empty";
    const o = byId.get(s.playerId);
    if (facts.has(s.playerId)) return "playing";
    if (o && o.holding != null && o.holding > 0) return "holding";
    return "idle";
  };
  const earlyView = (f) => (f.projection ? { mean: f.projection.mean, sd: f.projection.sd ?? 0 } : { mean: f.m.dist.mean, sd: f.m.dist.sd });
  const timeline = [];
  const used = new Set(slots.map((s) => s.playerId).filter(Boolean));
  const when = (ms, id) => ({ at: ms != null ? new Date(ms).toISOString() : null, atText: ms != null ? tipLabel(ms) : `before ${byId.get(id)?.name ?? id}'s game` });

  // 1. lock or hold for holders who play tonight: before their tip
  for (const f of facts.values()) {
    const p = f.p;
    if (p.holding == null || f.g.status !== "pre_game" || !f.m) continue;
    const k = 1 + f.kAfter;
    timeline.push({
      kind: "lock_or_hold",
      ...when(f.g.tipMs, p.id),
      sortMs: f.g.tipMs,
      playerId: p.id,
      slotLabel: p.slotLabel,
      text: `Lock ${r1(p.holding)} or hold it, before his tip`,
      inputs: { x: p.holding, k, expectedIfHeld: r1(holdValue(f.m, k, !p.injuryOut)), n: f.m.dist.n },
    });
  }

  // 2. slot plans: an earlier bench player first, or a try-out in an idle slot
  const bench = [...facts.values()].filter((f) => f.p.slotIndex == null);
  for (const s of openSlots) {
    const kind = occupantKind(s);
    if (kind === "holding") continue;
    const occ = s.playerId ? facts.get(s.playerId) : null;
    const cands = bench.filter((f) => !used.has(f.p.id) && eligible(f.p.positions, s.label) && f.g.status === "pre_game" && f.m);
    if (kind === "playing" && occ && occ.m && occ.g.status === "pre_game") {
      // E-first: a bench player tipping earlier than the occupant
      let best = null;
      for (const e of cands) {
        if (e.g.tipMs == null || occ.g.tipMs == null || e.g.tipMs >= occ.g.tipMs) continue;
        const C = Math.max(after.get(e.p.id), after.get(occ.p.id));
        const a = swapAnalysis({ early: earlyView(e), late: { sample: occ.m.dist.sample }, C, shareLeft: shareLeftAt(e.g.tipMs, occ.g.tipMs) });
        const gain = a.planValue - a.swapValue;
        if (gain > SEQ.minGain && (!best || gain > best.gain)) best = { e, a, gain };
      }
      if (best) {
        used.add(best.e.p.id);
        timeline.push(startItem(s, best.e, occ, best.a, best.gain, when, byId));
      }
    } else if (kind === "idle" || kind === "empty") {
      const sorted = cands.filter((c) => c.g.tipMs != null || !tipsKnown).sort((a, b) => (a.g.tipMs ?? 0) - (b.g.tipMs ?? 0));
      const first = sorted[0];
      if (!first) continue;
      const Cidle = Math.max(after.get(first.p.id), s.playerId ? after.get(s.playerId) ?? 0 : 0);
      const tryGain = expMaxSample(first.m.dist.sample, Cidle) - Cidle;
      if (tryGain <= SEQ.minGain) continue;
      used.add(first.p.id);
      timeline.push({
        kind: "start",
        ...when(first.g.tipMs, first.p.id),
        sortMs: first.g.tipMs,
        playerId: first.p.id,
        slotLabel: s.label,
        replacesPlayerId: s.playerId,
        text: s.playerId
          ? `Start ${first.p.name} in ${s.label} for his game; ${byId.get(s.playerId)?.name ?? s.playerId} has no game tonight and keeps his later games`
          : `Start ${first.p.name} in the empty ${s.label} slot for his game`,
        inputs: { reason: "try_out", gain: r1(tryGain), slotValueAfterTonight: r1(Cidle), forecastMean: r1(first.m.dist.mean), n: first.m.dist.n },
      });
    }
  }

  // 3. swap checks: each later bench player against earlier occupants playing tonight
  for (const b of bench) {
    if (used.has(b.p.id) || b.g.status !== "pre_game" || !b.m) continue;
    const options = [];
    for (const s of openSlots) {
      const occId = timeline.find((t) => t.kind === "start" && t.slotLabel === s.label && t.inputs?.reason === "earlier_tip_first")?.playerId ?? s.playerId;
      const x = occId ? facts.get(occId) : null;
      if (!x || !x.m || !eligible(b.p.positions, s.label)) continue;
      if (x.g.tipMs != null && b.g.tipMs != null && x.g.tipMs >= b.g.tipMs) continue;
      if (x.g.tipMs == null || b.g.tipMs == null) continue;
      const C = Math.max(after.get(x.p.id), after.get(b.p.id));
      const shareLeft = x.g.status === "complete" ? 0 : x.g.status === "in_game" && x.shareLeft != null ? x.shareLeft : shareLeftAt(x.g.tipMs, b.g.tipMs);
      const a = swapAnalysis({ early: earlyView(x), late: { sample: b.m.dist.sample }, C, shareLeft });
      options.push({ s, x, a });
    }
    // closest to his threshold first: the swap most likely to be called
    options.sort((u, v) => earlyView(u.x).mean - u.a.threshold - (earlyView(v.x).mean - v.a.threshold));
    for (const { s, x, a } of options.slice(0, 2)) {
      const final = a.shareLeft === 0;
      const live = x.projection && !x.projection.final ? x.projection : null;
      timeline.push({
        kind: "swap_check",
        ...when(b.g.tipMs, b.p.id),
        sortMs: b.g.tipMs,
        playerId: b.p.id,
        forPlayerId: x.p.id,
        slotLabel: s.label,
        text: `Before ${b.p.name}'s tip: swap him in for ${x.p.name} if ${x.p.name} ${final ? "finished" : "is on pace for"} below ${r1(a.threshold)}`,
        inputs: {
          threshold: r1(a.threshold),
          on: final ? "final" : "projected_final",
          swapValue: r1(a.swapValue),
          keepValue: r1(a.keepValue),
          valueOfInformation: r1(a.valueOfInformation),
          slotValueAfterTonight: r1(Math.max(after.get(x.p.id), after.get(b.p.id))),
          shareOfEarlyGameLeft: r1(a.shareLeft),
          requiresInGameSwap: !final,
          now: live ? { projectedFinal: r1(live.mean), band: [r1(live.p10), r1(live.p90)], below: live.mean < a.threshold, clockKnown: live.clockKnown } : x.projection?.final ? { final: x.projection.mean, below: x.projection.mean < a.threshold } : null,
          n: { early: x.m.dist.n, late: b.m.dist.n },
        },
      });
    }
  }

  // 4. after each game: lock threshold for tonight's starters with later games
  for (const f of facts.values()) {
    if (f.p.slotIndex == null && !timeline.some((t) => t.kind === "start" && t.playerId === f.p.id)) continue;
    if (f.lockThreshold == null || f.g.status === "complete") continue;
    const endMs = f.g.tipMs != null ? f.g.tipMs + SEQ.gameWallMinutes * 60000 : null;
    timeline.push({
      kind: "after_game",
      at: endMs != null ? new Date(endMs).toISOString() : null,
      atText: "after his game, before his next one",
      sortMs: endMs,
      playerId: f.p.id,
      text: `After his game: ${r1(f.lockThreshold)} expected if held, ${f.kAfter} game${f.kAfter === 1 ? "" : "s"} left after tonight`,
      inputs: { expectedIfHeld: r1(f.lockThreshold), gamesAfter: f.kAfter, n: f.m.dist.n },
    });
  }

  timeline.sort((a, b) => (a.sortMs ?? Infinity) - (b.sortMs ?? Infinity) || order(a.kind) - order(b.kind));
  timeline.forEach((t, i) => {
    t.order = i + 1;
    t.passed = t.sortMs != null && nowMs != null && t.sortMs <= nowMs;
    delete t.sortMs;
  });

  const tips = [...new Set(playing.map((p) => p.game.tipMs).filter((x) => x != null))].sort((a, b) => a - b).map((ms) => ({ at: new Date(ms).toISOString(), atText: tipLabel(ms), playerIds: playing.filter((p) => p.game.tipMs === ms).map((p) => p.id) }));
  return {
    date: today,
    status: "games",
    tipsKnown,
    tipSource: [...new Set(playing.map((p) => p.game.tipSource).filter(Boolean))],
    tips,
    timeline,
    players: [...facts.values()].map((f) => ({
      playerId: f.p.id,
      slotLabel: f.p.slotLabel,
      tip: f.g.tipMs != null ? new Date(f.g.tipMs).toISOString() : null,
      tipText: tipLabel(f.g.tipMs),
      status: f.g.status,
      line: f.partial ? { fpSoFar: f.partial.fpSoFar, minutesSoFar: f.partial.minutesSoFar, usualMinutes: r1(f.usual.minutes), usualMinutesN: f.usual.n } : null,
      projection: f.projection && !f.projection.final ? { mean: r1(f.projection.mean), p10: r1(f.projection.p10), p90: r1(f.projection.p90), clockKnown: f.projection.clockKnown } : null,
      forecast: f.m ? { mean: r1(f.m.dist.mean), sd: r1(f.m.dist.sd), n: f.m.dist.n } : null,
      expectedIfHeldAfterTonight: r1(f.lockThreshold),
    })),
    notes: [],
    kMax: MODEL.kMax,
  };
}

const OUT_RE = /^(out|suspension|suspended|inactive)$/i;

/**
 * Adapter from buildBoard's locals (index.js): P (per-player facts), info (classification),
 * the desk's slots, the model cache. Tip times: Sleeper scores feed, else the log-row proxy.
 */
export function tonightFromBoard({ L, P, info, slots, modelFor, nowMs }) {
  const today = L.today;
  const S = L.scheduleIdx;
  let tips = indexTips(L.tipsRaw, S);
  const notes = [];
  if (!L.tipsRaw) {
    tips = proxyTipsFromLogs([...P.values()].flatMap((p) => p.log), S);
    notes.push(tips.size ? "Tip times from the log-row proxy (scheduled tip, future games only); the scores feed did not load." : "Tip times unknown; the scores feed did not load and no proxy was available.");
  }
  const players = [...info.values()].map((v) => {
    const p = v.p;
    const g = p.weekGames.find((x) => x.date === today && x.status !== "postponed" && x.status !== "canceled") || null;
    const tip = g ? tips.get(g.gameId) : null;
    const st = v.slot?.ls;
    const holding = v.kind === "lock_or_hold" ? v.x : st?.reason === "final_game_score_stands" ? v.slot.banked : null;
    return {
      id: p.pid,
      name: p.who?.name ?? `Player ${p.pid}`,
      positions: p.who?.positions || [],
      slotIndex: v.slot ? v.slot.index : null,
      slotLabel: v.slot ? v.slot.label : null,
      lockState: st?.state ?? null,
      holding,
      game: g ? { gameId: g.gameId, date: g.date, status: g.status, tipMs: tip?.startMs ?? null, tipSource: tip?.source ?? null, row: g.row, scheduleGame: S.games.get(g.gameId) } : null,
      gamesAfter: p.remaining.filter((x) => x.date > today),
      log: p.log,
      model: g && !p.noData ? modelFor(p.pid, today) : null,
      injuryOut: OUT_RE.test(p.who?.injuryStatus || ""),
    };
  });
  const out = buildTonight({
    today,
    nowMs,
    players,
    slots: slots.map((s) => ({ index: s.index, label: s.label, playerId: s.playerId, locked: s.lockState === "locked" })),
    modelAt: modelFor,
  });
  out.notes.push(...notes);
  return out;
}

function order(kind) {
  return { lock_or_hold: 0, start: 1, swap_check: 2, after_game: 3 }[kind] ?? 9;
}

function startItem(s, e, occ, a, gain, when, byId) {
  const occName = byId.get(occ.p.id)?.name ?? occ.p.id;
  return {
    kind: "start",
    ...when(e.g.tipMs, e.p.id),
    sortMs: e.g.tipMs,
    playerId: e.p.id,
    slotLabel: s.label,
    replacesPlayerId: occ.p.id,
    text: `Start ${e.p.name} in ${s.label} for his earlier game; switch to ${occName} before ${occName}'s tip if ${e.p.name} ${a.shareLeft === 0 ? "finished" : "is on pace for"} below ${r1(a.threshold)}`,
    inputs: {
      reason: "earlier_tip_first",
      gain: r1(gain),
      threshold: r1(a.threshold),
      on: a.shareLeft === 0 ? "final" : "projected_final",
      valueIfEarlyFirst: r1(a.planValue),
      valueIfLateOnly: r1(a.swapValue),
      shareOfEarlyGameLeft: r1(a.shareLeft),
      requiresInGameSwap: a.shareLeft > 0,
      n: { early: e.m.dist.n, late: occ.m.dist.n },
    },
  };
}
