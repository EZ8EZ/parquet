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
 * @property {number|null} bustRate
 * @property {number} boomThreshold       forecast mean + 1.5 x 7.0 (league residual SD)
 * @property {number} bustThreshold
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
 * @property {string} note
 * @property {ManagerProfile} profile
 *
 * Card additions: card.profile {BoomBust|null}; card.availability {Availability|null};
 * card.lean gains winProbIfLock, winProbIfHold (0-1|null), leanBasis "win_probability"|"points",
 * pointsLean "lock"|"hold"|"none", disagrees; card.decision gains deadline (ISO with offset),
 * deadlineReason, action "lock_now"|"wait"|"hold"|null, waitTriggers {WaitTrigger[]}.
 */
import { teamFacts } from "./team.js";
import { simulateTotals, pWin, summarise, SIM } from "./winprob.js";
import { slotWeight, eligible } from "./policy.js";
import { maxWeightAssign } from "./assign.js";
import { availabilityOf, playProbabilities } from "./availability.js";
import { profileFor, intentOf, LEAGUE_PROFILE, USE_MANAGER_IN_SIM } from "./managers.js";
import { indexTips, tipLabel } from "./tipTimes.js";
import { dayLabel } from "./calendar.js";
import { playerModel } from "./model.js";
import { boomBustProfile } from "./profile.js";
import { managerHistory } from "./history.js";

export const MATCHUP = Object.freeze({ sims: 4000, seed: SIM.seed, minSe: 2 });

// Whether the lean follows win probability. Backtest on 240 active team-weeks (2025 w1-23,
// 2026 w1-3), win-probability policy minus points policy, paired, cluster bootstrap: matchups
// won -3.75 pts of team-weeks [-7.18, -0.96] acting on any clear gap; -0.83 [-3.14, +1.24] at a
// 5-point gap; +0.42 [-0.89, +1.58] at 10 points, with points -0.60 [-1.24, -0.04]. No setting
// won more matchups, so the lean stays on points (minGap null) and P(win) is shown alongside.
export const WIN_LEAN = Object.freeze({ minGap: null, evidence: "scripts/lockin/opponent_backtest.mjs, 2026-11-24" });

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

