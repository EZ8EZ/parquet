/**
 * The head-to-head layer over the points model: this week's opponent read the same way as
 * the viewer's team, both week totals simulated (winprob.js), and every live decision
 * scored by P(win). Expected points stay on the cards; this adds what they cannot say:
 * a big lead favours the banked score, a deficit favours upside.
 */
/**
 * @typedef {Object} ManagerProfile  How a manager plays lock-in (managers.js; fitted offline).
 * @property {{earlyShare:number, cutoffDay:string, league:number}} lockTiming  share of banked games before cutoffDay
 * @property {{median:number, vsForecast:number, league:number}} lockThreshold  banked score (points) and banked / pre-game forecast
 * @property {{value:number, league:number}} emptySlotRate  per slot-week
 * @property {{value:number, league:number}} zeroRate      slot ending 0 from an unlocked DNP, per slot-week
 * @property {{value:number, league:number}} benchUse      share of weeks with all 7 slots filled by players who played
 * @property {number} unknownLockedShare  P(an "unknown until next tip" score is in fact locked)
 * @property {number} pointsVsRulePerSlot  his banked points per slot minus the reservation rule's
 * @property {number} weeks               completed lock-in weeks behind his own numbers
 * @property {number} shrinkage           weight on the prior (own earlier seasons, then league), 0-1
 * @property {number} halfLifeWeeks
 * @property {{season:string, weeks:number, weight:number}[]} seasons  contributing seasons and effective weight
 * @property {"manager"|"league"|"provisional"} source
 *
 * @typedef {Object} Intent  Evidence, not a verdict: copy says "playing like ..., based on ...".
 * @property {"contending"|"middle"|"rebuilding"} label
 * @property {"low"|"moderate"|"high"} confidence
 * @property {number} confidenceScore     0-1
 * @property {string[]} evidence           facts, display copy
 * @property {string} text
 *
 * @typedef {Object} OpponentSlot
 * @property {number} index
 * @property {string} label
 * @property {string|null} playerId
 * @property {string|null} name
 * @property {number|null} banked
 * @property {"locked"|"unknown_until_next_tip"|"reset"|null} lockState
 * @property {string} lockStateReason     includes "final_game_score_stands", "empty_slot", "no_game_yet"
 * @property {boolean} lockCertain
 *
 * @typedef {Object} Opponent
 * @property {number} rosterId
 * @property {string} teamName
 * @property {string|null} ownerName
 * @property {string|null} avatar
 * @property {{wins:number|null, losses:number|null, ties:number|null}} record
 * @property {number} bankedTotal
 * @property {OpponentSlot[]} slots
 * @property {number} playersStillToPlay
 * @property {number} gamesRemaining
 * @property {{mean:number, p10:number, p90:number}} projectedTotal
 * @property {ManagerProfile} profile
 * @property {Intent} intent
 *
 * @typedef {Object} WinProb
 * @property {number} now                 0-1, rest of the week on the model's policy
 * @property {number} sims
 * @property {{mean:number, p10:number, p90:number}} mine
 * @property {{mean:number, p10:number, p90:number}} theirs
 * @property {number} unknownLockWeight
 * @property {string[]} assumptions
 * @property {{p:number, mine:number, theirs:number}|null} [baseline]  lockin-assume: win chance and both projected means without the viewer's assumptions; present only with assumptions
 *
 * @typedef {Object} WhatIfOption
 * @property {string} id
 * @property {"lock"|"hold"|"wait"|"swap_in"} kind
 * @property {string} playerId
 * @property {string|null} [forPlayerId]
 * @property {string|null} [slotLabel]
 * @property {string|null} [deadline]     ISO with offset
 * @property {number} winProb             0-1
 * @property {number} delta               percentage points vs baseline
 * @property {number} se                  Monte Carlo standard error of delta, percentage points
 * @property {boolean} real               false when |delta| < 2 standard errors ("no real difference")
 * @property {number} pointsMean
 * @property {string} text
 *
 * @typedef {Object} WhatIf
 * @property {number} baseline            0-1, no further action (nobody locks, current occupants stay)
 * @property {string} baselineText
 * @property {WhatIfOption[]} options     single actions, sorted by delta
 * @property {{winProb:number, delta:number, pointsMean:number, text:string}} plan  all of the model's calls together
 * @property {number} sims
 * @property {number} seed
 * @property {string} note
 *
 * @typedef {Object} BoomBust
 * @property {number} p10
 * @property {number} p50
 * @property {number} p90
 * @property {number|null} boomRate       share of his last <=30 games at or above boomThreshold
 * @property {number|null} bustRate       share of his last <=30 games strictly under bustThreshold; null with no threshold
 * @property {number} boomThreshold       forecast mean + 1.5 x 7.0 (league residual SD)
 * @property {number|null} bustThreshold  forecast mean - 1.5 x 7.0; null when that is 0 or less
 * @property {number} n
 *
 * @typedef {Object} Availability
 * @property {{date:string, pPlay:number}[]} perGame
 * @property {number} pAll
 * @property {number} n                   team-game rows behind the history rate
 * @property {string} basis
 *
 * @typedef {Object} WaitTrigger
 * @property {"injury_listing"|"opponent_lead"|"other_result"} kind
 * @property {string} text                final display copy
 * @property {number|string} threshold    opponent_lead: points, positive = opponent ahead; injury_listing: listing
 *
 * @typedef {Object} History  The viewing manager's own past weeks.
 * @property {number} weeks
 * @property {number} n
 * @property {number} leftOnTablePerWeek
 * @property {number} lockedEarlyPerWeek
 * @property {number} heldTooLongPerWeek
 * @property {{season:string, week:number, leftOnTable:number, lockedEarly:number, heldTooLong:number}[]|null} byWeek
 * @property {number} slotsCounted
 * @property {number} slotsMissing
 * @property {number[]} unstableWeeks  weeks Sleeper served in more than one version (the most-seen one is used)
 * @property {string} note
 * @property {ManagerProfile} profile
 *
 * Card additions: card.profile {BoomBust|null}; card.availability {Availability|null};
 * card.lean gains winProbIfLock, winProbIfHold (0-1|null), leanBasis "win_probability"|"points",
 * pointsLean "lock"|"hold"|"none", disagrees; card.decision gains deadline (ISO with offset),
 * deadlineReason, action "lock_now"|"wait"|"hold"|null, waitTriggers {WaitTrigger[]}.
 */
import { teamFacts } from "./team.js";
import { simulateTotals, pWin, summarise, SIM, startChain, freshValue, entryValue } from "./winprob.js";
import { eligible } from "./policy.js";
import { maxWeightAssign } from "./assign.js";
import { availabilityOf, playProbabilities } from "./availability.js";
import { profileFor, intentOf, LEAGUE_PROFILE, USE_MANAGER_IN_SIM } from "./managers.js";
import { indexTips, tipLabel } from "./tipTimes.js";
import { dayLabel, isoInZone, DISPLAY_TZ } from "./calendar.js";
import { playerModel } from "./model.js";
import { assumeText } from "./assume.js"; // lockin-assume
import { projectFinal, usualMinutes, gameFractionLeft } from "./ingame.js";
import { boomBustProfile } from "./profile.js";
import { managerHistory } from "./history.js";

export const MATCHUP = Object.freeze({ sims: 4000, seed: SIM.seed, minSe: 2 });

// A lock-vs-hold win-chance difference counts as meaningful only above 2 paired standard
// errors AND this floor: P(win) is off by up to ~17 points in the middle deciles (backtest
// calibration, n=1,294 decision points), so smaller gaps are not shown as real.
export const WIN_DIFF_FLOOR = 0.05;

// Whether the lean follows win probability. Rule: only if, on the 240 active team-weeks
// (2025 w1-23, 2026 w1-3), a win-probability lean wins at least as many matchups as the
// points lean with a 95% cluster-bootstrap interval that excludes a loss. Result (paired,
// win-probability minus points): matchups won -4.17 pts of team-weeks [-7.81, -1.08], points
// -3.92 [-5.88, -2.41]; with the totals widened x1.25 / x1.75, -3.75 [-7.24, -0.89]. 252 of
// 269 disagreements were "lock instead of hold". P(win) itself is roughly calibrated (Brier
// 0.1236, n=1,294 decision points; middle deciles off by up to ~17 points), so the shortfall
// sits in the lock-vs-hold comparison: the simulated hold branch continues with a simpler week
// than the nightly policy and undervalues holding. The lean stays on points (minGap null).
export const WIN_LEAN = Object.freeze({ minGap: null, evidence: "scripts/lockin/opponent_backtest_wp.mjs, 2026-11-24" });

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

/** ISO time with the US Eastern offset, e.g. 2026-11-26T19:00:00-05:00. */
export function isoEastern(ms) {
  return isoInZone(ms, DISPLAY_TZ);
}

/** Per-game play probabilities for his remaining games: listing for the next, history after. */
export function availabilityPerGame(p, mdl, status) {
  if (!mdl) return null;
  const av = availabilityOf(status);
  const model = playProbabilities({ log: p.log, asOf: p.remaining[0]?.date ?? "9999", q: mdl.q.value, dates: p.remaining.map((g) => g.date) });
  const perGame = p.remaining.map((g, i) => {
    let pPlay = model[i];
    if (i === 0 && av.assumed === "listed_out") pPlay = 0;
    else if (i === 0 && av.assumed === "listed_uncertain" && av.rate) pPlay = av.rate.value;
    return { date: g.date, pPlay: r3(pPlay) };
  });
  // MINOR 4: name the listing only when it changed a value (a GTD/DTD listing with no measured
  // play rate leaves the model's number as it is)
  const listingChanged = perGame.length > 0 && perGame[0].pPlay !== r3(model[0]);
  const basis = "play model (history, back-to-back, recent misses)" + (listingChanged ? ` + listing ${status}` : "");
  return { perGame, pAll: r3(perGame.reduce((t, g) => t * g.pPlay, 1)), n: mdl.q.nRows, basis };
}