/** ISO time with the US Eastern offset, e.g. 2026-11-26T19:00:00-05:00. */
export function isoEastern(ms) {
  if (ms == null) return null;
  const d = new Date(ms);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d).map((p) => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const off = Math.round((local - ms) / 60000);
  const sign = off < 0 ? "-" : "+";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${hh}:${mm}`;
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
  const basis = "play model (history, back-to-back, recent misses)" + (av.assumed === "not_listed_out" ? "" : ` + listing ${status}`);
  return { perGame, pAll: r3(perGame.reduce((t, g) => t * g.pPlay, 1)), n: mdl.q.nRows, basis };
}

function simPlayer(p, mdl, avail, x, extra = {}) {
  return {
    id: p.pid,
    sample: mdl.dist.sample,
    q: mdl.q.value,
    r: mdl.r,
    H: mdl.H,
    games: avail.perGame.map((g) => (g.pPlay === 0 ? { plays: false } : { plays: null, p: g.pPlay })),
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
export function teamSimInput({ slots, P, modelAt, statusOf, mode = "policy", wLocked = null, shift = 0, emptyRate = 0 }) {
  let fixed = 0;
  const riders = [];
  const riderIds = [];
  const open = [];
  const inSlot = new Set();
  for (const s of slots) {
    if (s.playerId) inSlot.add(s.playerId);
    const p = s.playerId ? P.get(s.playerId) : null;
    const rem = p && !p.noData ? p.remaining.length : 0;
    if (s.lockState === "locked" || s.lockStateReason === "final_game_score_stands" || (p && p.live)) {
      fixed += s.banked ?? 0;
      continue;
    }
    if (s.lockState === "unknown_until_next_tip" && rem > 0) {
      const mdl = modelAt(p.pid);
      const avail = availabilityPerGame(p, mdl, statusOf(p.pid));
      if (mdl && avail) {
        riders.push(simPlayer(p, mdl, avail, s.banked, { wLocked, noLock: mode === "nothing" }));
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
    const cand = [...P.values()].filter((p) => !p.noData && p.remaining.length && (!inSlot.has(p.pid) || open.some((s) => s.playerId === p.pid)));
    const weightOf = (p) => {
      const mdl = modelAt(p.pid);
      if (!mdl) return -Infinity;
      const v = slotWeight({ id: p.pid, positions: p.who?.positions || [], games: p.remaining.map((g) => ({ date: g.date, plays: null })), x: null, inSlot: false, done: false }, p.remaining[0].date, () => mdl);
      return Number.isFinite(v) ? v : -Infinity;
    };
    const w = cand.map(weightOf);
    const A = maxWeightAssign(open.map((s) => cand.map((p, j) => (eligible(p.who?.positions || [], s.label) ? w[j] : -Infinity))));
    fill = open.map((s, i) => {
      const j = A.assign[i];
      if (j < 0) return null;
      const p = cand[j];
      const mdl = modelAt(p.pid);
      const avail = availabilityPerGame(p, mdl, statusOf(p.pid));
      return mdl && avail ? simPlayer(p, mdl, avail, null) : null;
    });
  }
  return { team: { fixed, riders, slots: fill, shift, emptyRate }, riderIds, openSlots: open, occupantOf };
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
 * Build the layer. ctx: { L, desk, P, info, modelFor, dir, nameOf }.
 * Returns { opponent, winProb, whatIf, cards: Map pid -> additions, history }.
 */
export function buildMatchupLayer(ctx) {
  const { L, desk, P, info, modelFor, dir, nameOf } = ctx;
  const opts = { sims: MATCHUP.sims, seed: MATCHUP.seed };
  const statusOf = (pid) => dir.get(pid)?.injuryStatus ?? null;
  const modelAtMine = (pid) => {
    const p = P.get(pid);
    const d = p?.remaining?.[0]?.date ?? null;
    return d && !p.noData ? modelFor(pid, d) : null;
  };
  const tips = indexTips(L.tipsRaw, L.scheduleIdx);
  const startOf = (g) => (g ? (tips.get(g.gameId)?.startMs ?? null) : null);
  const nowMs = Date.parse(desk.generatedAt);

  // opponent
  const oppM = L.oppMatchup || null;
  let opponent = null;
  let theirs = null;
  let oppFacts = null;
  const users = new Map((L.users || []).map((u) => [u.user_id, u]));
  const rosterOf = (rid) => (L.rosters || []).find((r) => r.roster_id === rid) || null;
  if (oppM) {
    const ids = L.oppPlayerIds || [];
    const logsRaw = { ...(L.oppLogsRaw || {}) };
    for (const pid of ids) if (!logsRaw[pid] && L.logsRaw?.[pid]) logsRaw[pid] = L.logsRaw[pid];
    oppFacts = teamFacts({ L, ids, logsRaw, matchup: oppM, nameOf, dir });
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
    const input = teamSimInput({ slots: oppFacts.slots, P: oppFacts.P, modelAt: modelAtOpp, statusOf, mode: "policy", wLocked: simProf.unknownLockedShare, shift: simProf.pointsVsRulePerSlot, emptyRate: simProf.emptySlotRate.value });
    theirs = simulateTotals(input.team, opts);
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
      slots: oppFacts.slots.map((s) => ({ index: s.index, label: s.label, playerId: s.playerId, name: s.name, banked: s.banked, lockState: s.lockState, lockStateReason: s.lockStateReason, lockCertain: s.lockCertain })),
      playersStillToPlay: toPlay.length,
      gamesRemaining: toPlay.reduce((t, p) => t + p.remaining.length, 0),
      projectedTotal: { mean: r1(sum.mean), p10: r1(sum.p10), p90: r1(sum.p90) },
      profile: prof,
      intent,
    };
  }

  // mine
  const mineIn = teamSimInput({ slots: desk.slots, P, modelAt: modelAtMine, statusOf, mode: "policy" });
  const mine = simulateTotals(mineIn.team, opts);
  const myBanked = desk.slots.reduce((t, s) => t + (s.banked ?? 0), 0);

  const cards = new Map();
  const assumptions = [];
  let winProb = null;
  let whatIf = null;
  if (theirs) {
    const prof = USE_MANAGER_IN_SIM ? opponent.profile : profileFor(null);
    assumptions.push(
      `Opponent's scores that may already be locked count as locked with probability ${prof.unknownLockedShare}: how often such a score turned out locked in this league, 2022-2026 (n=16,047 situations).`,
      `Opponent's remaining slots play the reservation rule shifted ${prof.pointsVsRulePerSlot} points a slot (league managers against the rule, 2022-2026), with a ${Math.round(prof.emptySlotRate.value * 1000) / 10}% chance a slot ends empty; league values, because his own profile did not predict better on held-out weeks.`,
      "Your remaining slots follow the model's policy: the reservation rule, open slots filled by the best available player.",
      "Each player's score is drawn from his own recent games, his play probability from his own history and listing.",
      "Locked and final scores are fixed; a game in progress counts at its current score.",
    );
    const s1 = summarise(mine);
    const s2 = summarise(theirs);
    winProb = { now: r3(pWin(mine, theirs)), sims: MATCHUP.sims, mine: { mean: r1(s1.mean), p10: r1(s1.p10), p90: r1(s1.p90) }, theirs: { mean: r1(s2.mean), p10: r1(s2.p10), p90: r1(s2.p90) }, unknownLockWeight: prof.unknownLockedShare, assumptions };

    // The model's plan: the policy for every slot, each holder at the card's lean (lock ->
    // banked, hold -> his score resets). Baseline, plan and winProb.now are this one number.
    // Every option forces one action and keeps the plan for everything else; the card's
    // winProbIfLock / winProbIfHold are the same simulations as options lock:X / hold:X.
    const holders = mineIn.riderIds;
    const leanOf = new Map(desk.cards.map((c) => [c.playerId, c.lean?.value]));
    const planLock = new Map(holders.map((pid) => [pid, leanOf.get(pid) === "lock"]));
    const teamWith = (forced = new Map(), extra = null) => {
      let fixed = mineIn.team.fixed;
      const riders = [];
      const slots = [...mineIn.team.slots];
      holders.forEach((pid, hi) => {
        const h = mineIn.team.riders[hi];
        const act = forced.has(pid) ? forced.get(pid) : planLock.get(pid) ? "lock" : "hold";
        if (act === "lock") fixed += h.x;
        else if (act === "wait") riders.push(h);
        else if (act !== "out") slots.push({ ...h, x: null });
      });
      if (extra) extra({ riders, slots });
      return { ...mineIn.team, fixed, riders, slots };
    };
    const planT = simulateTotals(teamWith(), opts);
    const pPlan = pWin(planT, theirs);
    winProb.now = r3(pPlan);
    const sPlan = summarise(planT);
    winProb.mine = { mean: r1(sPlan.mean), p10: r1(sPlan.p10), p90: r1(sPlan.p90) };
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
      const H = addOption({ id: `hold:${pid}`, kind: "hold", playerId: pid, text: `Let ${name}'s ${r1(h.x)} go and play on` }, simulateTotals(teamWith(new Map([[pid, "hold"]])), opts));
      addOption({ id: `wait:${pid}`, kind: "wait", playerId: pid, text: `Keep ${name}'s ${r1(h.x)} and decide at the deadline` }, simulateTotals(teamWith(new Map([[pid, "wait"]])), opts));
      choice.set(pid, { lockT: L.totals, holdT: H.totals, ifLock: L.wp, ifHold: H.wp, se: deltaSe(L.totals, H.totals, theirs), h, others: mineIn.team.riders.filter((_, i) => i !== hi) });
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
      const team = teamWith(forced, ({ slots }) => {
        const si = slots.findIndex((x) => x && (x.id === outId || x.id === t.playerId));
        if (si >= 0) slots[si] = incoming;
        else slots.push(incoming);
      });
      addOption({ id: `swap:${t.playerId}:${outId}`, kind: "swap_in", playerId: t.playerId, forPlayerId: outId, slotLabel: t.slotLabel ?? null, deadline: t.at ? isoEastern(Date.parse(t.at)) : null, text: `${nameOf(t.playerId) ?? t.playerId} in for ${outId ? (nameOf(outId) ?? outId) : "the empty slot"} before ${t.listedStart ?? "his game"}` }, simulateTotals(team, opts));
    }
    options.sort((a, b) => b.delta - a.delta);
    const nothingIn = teamSimInput({ slots: desk.slots, P, modelAt: modelAtMine, statusOf, mode: "nothing" });
    const pNothing = pWin(simulateTotals(nothingIn.team, opts), theirs);
    whatIf = {
      baseline: r3(pPlan),
      baselineText: "The model's plan: its call on every slot",
      options,
      plan: { winProb: r3(pPlan), delta: 0, pointsMean: r1(sPlan.mean), text: `All of the model's calls: ${Math.round(pPlan * 100)}%` },
      doNothing: r3(pNothing),
      sims: MATCHUP.sims,
      seed: MATCHUP.seed,
      note: `Each option forces one action and keeps the model's plan for the rest. A difference under ${MATCHUP.minSe} standard errors of the paired simulation is flagged real: false.`,
    };

    // card additions
    const lead = r1((opponent?.bankedTotal ?? 0) - myBanked);
    for (const v of info.values()) {
      const pid = v.p.pid;
      const c = choice.get(pid);
      const add = {};
      if (c) {
        const winLean = c.ifLock > c.ifHold ? "lock" : "hold";
        const clear = Math.abs(c.ifLock - c.ifHold) >= Math.max(MATCHUP.minSe * c.se, 0.005);
        add.lean = { winProbIfLock: r3(c.ifLock), winProbIfHold: r3(c.ifHold), winLean, clear, se: r3(c.se), lead };
        add.triggers = waitTriggers({ c, theirs, lead, h: c.h, mineIn, opts, pid, name: nameOf(pid) ?? pid, P, modelAtMine, statusOf, nextDay: v.p.remaining[0] ? dayLabel(v.p.remaining[0].date) : null });
      }
      cards.set(pid, add);
    }
  }

  // deadlines for unlocked scores
  const deadlines = new Map();
  for (const v of info.values()) {
    if (v.kind !== "lock_or_hold") continue;
    const p = v.p;
    const own = startOf(p.remaining[0]);
    let best = { ms: own, reason: own != null ? `his next game, ${dayLabel(p.remaining[0].date)} ${tipLabel(own)}` : "before his next game" };
    const idle = mineIn.openSlots.filter((s) => s.index !== v.slot?.index);
    for (const b of P.values()) {
      if (b.pid === p.pid || desk.slots.some((s) => s.playerId === b.pid) || !b.remaining.length || b.noData) continue;
      const bs = startOf(b.remaining[0]);
      if (bs == null || (best.ms != null && bs >= best.ms) || bs <= nowMs) continue;
      const pos = b.who?.positions || [];
      if (!eligible(pos, v.slot.label)) continue;
      if (idle.some((s) => eligible(pos, s.label))) continue;
      best = { ms: bs, reason: `${nameOf(b.pid) ?? b.pid}'s game ${dayLabel(b.remaining[0].date)} ${tipLabel(bs)}, if you want that slot for him` };
    }
    const nextInfo = [...P.values(), ...(oppFacts ? oppFacts.P.values() : [])].map((x) => startOf(x.remaining?.[0])).filter((ms) => ms != null && ms > nowMs).sort((a, b) => a - b)[0] ?? null;
    deadlines.set(p.pid, { deadline: isoEastern(best.ms), deadlineMs: best.ms, deadlineReason: best.reason, infoBefore: nextInfo != null && best.ms != null && nextInfo < best.ms });
  }

  return { opponent, winProb, whatIf, cards, deadlines };
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