/**
 * Tonight's final for a player whose game is on: { mean, sd, basis }. With his row in the log,
 * the in-game projection (ingame.js); without it (the log behind the tip) or without usual
 * minutes, his pre-game forecast for the full game, the mean raised to the points already
 * showing if higher. Null when there is no model.
 */
export function liveTonight(p, m, scheduleGame, banked = null) {
  const g = p.live;
  if (!g || !m) return null;
  if (g.row) {
    const u = usualMinutes(p.log, g.date);
    const pr = projectFinal({ fpSoFar: g.row.fp ?? 0, secondsSoFar: g.row.sp ?? 0, gameFractionLeft: gameFractionLeft(scheduleGame), pregameMean: m.dist.mean, pregameSd: m.dist.sd, usualMinutes: u.minutes });
    if (pr) return { mean: pr.mean, sd: pr.sd, basis: "projection" };
  }
  // review 6: the points already showing are the slot's banked score when the row is missing
  return { mean: Math.max(m.dist.mean, g.row?.fp ?? 0, banked ?? 0), sd: m.dist.sd ?? 0, basis: "pregame" };
}

function simPlayer(p, mdl, avail, x, extra = {}) {
  return {
    id: p.pid,
    sample: mdl.dist.sample,
    q: mdl.q.value,
    r: mdl.r,
    H: mdl.H,
    games: avail.perGame.map((g) => (g.pPlay === 0 ? { plays: false, date: g.date } : { plays: null, p: g.pPlay, date: g.date })),
    x,
    ...extra,
  };
}

/**
 * A team's simulation input. slots: lock-state views; P: facts; modelAt(pid) -> model at his
 * next game; statusOf(pid) -> listing. Returns { team, riderIds, openSlots, assigned }.
 * mode "policy": riders follow the reservation rule, open slots get the policy's best fill.
 * mode "nothing": no further action: nobody locks, open slots keep their current occupant.
 */
export function teamSimInput({ slots, P, modelAt, statusOf, mode = "policy", wLocked = null, shift = 0, emptyRate = 0, liveAt = null, tonight = null }) {
  let fixed = 0;
  const riders = [];
  const live = [];
  let liveAtCurrent = 0;
  let livePregame = 0;
  const riderIds = [];
  const open = [];
  const inSlot = new Set();
  // B-live2: a live slot under the policy: tonight from the projection, then the same
  // continuation as before the tip (the policy's best after-tonight fill, pinned)
  const liveFirst = new Map();
  let liveDate = null;
  // review3 MUST: unlocked scores under the policy are chains too (keep x if it reaches the
  // value of the slot's continuation, else the continuation the policy assigns)
  const chainRows = [];
  for (const s of slots) {
    if (s.playerId) inSlot.add(s.playerId);
    const p = s.playerId ? P.get(s.playerId) : null;
    const rem = p && !p.noData ? p.remaining.length : 0;
    if (s.lockState === "locked") {
      fixed += s.banked ?? 0;
      continue;
    }
    // his week is over and the score stands, unless a bench player is subbed in (his score is lost)
    if (s.lockStateReason === "final_game_score_stands") {
      if (mode === "policy" && s.playerId) chainRows.push({ s, kind: "final", x: s.banked ?? 0, wLocked });
      else fixed += s.banked ?? 0;
      continue;
    }
    // M7: a game in progress is not final. Tonight's final comes from the in-game projection
    // (points so far + pre-game rate x minutes left, ingame.js), then the rule over his later games.
    if (p && p.live) {
      // the banked score is tonight's points only when this is his first game of the week; in
      // an unexplained mid-game state it may be an earlier game's score (review2 NICE b)
      const proj = liveAt ? liveAt(p, s.lockStateReason === "first_game_in_progress" ? s.banked : null) : null;
      if (proj) {
        if (proj.basis === "pregame") livePregame += 1;
        if (mode === "policy") {
          liveFirst.set(s.index, { id: p.pid, sample: [], q: 1, r: [], H: (j, y) => y, games: [], x: null, xLive: { mean: proj.mean, sd: proj.sd } });
          if (!liveDate || p.live.date > liveDate) liveDate = p.live.date;
          open.push(s);
          continue;
        }
        const mdl = rem > 0 ? modelAt(p.pid) : null;
        const avail = mdl ? availabilityPerGame(p, mdl, statusOf(p.pid)) : null;
        const games = avail ? avail.perGame.map((g) => (g.pPlay === 0 ? { plays: false } : { plays: null, p: g.pPlay })) : [];
        live.push({ id: p.pid, sample: mdl?.dist.sample ?? [], q: mdl?.q.value ?? 1, r: mdl?.r ?? [], H: mdl?.H ?? ((j, y) => y), games, x: null, xLive: { mean: proj.mean, sd: proj.sd }, noLock: mode === "nothing" });
        continue;
      }
      // B-live: only with no model at all (no log, no team); liveAt gives the pre-game forecast
      // whenever a model exists, so a log behind the tip no longer drops his later games
      liveAtCurrent += 1;
      fixed += s.banked ?? 0;
      continue;
    }
    if (s.lockState === "unknown_until_next_tip" && rem > 0) {
      const mdl = modelAt(p.pid);
      const avail = availabilityPerGame(p, mdl, statusOf(p.pid));
      if (mdl && avail) {
        // lockin-assume: a slot the viewer says is not locked carries no chance of being locked already
        const wl = s.lockStateReason === "assumed_open" ? null : wLocked;
        const sim = simPlayer(p, mdl, avail, s.banked, { wLocked: wl, noLock: mode === "nothing" });
        if (mode === "policy") chainRows.push({ s, kind: "holder", x: s.banked ?? 0, wLocked: wl, sim, riderPos: riders.length });
        riders.push(sim);
        riderIds.push(p.pid);
        continue;
      }
    }
    if (p && rem === 0) {
      fixed += s.banked ?? 0;
      continue;
    }
    open.push(s);
  }
  const occupantOf = new Map(open.map((s) => [s.index, s.playerId]));
  let fill = [];
  if (mode === "nothing") {
    fill = open.map((s) => {
      const p = s.playerId ? P.get(s.playerId) : null;
      const mdl = p ? modelAt(p.pid) : null;
      const avail = p && mdl ? availabilityPerGame(p, mdl, statusOf(p.pid)) : null;
      return mdl && avail ? simPlayer(p, mdl, avail, null, { noLock: true }) : null;
    });
  } else {
    // rows of the assignment: open slots, then unlocked scores (holders, final scores standing)
    const rows = [...open, ...chainRows.map((c) => c.s)];
    const cand = [...P.values()].filter((p) => !p.noData && p.remaining.length && (!inSlot.has(p.pid) || rows.some((s) => s.playerId === p.pid)));
    // M2: weigh each candidate by his own simulated value with per-game play probabilities, so a
    // game he is listed Out/IR/Sus for counts zero and never wins him the slot on that game
    const weightOf = (p) => {
      const mdl = modelAt(p.pid);
      if (!mdl) return -Infinity;
      const avail = availabilityPerGame(p, mdl, statusOf(p.pid));
      if (!avail) return -Infinity;
      const v = freshValue(simPlayer(p, mdl, avail, null));
      return v > 0 ? v : -Infinity;
    };
    const simOf = (p) => {
      const mdl = modelAt(p.pid);
      const avail = mdl ? availabilityPerGame(p, mdl, statusOf(p.pid)) : null;
      return mdl && avail ? simPlayer(p, mdl, avail, null) : null;
    };
    if (tonight || liveFirst.size || chainRows.length) {
      // M-plan (QA round 3): tonight's games are played by the lineup Tonight shows (lineup:
      // slot index -> player whose game tonight counts in that slot); the policy assigns every
      // slot's games after tonight. A slot banks tonight's score if it reaches the value of
      // its continuation, as a start does (startChain).
      // B-live2 (QA round 4): a slot whose game is on is the same chain, tonight drawn from the
      // projection; without a tonight lineup (the opponent) only live slots are after-tonight
      // rows, the others keep the week-long fill.
      // a holder's own games stay in his own slot (pinned like tonight's lineup), so he cannot
      // keep his score in one slot and play on in another
      const cutoff = tonight?.date ?? liveDate ?? "";
      const afterRow = (s) => !!tonight || liveFirst.has(s.index);
      const lineup = new Map(tonight ? tonight.lineup : []);
      for (const [idx, f] of liveFirst) lineup.set(idx, f.id);
      const pinned = new Map();
      for (const c of chainRows) if (c.kind === "holder") pinned.set(c.s.playerId, c.s.index);
      const full = tonight ? null : cand.map(weightOf);
      const afterOf = (sim) => (sim ? { ...sim, games: sim.games.filter((g) => g.date > cutoff), streamId: `${sim.id}|after` } : null);
      const afters = cand.map((p) => afterOf(simOf(p)));
      const wA = afters.map((a) => {
        if (!a || !a.games.length) return -Infinity;
        const v = freshValue(a);
        return v > 0 ? v : -Infinity;
      });
      // review MUST 1: a player in tonight's lineup keeps his later games in his own slot only;
      // offered to every slot, he could bank tonight in one slot and continue in another
      const tonightSlotOf = new Map(rows.filter((s) => lineup.get(s.index)).map((s) => [lineup.get(s.index), s.index]));
      for (const [pid, idx] of pinned) if (!tonightSlotOf.has(pid)) tonightSlotOf.set(pid, idx);
      const A = maxWeightAssign(rows.map((s) => cand.map((p, j) => (eligible(p.who?.positions || [], s.label) && (!tonightSlotOf.has(p.pid) || tonightSlotOf.get(p.pid) === s.index) ? (afterRow(s) ? wA[j] : full[j]) : -Infinity))));
      const entryFor = (s, i) => {
        const j = A.assign[i];
        const cont = j < 0 ? null : afterRow(s) ? afters[j] : simOf(cand[j]);
        const lf = liveFirst.get(s.index);
        if (lf) return { kind: "start", id: lf.id, first: lf, pick: cont && cont.games.length ? cont : null, C: cont && cont.games.length ? freshValue(cont) : 0, tonightLineup: true, live: true };
        if (!tonight) return cont;
        const tp = tonight.lineup.get(s.index);
        const tP = tp ? P.get(tp) : null;
        const tSim = tP && !tP.noData && tP.remaining[0]?.date === tonight.date ? simOf(tP) : null;
        if (!tSim) return cont;
        const first = { ...tSim, games: tSim.games.filter((g) => g.date === tonight.date) };
        return { kind: "start", id: tSim.id, first, pick: cont, C: cont ? freshValue(cont) : 0, tonightLineup: true };
      };
      fill = open.map((s, i) => entryFor(s, i));
      chainRows.forEach((c, k) => {
        const cont = entryFor(c.s, open.length + k);
        const usable = cont && (cont.kind === "start" || cont.games?.length) ? cont : null;
        const entry = { kind: "hold", id: c.s.playerId, x: c.x, cont: usable, C: entryValue(usable), wLocked: c.wLocked, streamId: `${c.s.playerId}|lock`, games: c.sim?.games ?? [] };
        if (c.kind === "holder") riders[c.riderPos] = entry;
        else if (usable) fill.push(entry);
        else fixed += c.x;
      });
    } else {
      const w = cand.map(weightOf);
      const A = maxWeightAssign(open.map((s) => cand.map((p, j) => (eligible(p.who?.positions || [], s.label) ? w[j] : -Infinity))));
      fill = open.map((s, i) => {
        const j = A.assign[i];
        return j < 0 ? null : simOf(cand[j]);
      });
    }
  }
  return { team: { fixed, riders, slots: fill, shift, emptyRate, live }, riderIds, openSlots: open, occupantOf, liveAtCurrent, livePregame };
}

const deltaSe = (a, b, theirs) => {
  const n = Math.min(a.length, b.length, theirs.length);
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const wa = a[i] > theirs[i] ? 1 : a[i] === theirs[i] ? 0.5 : 0;
    const wb = b[i] > theirs[i] ? 1 : b[i] === theirs[i] ? 0.5 : 0;
    const d = wa - wb;
    s += d;
    s2 += d * d;
  }
  const m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m) / n);
};

/**
 * Tonight's starts applied to the plan's slots (mutates slots). starts: [{ item, incoming,
 * openPos }]; openPos -1 = a holder's slot (not an open slot of the simulation input).
 * tonightMode: the input already plays tonight's lineup in its open slots, so only starts into
 * holders' slots apply, and continuations are after-tonight games: a start conflicts only with
 * the same player playing tonight in another slot (review 7: a continuation elsewhere used to
 * drop the start, and the holder's slot then played nobody tonight); his later games are not
 * offered when another slot already has them.
 */
export function applyStarts(slots, starts, { tonightMode = false, skip = () => false } = {}) {
  for (const st of starts) {
    const E = st.item.playerId;
    if (skip(E)) continue;
    if (tonightMode && st.openPos >= 0) continue;
    const other = (x, i) => x && i !== st.openPos;
    const tonightElsewhere = slots.some((x, i) => other(x, i) && (tonightMode ? x.kind === "start" && x.id === E : x.id === E || x.pick?.id === E));
    if (tonightElsewhere) continue;
    const laterElsewhere = tonightMode && slots.some((x, i) => other(x, i) && (x.pick?.id === E || (x.kind !== "start" && x.id === E)));
    // review2 SHOULD 2: into a holder's slot, the start covers tonight only; the holder's own
    // games (switching back before his tip tonight, or his later games) stay the continuation
    const cont = st.openPos >= 0 ? slots[st.openPos] : (st.holderCont ?? null);
    const chain = startChain(st.incoming, cont && cont.kind !== "start" ? cont : null, { allowAfter: !laterElsewhere });
    if (st.openPos >= 0) slots[st.openPos] = chain;
    else slots.push(chain);
  }
}

/**
 * review4 MUST: the player a slot entry hands the slot to, when that is not `occupantId`:
 * { playerId, from (his first game date in the slot), conditional (only if the score before it
 * is not kept), C (value it must beat) } or null. Plain entry: unconditional; start chain:
 * after tonight, if tonight's score is under C; hold chain: if the held score is not kept.
 */
export function handoverOf(entry, occupantId) {
  if (!entry) return null;
  if (entry.kind === "hold") {
    // the rule keeps a score that reaches C: then nobody takes the slot
    if (entry.x >= entry.C) return null;
    const c = handoverOf(entry.cont, occupantId);
    return c ? { ...c, threshold: c.C, C: entry.C, replaced: entry.x } : null;
  }
  if (entry.kind === "start") {
    const p = entry.pick;
    if (!p || p.id === entry.first.id) return null;
    // review5 MUST: the occupant coming back after a try-out start is a move too (returns)
    return { playerId: p.id, from: p.games?.[0]?.date ?? null, conditional: true, C: entry.C, after: entry.first.id, ...(p.id === occupantId ? { returns: true } : {}) };
  }
  if (!entry.id || entry.id === occupantId) return null;
  return { playerId: entry.id, from: entry.games?.[0]?.date ?? null, conditional: false, C: null };
}

/**
 * Coordinator, review5: the points lean (D131, lineup-aware) is not changed in this release, but a
 * card never shows a bare lean that contradicts the figures beside it. When the lean is hold while
 * the score already reaches the shown expected-if-held value (or lock while it does not), the
 * reason says why from values already on the card, confidence shows at most "marginal" (the
 * model's own kept as confidenceModel) and lean.basisDisagrees is set. lean.value, calls and plan
 * actions are untouched.
 */
export function honestLean(card) {
  const st = card?.stopping;
  const lean = card?.lean;
  if (!st || !lean || (lean.value !== "lock" && lean.value !== "hold") || st.x == null || st.expectedIfHeld == null) return card;
  const shown = st.expectedIfHeld;
  const disagrees = lean.value === "hold" ? st.x >= shown : st.x < shown;
  if (!disagrees) return card;
  const f = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const own = st.expectedIfHeldOwn;
  const slot = st.expectedIfHeldBasis === "slot_continuation" && st.heldContinuation ? `the slot is worth ${f(shown)} after him (${st.heldContinuation.name})` : `the slot is worth ${f(shown)} after tonight`;
  let why;
  if (own != null && Math.abs(own - shown) >= 0.05 && (lean.value === "hold" ? st.x < own : st.x >= own)) {
    why = `Model leans ${lean.value} because its lineup rule counts his remaining games as if he plays them all (${f(own)}); with his chances of playing, ${slot}, so this is a close call`;
  } else {
    const vl = lean.inputs?.valueIfLock;
    const vh = lean.inputs?.valueIfHold;
    const both = vl != null && vh != null ? ` (${f(vh)} for the open slots if he holds, ${f(vl)} if he locks)` : "";
    why = `Model leans ${lean.value} because its lineup rule weighs every open slot and who can fill it${both}; on this slot alone, ${f(st.x)} now against ${f(shown)} expected if held points the other way, so this is a close call`;
  }
  card.lean = { ...lean, reason: why, basisDisagrees: true, confidenceModel: lean.confidence ?? null, confidence: lean.confidence == null ? null : "marginal" };
  return card;
}

/** Label for a player's own-games value kept beside the plan's (it assumes he plays every game). */
export const OWN_LABEL = "if he plays every game";

/**
 * Tonight's thresholds use the same value the plan banks against (review4 follow-up, roster 6:
 * Tonight said "Brazile: 10.6 expected if held" while the plan started Okongwu in that slot if
 * Brazile's score tonight was under 23). When a slot's continuation after tonight is another
 * player, the after-game line and the player's expectedIfHeldAfterTonight become that
 * continuation's value and name him; a holder's lock-or-hold item takes the hold branch's value.
 * Own-games values stay where the continuation is his own games.
 */