/** Thresholds on the inputs that would flip lock vs hold, from the same simulation. */
function waitTriggers({ c, theirs, lead, h, mineIn, opts, name, P, modelAtMine, statusOf, nextDay }) {
  const out = [];
  const lockNow = c.ifLock > c.ifHold;
  const diffAt = (shift) => {
    const t = Float64Array.from(theirs, (x) => x + shift);
    return pWin(c.lockT, t) - pWin(c.holdT, t);
  };
  // opponent lead: find the shift at which the better action changes
  let lo = -80;
  let hi = 80;
  const f0 = diffAt(0);
  if (Math.sign(diffAt(lo)) !== Math.sign(diffAt(hi))) {
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(diffAt(mid)) === Math.sign(diffAt(lo))) lo = mid;
      else hi = mid;
    }
    const shift = (lo + hi) / 2;
    const at = Math.round((lead ?? 0) + shift);
    if (Math.abs(shift) <= 60 && Math.sign(f0) !== 0) {
      const text = lockNow
        ? at > (lead ?? 0) ? `Hold instead if your opponent's lead grows past ${at}` : `Hold instead if your lead grows past ${-at}`
        : at > (lead ?? 0) ? `Lock if your opponent's lead grows past ${at}` : `Lock if your lead grows past ${-at}`;
      out.push({ kind: "opponent_lead", text, threshold: at });
    }
  }
  // injury listing for his next game
  if (!lockNow && h) {
    const p = P.get(h.id);
    const mdl = modelAtMine(h.id);
    if (p && mdl) {
      for (const listing of ["GTD", "Out"]) {
        const rate = listing === "Out" ? 0 : (availabilityOf("GTD").rate?.value ?? 0.5);
        const games = h.games.map((g, i) => (i === 0 ? (rate === 0 ? { plays: false } : { plays: null, p: rate }) : g));
        const holdT = simulateTotals({ ...mineIn.team, riders: c.others, slots: [...mineIn.team.slots, { ...h, x: null, games }] }, opts);
        if (pWin(c.lockT, theirs) > pWin(holdT, theirs)) {
          out.push({ kind: "injury_listing", text: listing === "Out" ? `Lock if ${name} is ruled out of ${nextDay}'s game` : `Lock if ${name} is listed GTD or worse for ${nextDay}'s game`, threshold: listing });
          break;
        }
      }
    }
  }
  void statusOf;
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
  desk.opponent = layer.opponent;
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
    const pointsLean = card.lean.value;
    if (add.lean) {
      const winLean = add.lean.winLean;
      const disagrees = add.lean.clear && pointsLean !== "none" && pointsLean !== winLean;
      const better = winLean === "lock" ? add.lean.winProbIfLock : add.lean.winProbIfHold;
      const worse = winLean === "lock" ? add.lean.winProbIfHold : add.lean.winProbIfLock;
      const lead = add.lean.lead ?? 0;
      const situation = lead > 0 ? `your opponent leads by ${Math.round(lead)}` : lead < 0 ? `you lead by ${Math.round(-lead)}` : "the banked totals are level";
      const slotsLeft = desk.slotPressure?.summary?.openMax ?? null;
      const where = `${situation}${slotsLeft != null ? ` with ${slotsLeft} slots open` : ""}`;
      const byWin = WIN_LEAN.minGap != null && disagrees && better - worse >= WIN_LEAN.minGap;
      const act = winLean === "lock" ? "locking" : "holding";
      card.lean = {
        ...card.lean,
        value: byWin ? winLean : card.lean.value,
        pointsLean,
        disagrees,
        leanBasis: byWin ? "win_probability" : "points",
        winProbIfLock: add.lean.winProbIfLock,
        winProbIfHold: add.lean.winProbIfHold,
        reason: byWin
          ? `Points say ${pointsLean}, but ${where}, so ${act} raises your win chance from ${pct(worse)} to ${pct(better)}`
          : disagrees
            ? `Points say ${pointsLean}; ${act} would raise your win chance from ${pct(worse)} to ${pct(better)}, since ${where}. In backtests on this league, acting on win chance alone did not win more matchups`
            : `${card.lean.reason}; win chance ${pct(add.lean.winProbIfLock)} if you lock, ${pct(add.lean.winProbIfHold)} if you hold`,
      };
    } else {
      card.lean = { ...card.lean, pointsLean, disagrees: false, leanBasis: "points", winProbIfLock: null, winProbIfHold: null };
    }
    const dl = layer.deadlines.get(card.playerId);
    if (v?.kind === "lock_or_hold" && dl) {
      const action = card.lean.value === "lock" ? (dl.infoBefore ? "wait" : "lock_now") : "hold";
      card.decision = { ...card.decision, deadline: dl.deadline, deadlineReason: dl.deadlineReason, action, waitTriggers: action === "lock_now" ? [] : add.triggers || [] };
    } else {
      card.decision = { ...card.decision, deadline: null, deadlineReason: null, action: null, waitTriggers: [] };
    }
  }
  // history: the viewing manager's past weeks, from logs already loaded
  const logs = new Map([...P.values()].map((p) => [p.pid, p.log]));
  const hist = managerHistory({ pastMatchups: L.pastMatchups, rosterId: desk.rosterId, logs, season: L.season });
  const myOwner = (L.rosters || []).find((r) => r.roster_id === desk.rosterId)?.owner_id ?? null;
  desk.history = hist ? { ...hist, profile: profileFor(myOwner) } : null;
}

export { LEAGUE_PROFILE };