export function alignTonight(desk, layer, nameOf = () => null) {
  const t = desk.tonight;
  if (!t || t.status !== "games") return;
  const f = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const afterOf = new Map((layer.laterStarts || []).filter((a) => a.after).map((a) => [a.after, a]));
  const own = OWN_LABEL;
  for (const it of t.timeline || []) {
    if (it.kind === "after_game") {
      const a = afterOf.get(it.playerId);
      if (a && a.afterThreshold != null) {
        const who = nameOf(a.playerId) ?? a.playerId;
        it.inputs = { ...it.inputs, expectedIfHeldOwn: it.inputs?.expectedIfHeld ?? null, expectedIfHeldOwnLabel: own, expectedIfHeld: a.afterThreshold, basis: "slot_continuation", continuation: { playerId: a.playerId, from: a.from, returns: !!a.returns } };
        it.text = a.returns
          ? `After his game: lock it if it reaches ${f(a.afterThreshold)}; otherwise ${who} returns to the slot${a.from ? ` from ${dayLabel(a.from)}` : ""}`
          : `After his game: lock it if it reaches ${f(a.afterThreshold)}; otherwise ${who} takes the slot${a.from ? ` from ${dayLabel(a.from)}` : ""}`;
        continue;
      }
      // review5 SHOULD: his own later games, valued as the plan values them (his play chances)
      const tc = layer.tonightC?.get(it.playerId);
      if (tc && (tc.pick == null || tc.pick === it.playerId)) {
        it.inputs = { ...it.inputs, expectedIfHeldOwn: it.inputs?.expectedIfHeld ?? null, expectedIfHeldOwnLabel: own, expectedIfHeld: tc.C, basis: "plan" };
        it.text = `After his game: ${f(tc.C)} expected if held, ${it.inputs.gamesAfter ?? "his"} game${it.inputs.gamesAfter === 1 ? "" : "s"} left after tonight`;
      }
    } else if (it.kind === "lock_or_hold") {
      const add = layer.cards.get(it.playerId);
      const hc = add?.holdContinuation;
      if (hc) {
        it.inputs = { ...it.inputs, expectedIfHeldOwn: it.inputs?.expectedIfHeld ?? null, expectedIfHeldOwnLabel: own, expectedIfHeld: hc.value, basis: "slot_continuation", continuation: { playerId: hc.playerId, from: hc.from } };
        it.text = `Lock ${f(it.inputs.x)} or let it go (${f(hc.value)} expected if held: ${hc.after ? "his game tonight, then " : ""}${hc.name} in the slot${hc.from ? ` from ${dayLabel(hc.from)}` : ""}), before his tip`;
      } else if (add?.holdValue != null) {
        it.inputs = { ...it.inputs, expectedIfHeldOwn: it.inputs?.expectedIfHeld ?? null, expectedIfHeldOwnLabel: own, expectedIfHeld: add.holdValue, basis: "plan" };
      }
    } else if (it.kind === "start" && it.slotIndex != null) {
      // a try-out start whose slot goes back to its occupant says when he returns
      const a = (layer.laterStarts || []).find((x) => x.returns && x.slotIndex === it.slotIndex && x.after === it.playerId);
      if (a && typeof it.text === "string") {
        it.text = it.text.replace(/ and keeps his later games$/, ` and returns to the slot${a.from ? ` from ${dayLabel(a.from)}` : ""} unless ${nameOf(it.playerId) ?? it.playerId}'s score reaches ${f(a.afterThreshold)}`);
      }
    }
  }
  for (const p of t.players || []) {
    const a = afterOf.get(p.playerId);
    const tc = layer.tonightC?.get(p.playerId);
    if (a && a.afterThreshold != null) p.expectedIfHeldAfterTonight = a.afterThreshold;
    else if (tc && (tc.pick == null || tc.pick === p.playerId)) p.expectedIfHeldAfterTonight = tc.C;
  }
}

/** A slot continuation with `pid`'s next game not played (his listing says Out for it). */
export function ruledOutNext(cont, pid) {
  if (!cont) return null;
  const out = (sim) => ({ ...sim, games: sim.games.map((g, i) => (i === 0 ? { ...g, plays: false } : g)) });
  if (cont.kind === "start") return cont.first.id === pid ? { ...cont, first: out(cont.first) } : cont;
  return cont.id === pid ? out(cont) : cont;
}

/**
 * A swap check applied to a team's simulation input (mutates slots and live): the incoming
 * player plays tonight's game in the outgoing player's slot, and the slot keeps the outgoing
 * player's later games (or the incoming player's own, if no other slot has them).
 * held: the outgoing player's rider when he is a holder (his own decision is forced out).
 * review 2: an outgoing player whose game is on is subbed out, so his score tonight is lost;
 * he leaves the live list and only his later games stay with the slot.
 */
export function swapInto({ slots, live = [], outId, incoming, held = null }) {
  const inId = incoming.id;
  const elsewhere = (skip) => slots.some((x, i) => x && i !== skip && (x.pick?.id === inId || (x.kind !== "start" && x.id === inId)));
  const si = slots.findIndex((x) => x && (x.id === outId || x.id === inId));
  const li = si < 0 && !held ? live.findIndex((x) => x.id === outId) : -1;
  if (li >= 0) {
    const was = live.splice(li, 1)[0];
    const later = was.games.length ? { ...was, xLive: undefined, x: null, streamId: `${was.id}|after` } : null;
    slots.push(startChain(incoming, later, { allowAfter: !elsewhere(-1) }));
    return;
  }
  const outSim = si >= 0 ? slots[si] : held;
  let later;
  if (!outSim) later = null;
  else if (outSim.kind === "hold") {
    // review3: a holder's slot keeps its continuation, minus tonight's game the incoming player takes
    const c = outSim.cont;
    later = !c ? null : c.tonightLineup ? c.pick : c.id === outId && c.games?.length > 1 ? { ...c, games: c.games.slice(1) } : c.id === outId ? null : c;
  } else later = outSim.tonightLineup ? outSim.pick : outSim.kind !== "start" && outSim.games?.length > 1 ? { ...outSim, x: null, games: outSim.games.slice(1) } : null;
  // review MUST 1: his later games may already be another slot's continuation
  const chain = startChain(incoming, later, { allowAfter: !elsewhere(si) });
  if (si >= 0) slots[si] = chain;
  else slots.push(chain);
}

/**
 * Build the layer. ctx: { L, desk, P, info, modelFor, dir, nameOf }.
 * Returns { opponent, winProb, whatIf, cards: Map pid -> additions, history }.
 */
export function buildMatchupLayer(ctx) {
  const { L, desk, P, info, modelFor, dir, nameOf, assume = [], baselineOnly = false, baseline = null } = ctx;
  const opts = { sims: MATCHUP.sims, seed: MATCHUP.seed };
  // lockin-assume: a side with no assumption reuses the baseline pass's simulation
  const assumedMine = assume.some((a) => a.side === "mine");
  const assumedTheirs = assume.some((a) => a.side === "theirs");
  let theirsApplied = [];
  const statusOf = (pid) => dir.get(pid)?.injuryStatus ?? null;
  const modelAtMine = (pid) => {
    const p = P.get(pid);
    const d = p?.remaining?.[0]?.date ?? null;
    return d && !p.noData ? modelFor(pid, d) : null;
  };
  const tips = indexTips(L.tipsRaw, L.scheduleIdx);
  const startOf = (g) => (g ? (tips.get(g.gameId)?.startMs ?? null) : null);
  const nowMs = Date.parse(desk.generatedAt);
  // M7: in-game projection for a player whose game is on, from the model as of that game
  // B-live (QA round 3): at every tip the schedule says in_game before his log has tonight's
  // row (logs are also cached 120 s). With no row, or no usual minutes, tonight's final is his
  // pre-game forecast for the full game (mean and SD of his model), the mean raised to the points
  // already showing if those are higher. Null only when there is no model at all.
  const liveFor = (modelOn) => (p, banked = null) => {
    if (!p.live || p.noData) return null;
    return liveTonight(p, modelOn(p, p.live.date), L.scheduleIdx?.games?.get(p.live.gameId) ?? null, banked);
  };
  const liveMine = liveFor((p, d) => modelFor(p.pid, d));

  // opponent
  const oppM = L.oppMatchup || null;
  let opponent = null;
  let theirs = null;
  let liveCurrent = 0;
  // games in progress counted at the pre-game forecast, per side
  const livePre = { mine: 0, theirs: 0 };
  let oppFacts = null;
  const users = new Map((L.users || []).map((u) => [u.user_id, u]));
  const rosterOf = (rid) => (L.rosters || []).find((r) => r.roster_id === rid) || null;
  if (oppM) {
    const ids = L.oppPlayerIds || [];
    const logsRaw = { ...(L.oppLogsRaw || {}) };
    for (const pid of ids) if (!logsRaw[pid] && L.logsRaw?.[pid]) logsRaw[pid] = L.logsRaw[pid];
    oppFacts = teamFacts({ L, ids, logsRaw, matchup: oppM, nameOf, dir, assume: assume.filter((a) => a.side === "theirs") });
    theirsApplied = oppFacts.applied;
    const oModels = new Map();
    const modelAtOpp = (pid) => {
      const p = oppFacts.P.get(pid);
      const d = p?.remaining?.[0]?.date ?? null;
      if (!d || p.noData) return null;
      const k = `${pid}|${d}`;
      if (!oModels.has(k)) oModels.set(k, playerModel(p.log, d));
      return oModels.get(k);
    };
    const roster = rosterOf(oppM.roster_id);
    const owner = roster?.owner_id ? users.get(roster.owner_id) : null;
    const prof = profileFor(roster?.owner_id ?? null);
    // the manager profile did not beat the league profile out of sample (managerProfiles.js),
    // so the simulation takes league behaviour unless USE_MANAGER_IN_SIM says otherwise
    const simProf = USE_MANAGER_IN_SIM ? prof : profileFor(null);
    const liveOpp = liveFor((p, d) => playerModel(p.log, d));
    const input = teamSimInput({ slots: oppFacts.slots, P: oppFacts.P, modelAt: modelAtOpp, statusOf, mode: "policy", wLocked: simProf.unknownLockedShare, shift: simProf.pointsVsRulePerSlot, emptyRate: simProf.emptySlotRate.value, liveAt: liveOpp });
    liveCurrent += input.liveAtCurrent;
    livePre.theirs += input.livePregame;
    theirs = baseline?.theirs && !assumedTheirs ? baseline.theirs : simulateTotals(input.team, opts);
    const st = roster?.settings || {};
    const standing = rankOf(L.rosters || [], oppM.roster_id);
    const intent = intentOf({ wins: st.wins ?? 0, losses: st.losses ?? 0, rank: standing, weeksPlayed: (st.wins ?? 0) + (st.losses ?? 0) + (st.ties ?? 0), ...seasonSignals(L.pastMatchups, oppM.roster_id) });
    const toPlay = [...oppFacts.P.values()].filter((p) => !p.noData && p.remaining.length);
    const sum = summarise(theirs);
    opponent = {
      rosterId: oppM.roster_id,
      teamName: owner?.metadata?.team_name ?? owner?.display_name ?? `Roster ${oppM.roster_id}`,
      ownerName: owner?.display_name ?? null,
      avatar: owner?.avatar ?? null,
      record: { wins: st.wins ?? null, losses: st.losses ?? null, ties: st.ties ?? null },
      bankedTotal: r1(oppFacts.slots.reduce((t, s) => t + (s.banked ?? 0), 0)),
      // gamesLeft (design-a, additive): the occupant's games not yet started, so the what-if
      // layer never offers "playing on" for a slot whose score already stands
      slots: oppFacts.slots.map((s) => ({ index: s.index, label: s.label, playerId: s.playerId, name: s.name, banked: s.banked, lockState: s.lockState, lockStateReason: s.lockStateReason, lockCertain: s.lockCertain, gamesLeft: gamesLeftOf(oppFacts.P, s.playerId) })),
      playersStillToPlay: toPlay.length,
      gamesRemaining: toPlay.reduce((t, p) => t + p.remaining.length, 0),
      projectedTotal: { mean: r1(sum.mean), p10: r1(sum.p10), p90: r1(sum.p90) },
      profile: prof,
      intent,
    };
  }

  // mine
  // M-plan: the plan's tonight is the lineup Tonight shows (the last listed start at which each
  // slot's player is in for his game; starts included), the policy after tonight
  const tonightLineup = new Map();
  if (desk.tonight?.status === "games") {
    for (const t of desk.tonight.timeline || []) {
      if (t.kind !== "lineup_at_start") continue;
      for (const sl of t.inputs?.slots || []) if (sl.inForThisStart && sl.playerId) tonightLineup.set(sl.slotIndex, sl.playerId);
    }
  }
  const tonightIn = tonightLineup.size ? { date: desk.tonight.date, lineup: tonightLineup } : null;
  const mineIn = teamSimInput({ slots: desk.slots, P, modelAt: modelAtMine, statusOf, mode: "policy", liveAt: liveMine, tonight: tonightIn });
  liveCurrent += mineIn.liveAtCurrent;
  livePre.mine += mineIn.livePregame;

  const cards = new Map();
  const assumptions = [];
  let winProb = null;
  let whatIf = null;
  if (theirs) {
    const prof = USE_MANAGER_IN_SIM ? opponent.profile : profileFor(null);
    assumptions.push(
      `Opponent's scores that may already be locked count as locked with probability ${prof.unknownLockedShare}: how often such a score turned out locked in this league, 2022-2026 (n=16,047 situations).`,
      `Opponent's remaining slots play the reservation rule shifted ${prof.pointsVsRulePerSlot} points a slot (league managers against the rule, 2022-2026), with a ${Math.round(prof.emptySlotRate.value * 1000) / 10}% chance a slot ends empty; league values, because his own profile did not predict better on held-out weeks.`,
      tonightIn ? "Your remaining slots follow the model's policy: tonight, the lineup Tonight shows (its starts included); after tonight, the reservation rule with open slots filled by the best available player." : "Your remaining slots follow the model's policy: the reservation rule, open slots filled by the best available player.",
      "Each player's score is drawn from his own recent games, his play probability from his own history and listing.",
      "Locked scores are fixed. A game in progress counts at its in-game projection: points so far plus his pre-game per-minute rate times the minutes he can be expected to have left, with spread the pre-game SD scaled by the share of minutes left (80% band covered 83-84% of finals at Q1, half and Q3; n=2,740 games, ingame.js). Games not started are drawn from his forecast.",
      "An unlocked score (a game in progress, a held score, or a final score that stands) is kept when it reaches what the slot is worth after it; otherwise the slot continues with the policy's best available player, who may be the same player or a bench player (a subbed-out score is lost).",
    );
    if (livePre.mine || livePre.theirs) {
      const g = (n) => `${n} game${n === 1 ? "" : "s"}`;
      const whose = [livePre.mine ? `${g(livePre.mine)} of yours` : null, livePre.theirs ? `${g(livePre.theirs)} of your opponent's` : null].filter(Boolean).join(" and ");
      assumptions.push(`${whose} in progress ${livePre.mine + livePre.theirs === 1 ? "has" : "have"} no box score yet (the game log has not caught up with the tip), so tonight counts at the pre-game forecast for the full game, or the points already showing if higher; after tonight the slot continues with the policy's best available player.`);
    }
    if (liveCurrent) assumptions.push(`${liveCurrent} game${liveCurrent === 1 ? "" : "s"} in progress had no model at all (game log or team missing) and count at the current score.`);
    const s2 = summarise(theirs);
    // now and mine are the plan's, set below (the policy-only simulation that filled them was overwritten)
    winProb = { now: null, sims: MATCHUP.sims, mine: null, theirs: { mean: r1(s2.mean), p10: r1(s2.p10), p90: r1(s2.p90) }, unknownLockWeight: prof.unknownLockedShare, assumptions };

    // The model's plan: the policy for every slot, each holder at the card's lean (lock ->
    // banked, hold -> his score resets). Baseline, plan and winProb.now are this one number.
    // Every option forces one action and keeps the plan for everything else; the card's
    // winProbIfLock / winProbIfHold are the same simulations as options lock:X / hold:X.
    const holders = mineIn.riderIds;
    const leanOf = new Map(desk.cards.map((c) => [c.playerId, c.lean?.value]));
    const planLock = new Map(holders.map((pid) => [pid, leanOf.get(pid) === "lock"]));
    // Tonight's unconditional starts are part of the plan: the incoming player takes that
    // slot's place in the simulation (a replaced holder is out). Swap checks stay conditional.
    const starts = [];
    for (const t of desk.tonight?.timeline || []) {
      if (t.kind !== "start") continue;
      const inP = P.get(t.playerId);
      const mdl = modelAtMine(t.playerId);
      const avail = inP && mdl ? availabilityPerGame(inP, mdl, statusOf(t.playerId)) : null;
      if (!avail) continue;
      starts.push({ item: t, incoming: simPlayer(inP, mdl, avail, null), openPos: mineIn.openSlots.findIndex((x) => x.index === t.slotIndex) });
    }
    const startOut = new Set(starts.map((x) => x.item.replacesPlayerId).filter((id) => holders.includes(id)));
    const teamWith = (forced = new Map(), extra = null) => {
      let fixed = mineIn.team.fixed;
      const riders = [];
      const slots = [...mineIn.team.slots];
      // a start occupies the slot for tonight's game only; the player the policy had in that
      // slot keeps his later games (B1: replacing him outright dropped them)
      // a start into a holder's slot carries the holder's games as its continuation; when an option
      // forces that holder's own action, the slot is his and the start does not apply
      // review3 MUST: with a tonight lineup, starts (into open and holders' slots) are already in
      // the slots' continuations, so none is applied again
      const startsNow = tonightIn
        ? []
        : starts
            .map((st) => {
              const rep = st.item.replacesPlayerId;
              const hi = st.openPos < 0 ? holders.indexOf(rep) : -1;
              if (hi < 0) return st;
              if (forced.has(rep)) return null;
              return { ...st, holderCont: mineIn.team.riders[hi]?.cont ?? null };
            })
            .filter(Boolean);
      applyStarts(slots, startsNow, { tonightMode: !!tonightIn, skip: (pid) => forced.get(pid) === "skip" });
      // each holder's slot is a chain: lock = keep his score; hold = let it go and the slot plays its
      // continuation (his own later games or a bench player, as the policy assigns); wait = the chain
      // decided at the deadline (keep if it reaches the continuation's value); out = a start or swap
      // takes the slot
      holders.forEach((pid, hi) => {
        const h = mineIn.team.riders[hi];
        const act = forced.has(pid) ? forced.get(pid) : startOut.has(pid) && !tonightIn ? "out" : planLock.get(pid) ? "lock" : "hold";
        if (act === "lock") fixed += h.x;
        else if (act === "wait") riders.push(h);
        else if (act === "hold" && h.cont) slots.push(h.cont);
      });
      const live = [...(mineIn.team.live || [])];
      if (extra) extra({ riders, slots, live });
      return { ...mineIn.team, fixed, riders, slots, live };
    };
    const planT = baseline?.planT && !assumedMine ? baseline.planT : simulateTotals(teamWith(), opts);
    const pPlan = pWin(planT, theirs);
    winProb.now = r3(pPlan);
    const sPlan = summarise(planT);
    winProb.mine = { mean: r1(sPlan.mean), p10: r1(sPlan.p10), p90: r1(sPlan.p90) };
    if (baselineOnly) return { baselineSims: { theirs, planT, p: r3(pPlan), mine: r1(sPlan.mean), theirsMean: r1(s2.mean) } };
    if (assume.length) {
      assumptions.push("These numbers include your lock-state assumptions (desk.assumptions); they override what the model inferred for those slots.");
      winProb.baseline = baseline ? { p: baseline.p, mine: baseline.mine, theirs: baseline.theirsMean } : null;
    }
    const options = [];
    const choice = new Map();
    const addOption = (o, totals) => {
      const wp = pWin(totals, theirs);
      const se = deltaSe(totals, planT, theirs);
      const delta = (wp - pPlan) * 100;
      const opt = { ...o, winProb: r3(wp), delta: r1(delta), se: r1(se * 100), real: Math.abs(delta) >= MATCHUP.minSe * se * 100 && Math.abs(delta) >= 0.05, pointsMean: r1(summarise(totals).mean) };
      options.push(opt);
      return { totals, wp, opt };
    };
    holders.forEach((pid, hi) => {
      const h = mineIn.team.riders[hi];
      const name = nameOf(pid) ?? pid;
      const L = addOption({ id: `lock:${pid}`, kind: "lock", playerId: pid, text: `Lock ${name}'s ${r1(h.x)} now` }, simulateTotals(teamWith(new Map([[pid, "lock"]])), opts));
      // review4 MUST: "hold" plays the slot's continuation; say who that is when it is not him
      const ho = handoverOf(h.cont, pid);
      const holdText = ho ? `Let ${name}'s ${r1(h.x)} go; ${nameOf(ho.playerId) ?? ho.playerId} takes the slot${ho.from ? ` from ${dayLabel(ho.from)}` : ""}${ho.conditional && ho.after ? ` (after ${nameOf(ho.after) ?? ho.after}'s game tonight, unless that score is kept)` : ""}` : `Let ${name}'s ${r1(h.x)} go and play on`;
      const H = addOption({ id: `hold:${pid}`, kind: "hold", playerId: pid, text: holdText, handover: ho ? { playerId: ho.playerId, from: ho.from, conditional: ho.conditional } : null }, simulateTotals(teamWith(new Map([[pid, "hold"]])), opts));
      addOption({ id: `wait:${pid}`, kind: "wait", playerId: pid, text: `Keep ${name}'s ${r1(h.x)} and decide at the deadline` }, simulateTotals(teamWith(new Map([[pid, "wait"]])), opts));
      // hold with his next game ruled out: the continuation with his own next game not played
      const holdWith = () => simulateTotals(teamWith(new Map([[pid, "out"]]), ({ slots }) => { const c = ruledOutNext(h.cont, pid); if (c) slots.push(c); }), opts);
      choice.set(pid, { lockT: L.totals, holdT: H.totals, ifLock: L.wp, ifHold: H.wp, se: deltaSe(L.totals, H.totals, theirs), h, holdWith });
    });
    // swap-ins from tonight's start / swap checks, plan kept for everything else
    for (const t of desk.tonight?.timeline || []) {
      if (t.kind !== "swap_check" && t.kind !== "start") continue;
      const outId = t.forPlayerId ?? t.replacesPlayerId ?? null;
      const inP = P.get(t.playerId);
      const mdl = modelAtMine(t.playerId);
      const avail = inP && mdl ? availabilityPerGame(inP, mdl, statusOf(t.playerId)) : null;
      if (!avail) continue;
      const incoming = simPlayer(inP, mdl, avail, null);
      const forced = new Map();
      if (holders.includes(outId)) forced.set(outId, "out");
      // a start is already in the plan; a swap check puts the incoming player in for tonight
      // and keeps the replaced player's later games for the slot (he loses tonight's)
      const team =
        t.kind === "start"
          ? teamWith(forced)
          : teamWith(forced, ({ slots, live }) => swapInto({ slots, live, outId, incoming, held: holders.includes(outId) ? mineIn.team.riders[holders.indexOf(outId)] : null }));
      addOption({ id: `swap:${t.playerId}:${outId}`, kind: "swap_in", playerId: t.playerId, forPlayerId: outId, slotLabel: t.slotLabel ?? null, deadline: t.at ? isoEastern(Date.parse(t.at)) : null, text: `${nameOf(t.playerId) ?? t.playerId} in for ${outId ? (nameOf(outId) ?? outId) : "the empty slot"} before ${t.listedStart ?? "his game"}` }, simulateTotals(team, opts));
    }
    options.sort((a, b) => b.delta - a.delta);
    // review4 MUST: every substitution the plan's number assumes, named: a slot whose
    // continuation is another player (an open slot's fill, a held slot let go, a slot after
    // tonight's game, a final score that a bench player replaces)
    const tipOf = (pid, date) => {
      const g = P.get(pid)?.remaining?.find((x) => x.date === date) ?? null;
      return startOf(g);
    };
    const laterStarts = [];
    const pushLater = (ho, slot, occupantId) => {
      if (!ho || !slot) return;
      const ms = ho.from ? tipOf(ho.playerId, ho.from) : null;
      const who = nameOf(ho.playerId) ?? ho.playerId;
      const occ = occupantId ? (nameOf(occupantId) ?? occupantId) : null;
      const when = ho.from ? ` from ${dayLabel(ho.from)}${ms != null ? ` ${tipLabel(ms)}` : ""}` : "";
      const cond = ho.replaced != null && occ
        ? ` in place of ${occ}'s ${r1(ho.replaced)} (the slot is worth ${r1(ho.C)} after it)${ho.conditional && ho.after ? `, if ${nameOf(ho.after) ?? ho.after}'s score tonight is under ${r1(ho.threshold ?? ho.C)}` : ""}`
        : ho.conditional && ho.after
          ? ` if ${nameOf(ho.after) ?? ho.after}'s score tonight is under ${r1(ho.C)}`
          : "";
      const text = ho.returns
        ? `Then ${who} returns to ${slot.label}${when}${ho.after ? ` if ${nameOf(ho.after) ?? ho.after}'s score tonight is under ${r1(ho.C)}` : ""}`
        : `Then start ${who} at ${slot.label}${when}${cond}`;
      laterStarts.push({ kind: "then_start", playerId: ho.playerId, replacesPlayerId: ho.returns ? (ho.after ?? null) : (occupantId ?? null), slotIndex: slot.index, slotLabel: slot.label, from: ho.from, conditional: ho.conditional, threshold: ho.C != null ? r1(ho.C) : null, deadline: ms != null ? isoEastern(ms) : null, text, ...(ho.returns ? { returns: true } : {}), ...(ho.after ? { after: ho.after, afterThreshold: r1(ho.after && ho.replaced == null ? ho.C : (ho.threshold ?? ho.C)) } : {}) });
    };
    mineIn.openSlots.forEach((sl, i) => pushLater(handoverOf(mineIn.team.slots[i], sl.playerId), sl, sl.playerId));
    for (const e of mineIn.team.slots.slice(mineIn.openSlots.length)) {
      if (e?.kind === "hold") pushLater(handoverOf(e, e.id), desk.slots.find((x) => x.playerId === e.id), e.id);
    }
    holders.forEach((pid, hi) => {
      if (planLock.get(pid)) return;
      const h = mineIn.team.riders[hi];
      const ho = handoverOf(h.cont, pid);
      // review5 NICE: name whose score the holder's slot gives up
      pushLater(ho ? { ...ho, conditional: ho.conditional && !!ho.after, ...(ho.returns ? {} : { replaced: h.x, C: h.C, threshold: ho.after ? ho.C : undefined }) } : null, desk.slots.find((x) => x.playerId === pid), pid);
    });
    const nothingIn = teamSimInput({ slots: desk.slots, P, modelAt: modelAtMine, statusOf, mode: "nothing", liveAt: liveMine });
    const pNothing = pWin(simulateTotals(nothingIn.team, opts), theirs);
    whatIf = {
      baseline: r3(pPlan),
      baselineText: "The model's plan: its call on every slot",
      options,
      plan: {
        winProb: r3(pPlan),
        delta: 0,
        pointsMean: r1(sPlan.mean),
        text: `All of the model's calls: ${Math.round(pPlan * 100)}%`,
        actions: [
          ...holders.map((pid) => ({ kind: startOut.has(pid) ? "out" : planLock.get(pid) ? "lock" : "hold", playerId: pid })),
          ...starts.map((x) => ({ kind: "start", playerId: x.item.playerId, replacesPlayerId: x.item.replacesPlayerId ?? null, slotLabel: x.item.slotLabel ?? null, deadline: x.item.at ? isoEastern(Date.parse(x.item.at)) : null })),
          ...laterStarts,
          ...(desk.tonight?.timeline || []).filter((t) => t.kind === "swap_check").map((t) => ({ kind: "swap_check", playerId: t.playerId, forPlayerId: t.forPlayerId ?? null, slotLabel: t.slotLabel ?? null, threshold: t.inputs?.threshold ?? null, conditional: true, deadline: t.at ? isoEastern(Date.parse(t.at)) : null })),
        ],
      },
      doNothing: r3(pNothing),
      sims: MATCHUP.sims,
      seed: MATCHUP.seed,
      note: `Each option forces one action and keeps the model's plan for the rest. A difference under ${MATCHUP.minSe} standard errors of the paired simulation is flagged real: false.`,
    };

    // card additions
    // projected final margin, opponent minus mine: banked totals mid-week leave my open slots out
    const lead = r1(summarise(theirs).mean - sPlan.mean);
    for (const v of info.values()) {
      const pid = v.p.pid;
      const c = choice.get(pid);
      const add = {};
      if (c) {
        const winLean = c.ifLock > c.ifHold ? "lock" : "hold";
        const clear = Math.abs(c.ifLock - c.ifHold) >= Math.max(MATCHUP.minSe * c.se, 0.005);
        const gap = Math.abs(c.ifLock - c.ifHold);
        add.lean = { winProbIfLock: r3(c.ifLock), winProbIfHold: r3(c.ifHold), winLean, clear, se: r3(c.se), lead, diffReal: gap > MATCHUP.minSe * c.se && gap >= WIN_DIFF_FLOOR };
        // M4(a): trigger wording follows the displayed (points) lean, not the win-chance lean
        add.triggers = waitTriggers({ c, theirs, lead, h: c.h, name: nameOf(pid) ?? pid, displayedLock: leanOf.get(pid) === "lock", nextDay: v.p.remaining[0] ? dayLabel(v.p.remaining[0].date) : null });
        // review4 MUST: the hold branch the win chance uses
        const ho = handoverOf(c.h.cont, pid);
        if (ho && c.h.C != null && !ho.returns) add.holdContinuation = { playerId: ho.playerId, name: nameOf(ho.playerId) ?? ho.playerId, from: ho.from, after: ho.after ?? null, value: r1(c.h.C) };
        // review5 SHOULD: the hold branch's value even when the continuation is his own games
        if (c.h.C != null) add.holdValue = r1(c.h.C);
      }
      const ls = laterStarts.find((x) => x.playerId === pid);
      if (ls) add.planStart = ls;
      cards.set(pid, add);
    }
  }

  // deadlines for unlocked scores
  const deadlines = new Map();
  for (const v of info.values()) {
    if (v.kind !== "lock_or_hold") continue;
    const p = v.p;
    const own = startOf(p.remaining[0]);
    let best = { ms: own, reason: own != null ? `his next game, ${dayLabel(p.remaining[0].date)} ${tipLabel(own)}` : "before his next game", by: null };
    // a slot whose game is on is not free for a teammate tonight
    const idle = mineIn.openSlots.filter((s) => s.index !== v.slot?.index && !P.get(s.playerId)?.live);
    for (const b of P.values()) {
      if (b.pid === p.pid || desk.slots.some((s) => s.playerId === b.pid) || !b.remaining.length || b.noData) continue;
      // M3: a bench player listed Out/IR/Sus for his next game cannot want the slot then
      if (availabilityOf(statusOf(b.pid)).assumed === "listed_out") continue;
      const bs = startOf(b.remaining[0]);
      if (bs == null || (best.ms != null && bs >= best.ms) || bs <= nowMs) continue;
      const pos = b.who?.positions || [];
      if (!eligible(pos, v.slot.label)) continue;
      if (idle.some((s) => eligible(pos, s.label))) continue;
      best = { ms: bs, reason: `${nameOf(b.pid) ?? b.pid}'s game ${dayLabel(b.remaining[0].date)} ${tipLabel(bs)}, if you want that slot for him`, by: { pid: b.pid, name: nameOf(b.pid) ?? null } };
    }
    const nextInfo = [...P.values(), ...(oppFacts ? oppFacts.P.values() : [])].map((x) => startOf(x.remaining?.[0])).filter((ms) => ms != null && ms > nowMs).sort((a, b) => a - b)[0] ?? null;
    deadlines.set(p.pid, { deadline: isoEastern(best.ms), deadlineMs: best.ms, deadlineReason: best.reason, deadlineBy: best.by, infoBefore: nextInfo != null && best.ms != null && nextInfo < best.ms });
  }

  // review5 SHOULD: what each tonight chain banks against (C), own continuation or not
  const tonightC = new Map();
  for (const e of mineIn.team.slots) if (e?.kind === "start" && e.C != null) tonightC.set(e.id, { C: r1(e.C), pick: e.pick?.id ?? null });
  return { opponent, winProb, whatIf, cards, deadlines, theirsApplied, laterStarts: whatIf?.plan?.actions?.filter((a) => a.kind === "then_start") ?? [], tonightC };
}

/** Games not yet started for a player in a facts map, or null when unknown. */
function gamesLeftOf(P, pid) {
  const p = pid ? P.get(pid) : null;
  return p && !p.noData && Array.isArray(p.remaining) ? p.remaining.length : null;
}

function rankOf(rosters, rid) {
  const rows = rosters.map((r) => ({ rid: r.roster_id, w: r.settings?.wins ?? 0, f: Number(r.settings?.fpts ?? 0) + Number(r.settings?.fpts_decimal ?? 0) / 100 }));
  rows.sort((a, b) => b.w - a.w || b.f - a.f);
  const i = rows.findIndex((r) => r.rid === rid);
  return i < 0 ? null : i + 1;
}

/** This season's empty slots and zero slots per week for a roster, from past final matchups. */
function seasonSignals(pastMatchups, rid) {
  const ms = (pastMatchups || []).map((x) => (x.matchups || []).find((m) => m.roster_id === rid)).filter(Boolean);
  if (!ms.length) return { emptyPerWeek: null, zerosPerWeek: null };
  const empty = ms.reduce((t, m) => t + (m.starters || []).filter((p) => !p || p === "0").length, 0);
  const zeros = ms.reduce((t, m) => t + (m.starters || []).filter((p, i) => p && p !== "0" && (m.starters_points?.[i] ?? 0) === 0).length, 0);
  return { emptyPerWeek: empty / ms.length, zerosPerWeek: zeros / ms.length };
}

/**
 * The projected margin at which lock vs hold changes. projectedLead = opponent's projected
 * final minus mine (positive = opponent ahead). Shifting the opponent's simulated totals by
 * `shift` is the same as moving that margin by `shift`, so the threshold stays in one unit:
 * projected final points. Returns null when no shift within +-60 changes the call.
 */
// M4(c): a lead trigger is shown only if its threshold lies within +-maxMargin points of
// projected margin and the flip is resolved: on both sides of it the lock-vs-hold difference
// exceeds minSe paired standard errors (else it is simulation tail noise).
export const TRIGGER_LIMITS = Object.freeze({ maxMargin: 40, minSe: 2, sideStep: 4 });

function pairedDiff(lockT, holdT, theirs, shift) {
  const n = Math.min(lockT.length, holdT.length, theirs.length);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const t = theirs[i] + shift;
    const d = (lockT[i] > t ? 1 : lockT[i] === t ? 0.5 : 0) - (holdT[i] > t ? 1 : holdT[i] === t ? 0.5 : 0);
    s1 += d;
    s2 += d * d;
  }
  const m = s1 / n;
  return { d: m, se: Math.sqrt(Math.max(0, s2 / n - m * m) / n) };
}

/**
 * The projected margin at which the DISPLAYED action should change. projectedLead = opponent's
 * projected final minus mine (positive = opponent ahead). displayedLock: the card says lock.
 * Returns null when the win-chance lean already disagrees with the displayed action (no
 * consistent trigger to state), when no flip lies within reach, or when TRIGGER_LIMITS say
 * the flip is noise.
 */
export function leadTrigger({ lockT, holdT, theirs, projectedLead, displayedLock, limits = TRIGGER_LIMITS }) {
  const diffAt = (shift) => pairedDiff(lockT, holdT, theirs, shift).d;
  const s0 = Math.sign(diffAt(0));
  if (s0 === 0) return null;
  if ((s0 > 0) !== displayedLock) return null;
  let lo = null;
  let hi = null;
  for (let k = 1; k <= 60 && lo === null; k++) {
    for (const sh of [-k, k]) {
      if (Math.sign(diffAt(sh)) === -s0) {
        lo = sh > 0 ? sh - 1 : sh + 1;
        hi = sh;
        break;
      }
    }
  }
  if (lo === null) return null;
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(diffAt(mid)) === -s0) hi = mid;
    else lo = mid;
  }
  const shift = (lo + hi) / 2;
  const at = Math.round(projectedLead + shift);
  if (Math.abs(at) > limits.maxMargin) return null;
  const dir = Math.sign(hi - lo) || 1;
  const near = pairedDiff(lockT, holdT, theirs, shift - dir * limits.sideStep);
  const far = pairedDiff(lockT, holdT, theirs, shift + dir * limits.sideStep);
  if (!(Math.abs(near.d) > limits.minSe * near.se && Math.abs(far.d) > limits.minSe * far.se)) return null;
  const verb = displayedLock ? "Hold instead" : "Lock";
  const rising = at > projectedLead;
  const condition = at > 0
    ? `your opponent's projected lead ${rising ? "grows past" : "falls below"} ${at}`
    : at < 0
      ? `you are projected to lead by ${rising ? "less than" : "more than"} ${-at}`
      : "the projected totals draw level";
  return { kind: "opponent_lead", text: `${verb} if ${condition}`, condition, flipsTo: displayedLock ? "hold" : "lock", threshold: at, basis: "projected final margin" };
}

/**
 * M4 follow-up (SGA card: "Wait until Wed 7:30 PM" beside "Hold instead if ..."): when the
 * action is wait, nothing is decided now, so a trigger describes what flips the call made AT
 * the deadline (lock vs hold then), and says so.
 */
export function triggerForAction(t, action, deadlineMs) {
  if (action !== "wait" || !t?.condition) return t;
  const when = deadlineMs != null ? `${dayLabel(isoInZone(deadlineMs, DISPLAY_TZ).slice(0, 10))} ${tipLabel(deadlineMs)}` : null;
  const call = t.flipsTo === "hold" ? "lock" : "hold";
  return { ...t, appliesAt: "deadline", text: `At the deadline${when ? ` (${when})` : ""} the call is ${call}; it becomes ${t.flipsTo} if ${t.condition}` };
}

/** Thresholds on the inputs that would flip lock vs hold, from the same simulation. */
function waitTriggers({ c, theirs, lead, h, name, displayedLock, nextDay }) {
  const out = [];
  const lt = leadTrigger({ lockT: c.lockT, holdT: c.holdT, theirs, projectedLead: lead ?? 0, displayedLock });
  if (lt) out.push(lt);
  // M4(b): only "ruled out", which needs no rate; GTD/DTD triggers wait for a measured rate
  if (!displayedLock && h) {
    if (pWin(c.lockT, theirs) > pWin(c.holdWith(), theirs)) {
      out.push({ kind: "injury_listing", text: `Lock if ${name} is ruled out of ${nextDay}'s game`, threshold: "Out" });
    }
  }
  return out;
}

/**
 * Write the layer onto a built board (additive): desk.opponent, desk.winProb, desk.whatIf,
 * desk.history; per card: profile, availability, lean.{winProbIfLock, winProbIfHold,
 * leanBasis, pointsLean, disagrees}, decision.{deadline, deadlineReason, action, waitTriggers}.
 */
export function applyMatchupLayer(ctx) {
  const { L, desk, P, info, modelFor, dir } = ctx;
  const layer = buildMatchupLayer(ctx);
  if (ctx.baselineOnly) {
    desk.baselineSims = layer.baselineSims ?? null;
    return;
  }
  if (ctx.assume?.length) {
    const applied = [...(ctx.applied || []), ...(layer.theirsApplied || [])];
    const list = ctx.assume.filter((a) => applied.some((x) => x.side === a.side && x.slot === a.slot));
    desk.assumptions = {
      list,
      contradictsInferred: applied.filter((x) => x.contradicts).map((x) => ({ side: x.side, slot: x.slot, state: x.state, inferred: x.inferred, inferredReason: x.inferredReason })),
      text: assumeText(applied),
    };
  }
  desk.opponent = layer.opponent;
  alignTonight(desk, layer, ctx.nameOf);
  desk.winProb = layer.winProb;
  desk.whatIf = layer.whatIf;
  const today = L.today;
  const pct = (x) => `${Math.round(x * 100)}%`;
  for (const card of desk.cards) {
    const v = info.get(card.playerId);
    const p = P.get(card.playerId);
    const mdl = p && !p.noData && p.remaining[0] ? modelFor(p.pid, p.remaining[0].date) : null;
    card.profile = mdl ? boomBustProfile(mdl, p.log, today) : null;
    card.availability = mdl ? availabilityPerGame(p, mdl, dir.get(p.pid)?.injuryStatus ?? null) : null;
    const add = layer.cards.get(card.playerId) || {};
    // review4 MUST: "expected if held" is the hold branch the win chance uses; when the slot then
    // passes to another player it is that continuation's value, said so (his own games kept apart)
    if (add.holdContinuation && card.stopping) {
      const hc = add.holdContinuation;
      const own = card.stopping.expectedIfHeld;
      const x = card.stopping.x;
      const f = (n) => (Math.round(n * 10) / 10).toFixed(1);
      const k = card.stopping.k;
      const from = hc.from ? ` from ${dayLabel(hc.from)}` : "";
      card.stopping = { ...card.stopping, expectedIfHeldOwn: own, expectedIfHeldOwnLabel: OWN_LABEL, expectedIfHeld: hc.value, expectedIfHeldBasis: "slot_continuation", heldContinuation: hc };
      // review5 NICE: his games left are his; the slot's value after him is the incoming player's
      const was = `${f(x)} now against ${f(own)} expected if held, ${k} game${k === 1 ? "" : "s"} left`;
      const now = `${f(x)} now against ${f(hc.value)} expected if held: ${card.name} has ${k} game${k === 1 ? "" : "s"} left; the slot's value${from} is ${hc.after ? "his game tonight, then " : ""}${hc.name}'s`;
      if (x != null && own != null) card.lean = { ...card.lean, reason: card.lean.reason.replace(was, now), inputs: card.lean.inputs ? { ...card.lean.inputs, expectedIfHeld: hc.value, expectedIfHeldOwn: own } : card.lean.inputs };
    } else if (add.holdValue != null && card.stopping && card.stopping.expectedIfHeld != null && Math.abs(add.holdValue - card.stopping.expectedIfHeld) >= 0.05) {
      // review5 SHOULD: his own games, valued with his play chances as the win chance values them
      const own = card.stopping.expectedIfHeld;
      const x = card.stopping.x;
      const f = (n) => (Math.round(n * 10) / 10).toFixed(1);
      card.stopping = { ...card.stopping, expectedIfHeldOwn: own, expectedIfHeldOwnLabel: OWN_LABEL, expectedIfHeld: add.holdValue, expectedIfHeldBasis: "plan" };
      if (x != null) card.lean = { ...card.lean, reason: card.lean.reason.replace(`${f(x)} now against ${f(own)} expected if held`, `${f(x)} now against ${f(add.holdValue)} expected if held`), inputs: card.lean.inputs ? { ...card.lean.inputs, expectedIfHeld: add.holdValue, expectedIfHeldOwn: own } : card.lean.inputs };
    }
    // review4 MUST: a bench player the plan starts later gets that call instead of "Move into a slot"
    // review5 NICE: a starter the plan moves (or brings back) gets the call too, unless he has a lock call
    if (add.planStart && (card.role === "bench" || card.decision?.kind !== "lock_or_hold")) {
      const ps = add.planStart;
      card.decision = { ...card.decision, kind: "lineup", text: ps.text, deadlineDate: ps.from ?? card.decision.deadlineDate, planStart: ps };
    }
    honestLean(card);
    const pointsLean = card.lean.value;
    if (add.lean) {
      const winLean = add.lean.winLean;
      const disagrees = add.lean.clear && pointsLean !== "none" && pointsLean !== winLean;
      const better = winLean === "lock" ? add.lean.winProbIfLock : add.lean.winProbIfHold;
      const worse = winLean === "lock" ? add.lean.winProbIfHold : add.lean.winProbIfLock;
      const lead = add.lean.lead ?? 0;
      const situation = lead > 0 ? `your opponent is projected to win by ${Math.round(lead)}` : lead < 0 ? `you are projected to win by ${Math.round(-lead)}` : "the projected totals are level";
      const slotsLeft = desk.slotPressure?.summary?.openMax ?? null;
      const where = `${situation}${slotsLeft != null ? ` with ${slotsLeft} slots open` : ""}`;
      const byWin = WIN_LEAN.minGap != null && disagrees && better - worse >= WIN_LEAN.minGap;
      const act = winLean === "lock" ? "locking" : "holding";
      const whyBefore = card.lean.reason;
      card.lean = {
        ...card.lean,
        value: byWin ? winLean : card.lean.value,
        pointsLean,
        disagrees,
        leanBasis: byWin ? "win_probability" : "points",
        winProbIfLock: add.lean.winProbIfLock,
        winProbIfHold: add.lean.winProbIfHold,
        winProbDiffSe: add.lean.se,
        winProbDiffReal: add.lean.diffReal,
        reason: byWin
          ? `Points say ${pointsLean}, but ${where}, so ${act} raises your win chance from ${pct(worse)} to ${pct(better)}`
          : disagrees
            ? `Points say ${pointsLean}; ${act} would raise your win chance from ${pct(worse)} to ${pct(better)}, since ${where}. In backtests on this league, acting on win chance alone did not win more matchups`
            : `${card.lean.reason}; win chance ${pct(add.lean.winProbIfLock)} if you lock, ${pct(add.lean.winProbIfHold)} if you hold`,
      };
      // a lean that contradicts the card's figures keeps its explanation in front (honestLean)
      if (card.lean.basisDisagrees && (byWin || disagrees)) card.lean.reason = `${whyBefore}. ${card.lean.reason}`;
    } else {
      card.lean = { ...card.lean, pointsLean, disagrees: false, leanBasis: "points", winProbIfLock: null, winProbIfHold: null, winProbDiffSe: null, winProbDiffReal: false };
    }
    const dl = layer.deadlines.get(card.playerId);
    if (v?.kind === "lock_or_hold" && dl) {
      const status = dir.get(card.playerId)?.injuryStatus ?? null;
      const out = availabilityOf(status).assumed === "listed_out";
      let action = card.lean.value === "lock" ? (dl.infoBefore ? "wait" : "lock_now") : "hold";
      let reason = dl.deadlineReason;
      if (out) {
        // ruled out of his next game: waiting gains nothing and the score resets at that tip;
        // holding is right only when a later game exists and the model leans hold
        const later = (p?.remaining?.length ?? 0) >= 2;
        action = card.lean.value === "hold" && later ? "hold" : "lock_now";
        // the deadline can be a teammate's tip: the listing is for the holder's own next game
        reason = dl.deadlineBy
          ? `${dl.deadlineReason}; he is listed ${status} for his own next game, so an unlocked score resets to 0 when it tips`
          : `${dl.deadlineReason}; he is listed ${status} for it, so an unlocked score resets to 0 at that tip`;
      }
      card.decision = { ...card.decision, deadline: dl.deadline, deadlineReason: reason, deadlineBy: dl.deadlineBy ?? null, action, waitTriggers: action === "lock_now" ? [] : (add.triggers || []).filter((t) => !(out && t.kind === "injury_listing")).map((t) => triggerForAction(t, action, dl.deadlineMs)) };
    } else {
      card.decision = { ...card.decision, deadline: null, deadlineReason: null, deadlineBy: null, action: null, waitTriggers: [] };
    }
  }
  // history: the viewing manager's past weeks, from logs already loaded
  const logs = new Map([...P.values()].map((p) => [p.pid, p.log]));
  const hist = managerHistory({ pastMatchups: L.pastMatchups, rosterId: desk.rosterId, logs, season: L.season });
  const myOwner = (L.rosters || []).find((r) => r.roster_id === desk.rosterId)?.owner_id ?? null;
  desk.history = hist ? { ...hist, profile: profileFor(myOwner) } : null;
}

export { LEAGUE_PROFILE };
