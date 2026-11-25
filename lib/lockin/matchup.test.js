import { describe, expect, it } from "vitest";
import { simulateTotals, pWin, walkPlayer, rngFrom, startChain } from "./winprob.js";
import { recalibrateBeat, BEAT_RECAL } from "./recalibrate.js";
import { intentOf, profileFor } from "./managers.js";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";
import { availabilityPerGame, isoEastern, leadTrigger, liveTonight, triggerForAction, WIN_DIFF_FLOOR, teamSimInput, TRIGGER_LIMITS } from "./matchup.js";
import { playerModel } from "./model.js";
import { projectFinal, usualMinutes, gameFractionLeft } from "./ingame.js";

const sample = Array.from({ length: 30 }, (_, i) => 30 + (i % 10) - 4.5); // mean 30, spread +-4.5
const player = (id, x = null, games = 2) => ({
  id,
  sample,
  q: 1,
  r: [NaN, 30, 31, 32, 33, 34, 35],
  H: (j, y) => (j === 0 ? y : Math.max(y, 30)),
  games: Array.from({ length: games }, () => ({ plays: true })),
  x,
});

describe("simulation", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    const team = { fixed: 50, riders: [player("a", 28)], slots: [player("b"), player("c")] };
    const a = simulateTotals(team, { sims: 500, seed: 1 });
    expect(simulateTotals(team, { sims: 500, seed: 1 })).toEqual(a);
    expect(simulateTotals(team, { sims: 500, seed: 2 })).not.toEqual(a);
  });

  it("pairs branches: removing one player leaves every other player's draws unchanged", () => {
    const with3 = simulateTotals({ fixed: 0, riders: [], slots: [player("a"), player("b"), player("c")] }, { sims: 300, seed: 9 });
    const onlyA = simulateTotals({ fixed: 0, riders: [], slots: [player("a")] }, { sims: 300, seed: 9 });
    const withoutA = simulateTotals({ fixed: 0, riders: [], slots: [player("b"), player("c")] }, { sims: 300, seed: 9 });
    for (let i = 0; i < 300; i++) expect(with3[i]).toBeCloseTo(onlyA[i] + withoutA[i], 9);
  });

  it("a DNP resets an unlocked score to 0 and an unplayed week banks 0", () => {
    const p = { ...player("d", 25), games: [{ plays: false }], H: () => 99, r: [NaN, 99] };
    expect(walkPlayer(p, rngFrom(1))).toBe(0);
    expect(walkPlayer({ ...player("e"), games: [{ plays: false }] }, rngFrom(1))).toBe(0);
  });

  it("a big lead favours locking, a big deficit favours holding, all else equal", () => {
    const base = { fixed: 100, riders: [], slots: [] };
    const h = player("h", 30, 2);
    const lock = simulateTotals({ ...base, fixed: 130 }, { sims: 2000, seed: 3 });
    const hold = simulateTotals({ ...base, slots: [{ ...h, x: null }] }, { sims: 2000, seed: 3 });
    const lead = new Float64Array(2000).fill(128);
    const deficit = new Float64Array(2000).fill(133);
    expect(pWin(lock, lead)).toBeGreaterThan(pWin(hold, lead));
    expect(pWin(hold, deficit)).toBeGreaterThan(pWin(lock, deficit));
  });
});

describe("QA regressions", () => {
  // B1 (QA, roster 14 on the recorded snapshot: 84.6% -> 64.7% after ece1971): a start for
  // tonight's game must not erase the replaced player's later games.
  it("a start keeps the replaced player's later games for the slot", () => {
    const tonightOnly = { ...player("kip", null, 1), sample: sample.map((y) => y - 10) }; // weak tonight
    const replaced = player("okafor", null, 2); // two later games
    const chain = startChain(tonightOnly, replaced);
    const withStart = simulateTotals({ fixed: 0, riders: [], slots: [chain] }, { sims: 2000, seed: 4 });
    const replacedAlone = simulateTotals({ fixed: 0, riders: [], slots: [replaced] }, { sims: 2000, seed: 4 });
    const overwritten = simulateTotals({ fixed: 0, riders: [], slots: [tonightOnly] }, { sims: 2000, seed: 4 });
    const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
    expect(mean(withStart)).toBeGreaterThanOrEqual(mean(replacedAlone) - 0.5);
    expect(mean(withStart)).toBeGreaterThan(mean(overwritten) + 5);
    expect(chain.pick.id).toBe("okafor");
  });
});

describe("QA regressions: listed-out players", () => {
  // M2 (QA, roster 6: clearing only Mobley's Out listing moved 26.6% -> 33.2%): a player listed
  // Out for his only game left is never put in an open slot ahead of a healthy player.
  const mk = (mean) => Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(1 + i).padStart(2, "0")}`, fp: mean + ((i % 5) - 2) * 3, sp: 1800, min: 30, complete: true }));
  const fact = (pid, mean, dates) => ({ pid, who: { positions: ["PF"] }, log: mk(mean), remaining: dates.map((date, i) => ({ date, gameId: `${pid}-${i}` })), live: null, noData: false });
  it("fills an open slot with the healthy player, not the star listed Out", () => {
    const P = new Map([
      ["star", fact("star", 40, ["2026-11-25"])],
      ["sub", fact("sub", 15, ["2026-11-25"])],
    ]);
    const models = new Map([...P].map(([id, p]) => [id, playerModel(p.log, p.remaining[0].date)]));
    const input = teamSimInput({ slots: [{ index: 0, label: "PF", playerId: null, banked: null, lockState: null, lockStateReason: "empty_slot" }], P, modelAt: (id) => models.get(id), statusOf: (id) => (id === "star" ? "Out" : null), mode: "policy" });
    expect(input.team.slots.map((x) => x?.id)).toEqual(["sub"]);
    const healthy = teamSimInput({ slots: [{ index: 0, label: "PF", playerId: null, banked: null, lockState: null, lockStateReason: "empty_slot" }], P, modelAt: (id) => models.get(id), statusOf: () => null, mode: "policy" });
    expect(healthy.team.slots.map((x) => x?.id)).toEqual(["star"]);
  });
});

describe("QA regressions: listed-out bench players", () => {
  // M3 (QA, roster 4: "Paolo Banchero's game ..." set a deadline while Banchero was Out):
  // a bench player listed Out neither sets a deadline nor is suggested tonight.
  it("Hal Pruitt listed Out stops setting deadlines and is not suggested", async () => {
    const before = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, now: FIXTURE_NOW, fetchJson: fixtureFetchJson });
    expect(before.cards.some((c) => /Hal Pruitt/.test(c.decision.deadlineReason || ""))).toBe(true);
    const outFetch = async (url, opts) => {
      const d = await fixtureFetchJson(url, {});
      if (url.endsWith("/v1/players/nba")) d.lk08.injury_status = "Out";
      return opts?.schema ? opts.schema.parse(d) : d;
    };
    const after = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, now: FIXTURE_NOW, fetchJson: outFetch });
    expect(after.cards.some((c) => /Hal Pruitt/.test(c.decision.deadlineReason || ""))).toBe(false);
    expect(after.tonight.timeline.some((t) => t.playerId === "lk08" && (t.kind === "start" || t.kind === "swap_check"))).toBe(false);
  });
});

describe("QA regressions: triggers", () => {
  const Y = Array.from({ length: 30 }, (_, i) => 10 + (i * 40) / 29);
  const holdT = Float64Array.from({ length: 900 }, (_, i) => 100 + Y[i % 30]);
  const lockT = new Float64Array(900).fill(135);
  // M4(a) (QA: "Hold instead if ..." on cards that already said hold): wording follows the
  // displayed action, and a win-chance lean that disagrees with it gives no trigger
  it("a hold card never says 'Hold instead'; a disagreeing win-chance lean gives no trigger", () => {
    const trailing = new Float64Array(900).fill(140); // win-chance lean: hold
    expect(leadTrigger({ lockT, holdT, theirs: trailing, projectedLead: 10, displayedLock: false }).text).toMatch(/^Lock if /);
    expect(leadTrigger({ lockT, holdT, theirs: trailing, projectedLead: 10, displayedLock: true })).toBeNull();
  });
  // M4(c) (QA: thresholds of 104, 77, 68, 65 from tail noise)
  it("suppresses thresholds beyond the margin limit and flips lost in noise", () => {
    expect(TRIGGER_LIMITS.maxMargin).toBe(40);
    const trailing = new Float64Array(900).fill(140);
    expect(leadTrigger({ lockT, holdT, theirs: trailing, projectedLead: 60, displayedLock: false })).toBeNull();
    const r = rngFrom(11);
    const noisyLock = Float64Array.from({ length: 900 }, () => 130 + r() * 2);
    const noisyHold = Float64Array.from({ length: 900 }, () => 130 + r() * 2);
    expect(leadTrigger({ lockT: noisyLock, holdT: noisyHold, theirs: new Float64Array(900).fill(131), projectedLead: 1, displayedLock: true })).toBeNull();
  });
  // M4 follow-up (SGA card: "Wait until Wed 7:30 PM" beside "Hold instead if your opponent's
  // projected lead grows past 45"): with action wait, the trigger names the deadline call it flips
  it("on a wait card, describes what flips the call made at the deadline", () => {
    const t = leadTrigger({ lockT, holdT, theirs: new Float64Array(900).fill(120), projectedLead: 5, displayedLock: true });
    expect(t.text).toMatch(/^Hold instead if your opponent's projected lead grows past \d+$/);
    const wed730 = Date.parse("2026-11-26T00:30:00Z"); // Wed 7:30 PM ET
    const w = triggerForAction(t, "wait", wed730);
    expect(w.text).toBe(`At the deadline (Wed 7:30 PM ET) the call is lock; it becomes hold if ${t.condition}`);
    expect(w).toMatchObject({ appliesAt: "deadline", flipsTo: "hold", threshold: t.threshold });
    expect(triggerForAction(t, "hold", wed730)).toBe(t);
  });
  // M4(b): no GTD/DTD triggers until a listed-play rate is measured
  it("never words a trigger on a GTD or DTD listing", async () => {
    const d = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, now: FIXTURE_NOW, fetchJson: fixtureFetchJson });
    const texts = d.cards.flatMap((c) => (c.decision.waitTriggers || []).map((t) => t.text));
    expect(texts.some((t) => /GTD|DTD/.test(t))).toBe(false);
  });
});

describe("audit fixes on the fixture", () => {
  const build = () => buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, now: FIXTURE_NOW, fetchJson: fixtureFetchJson });

  it("a player listed Out for his next game is never told to wait; Cal Rivers locks now", async () => {
    const d = await build();
    const cal = d.cards.find((c) => c.playerId === "lk03");
    expect(cal.injury.status).toBe("Out");
    expect(cal.decision.action).toBe("lock_now");
    expect(cal.decision.deadlineReason).toMatch(/listed Out/);
    expect(cal.decision.waitTriggers).toEqual([]);
    for (const c of d.cards) if (/^(out|ir|suspension|suspended|inactive)$/i.test(c.injury?.status || "")) expect(c.decision.action).not.toBe("wait");
  });

  it("every move Tonight recommends is in the plan, and the plan scores it", async () => {
    const d = await build();
    const moves = d.tonight.timeline.filter((t) => t.kind === "start" || t.kind === "swap_check");
    expect(moves.length).toBeGreaterThan(0);
    for (const t of moves) {
      const a = d.whatIf.plan.actions.find((x) => x.playerId === t.playerId && x.kind === t.kind);
      expect(a).toBeTruthy();
    }
    for (const t of moves.filter((x) => x.kind === "start")) {
      const opt = d.whatIf.options.find((o) => o.id === `swap:${t.playerId}:${t.replacesPlayerId ?? null}`);
      expect(opt.delta).toBe(0);
    }
  });

  it("lock and hold numbers are computed per player: lock equals the plan when the plan locks him, holds differ", async () => {
    const d = await build();
    const cards = d.cards.filter((c) => c.lean.winProbIfLock != null);
    for (const c of cards) {
      const planLocks = d.whatIf.plan.actions.find((a) => a.playerId === c.playerId)?.kind === "lock";
      if (planLocks) expect(c.lean.winProbIfLock).toBe(d.whatIf.baseline);
    }
    const holds = cards.map((c) => c.lean.winProbIfHold);
    expect(new Set(holds).size).toBe(holds.length);
  });

  it("flags a lock-vs-hold difference as meaningful only above 2 SE and the 5-point floor", async () => {
    const d = await build();
    for (const c of d.cards.filter((x) => x.lean.winProbIfLock != null)) {
      const gap = Math.abs(c.lean.winProbIfLock - c.lean.winProbIfHold);
      expect(c.lean.winProbDiffSe).toBeGreaterThanOrEqual(0);
      expect(c.lean.winProbDiffReal).toBe(gap > 2 * c.lean.winProbDiffSe + 1e-9 && gap >= WIN_DIFF_FLOOR - 1e-9);
    }
    const none = d.cards.find((x) => x.lean.winProbIfLock == null);
    expect(none.lean.winProbDiffReal).toBe(false);
  });

  it("returns one display zone and every ISO time carries its offset", async () => {
    const d = await build();
    expect(d.displayTz).toBe("America/New_York");
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-0[45]:00$/;
    const times = [
      ...d.tonight.timeline.map((t) => t.at).filter(Boolean),
      ...d.tonight.tips.map((t) => t.at),
      ...d.cards.map((c) => c.decision.deadline).filter(Boolean),
      ...d.whatIf.options.map((o) => o.deadline).filter(Boolean),
    ];
    expect(times.length).toBeGreaterThan(3);
    for (const t of times) expect(t).toMatch(iso);
  });
});

describe("opponent-lead trigger", () => {
  // my hold branch: 100 + Y, Y spread 10..50 (mean 30); locking banks 35 -> 135
  const Y = Array.from({ length: 30 }, (_, i) => 10 + (i * 40) / 29);
  const holdT = Float64Array.from({ length: 900 }, (_, i) => 100 + Y[i % 30]);
  const lockT = new Float64Array(900).fill(135);

  it("trailing: names the projected lead at which locking becomes the better call", () => {
    const theirs = new Float64Array(900).fill(140); // projected 140 vs my 130: opponent +10
    const t = leadTrigger({ lockT, holdT, theirs, projectedLead: 10, displayedLock: false });
    expect(t).toMatchObject({ kind: "opponent_lead", threshold: 5, basis: "projected final margin" });
    expect(t.text).toBe("Lock if your opponent's projected lead falls below 5");
  });

  it("leading: names where holding would become the better call, in the manager's terms", () => {
    const theirs = new Float64Array(900).fill(120); // projected 120 vs my 135: I lead by 15
    const t = leadTrigger({ lockT, holdT, theirs, projectedLead: -15, displayedLock: true });
    expect(t.threshold).toBe(0);
    expect(t.text).toBe("Hold instead if the projected totals draw level");
    const ahead = leadTrigger({ lockT, holdT, theirs, projectedLead: -25, displayedLock: true });
    expect(ahead.text).toBe("Hold instead if you are projected to lead by less than 10");
  });
});

describe("recalibration", () => {
  it("is monotone, keeps 0 at 0, and applies the fitted map", () => {
    expect(recalibrateBeat(0)).toBe(0);
    expect(recalibrateBeat(null)).toBeNull();
    expect(recalibrateBeat(0.6)).toBeGreaterThan(recalibrateBeat(0.4));
    const expected = 1 / (1 + Math.exp(-(BEAT_RECAL.a + BEAT_RECAL.b * Math.log(0.5 / 0.5))));
    expect(recalibrateBeat(0.5)).toBeCloseTo(expected, 9);
  });
});

describe("profiles and intent", () => {
  it("falls back to the fitted league profile for an unknown owner", () => {
    const p = profileFor("nobody");
    expect(p.source).toBe("league");
    expect(p.shrinkage).toBe(1);
    expect(p.unknownLockedShare).toBeGreaterThan(0);
  });

  it("reads intent from evidence and phrases it as play, not a label", () => {
    const a = intentOf({ wins: 9, losses: 1, rank: 1, weeksPlayed: 10 });
    expect(a.label).toBe("contending");
    const b = intentOf({ wins: 1, losses: 9, rank: 14, weeksPlayed: 10, emptyPerWeek: 1.5 });
    expect(b.label).toBe("rebuilding");
    expect(b.text).toMatch(/^playing like a rebuild, based on /);
    expect(b.evidence.length).toBeGreaterThan(1);
  });
});

describe("opponent and what-if on the fixture", () => {
  const build = () => buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, now: FIXTURE_NOW, fetchJson: fixtureFetchJson });

  it("reads the opponent's slots with the same lock inference", async () => {
    const d = await build();
    const st = d.opponent.slots.map((s) => [s.lockState, s.lockStateReason]);
    expect(st).toEqual([
      ["locked", "banked_matches_earlier_game"],
      ["locked", "banked_matches_earlier_game"],
      ["unknown_until_next_tip", "banked_equals_latest_game"],
      ["reset", "latest_game_dnp"],
      [null, "no_game_yet"],
      [null, "final_game_score_stands"],
      [null, "empty_slot"],
    ]);
    expect(d.opponent).toMatchObject({ rosterId: 2, teamName: "Synthetic Sixers", bankedTotal: 131.5 });
    expect(d.opponent.projectedTotal.p10).toBeLessThan(d.opponent.projectedTotal.p90);
  });

  it("whatIf's lock and hold options are the card's win probabilities; baseline is the plan", async () => {
    const d = await build();
    expect(d.whatIf.baseline).toBe(d.whatIf.plan.winProb);
    expect(d.whatIf.baseline).toBe(d.winProb.now);
    for (const c of d.cards.filter((x) => x.lean.winProbIfLock != null)) {
      expect(d.whatIf.options.find((o) => o.id === `lock:${c.playerId}`).winProb).toBe(c.lean.winProbIfLock);
      expect(d.whatIf.options.find((o) => o.id === `hold:${c.playerId}`).winProb).toBe(c.lean.winProbIfHold);
    }
    const sorted = d.whatIf.options.map((o) => o.delta);
    expect([...sorted].sort((a, b) => b - a)).toEqual(sorted);
  });

  it("deadlines are ISO times with the Eastern offset", async () => {
    const d = await build();
    const c = d.cards.find((x) => x.playerId === "lk02");
    expect(c.decision.deadline).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-0[45]:00$/);
    expect(["lock_now", "wait", "hold"]).toContain(c.decision.action);
    expect(isoEastern(Date.parse("2026-11-13T00:30:00Z"))).toBe("2026-11-12T19:30:00-05:00");
  });
});

describe("QA regressions: games in progress", () => {
  // M7 (QA, roster 6: Suggs at 0 points 5 minutes in moved the win chance 26.6% -> 17.6%, his 0
  // counted as final). A game in progress counts at the in-game projection, not the score so far.
  const log = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(1 + i).padStart(2, "0")}`, fp: 30 + ((i % 5) - 2) * 4, sp: 1800, min: 30, complete: true }));
  const live = { gameId: "g1", date: "2026-11-24", status: "in_game", row: { fp: 0, sp: 300 } };
  const P = new Map([["sg", { pid: "sg", who: { positions: ["SG"] }, log, remaining: [], live, noData: false }]]);
  const slot = { index: 0, label: "SG", playerId: "sg", banked: 0, lockState: "in_progress", lockStateReason: "game_in_progress" };
  const m = playerModel(log, live.date);
  const liveAt = (p) => {
    const pr = projectFinal({ fpSoFar: p.live.row.fp, secondsSoFar: p.live.row.sp, gameFractionLeft: gameFractionLeft({ status: "in_game", periods: 1 }), pregameMean: m.dist.mean, pregameSd: m.dist.sd, usualMinutes: usualMinutes(log, live.date).minutes });
    return { mean: pr.mean, sd: pr.sd };
  };
  it("draws tonight's final from the projection, so 0 points 5 minutes in is not a final 0", () => {
    const input = teamSimInput({ slots: [slot], P, modelAt: () => null, statusOf: () => null, liveAt });
    expect(input.team.fixed).toBe(0);
    expect(input.team.live.map((x) => x.id)).toEqual(["sg"]);
    const t = simulateTotals(input.team, { sims: 4000, seed: 7 });
    const mean = t.reduce((a, b) => a + b, 0) / t.length;
    // 30 a game over 30 minutes, 7/8 of regulation left: about 26 expected
    expect(mean).toBeGreaterThan(24);
    expect(mean).toBeLessThan(28.5);
    const theirs = new Float64Array(4000).fill(20);
    expect(pWin(t, theirs)).toBeGreaterThan(0.6);
    // without a projection it falls back to the current score and reports how many did
    const bare = teamSimInput({ slots: [slot], P, modelAt: () => null, statusOf: () => null });
    expect(bare.liveAtCurrent).toBe(1);
    expect(pWin(simulateTotals(bare.team, { sims: 4000, seed: 7 }), theirs)).toBe(0);
  });
});

describe("QA regressions: availability basis", () => {
  // MINOR 4: a GTD/DTD listing with no measured play rate changes nothing, so the basis must not
  // claim "+ listing"; an Out listing sets the next game to 0 and says so.
  const log = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(1 + i).padStart(2, "0")}`, fp: 30, sp: 1800, min: 30, complete: true }));
  const p = { pid: "a", log, remaining: [{ date: "2026-11-25" }, { date: "2026-11-27" }] };
  const mdl = playerModel(log, "2026-11-25");
  it("names the listing only when it changed a value", () => {
    const plain = availabilityPerGame(p, mdl, null);
    const gtd = availabilityPerGame(p, mdl, "GTD");
    expect(gtd.perGame).toEqual(plain.perGame);
    expect(gtd.basis).not.toMatch(/listing/);
    const out = availabilityPerGame(p, mdl, "Out");
    expect(out.perGame[0].pPlay).toBe(0);
    expect(out.basis).toMatch(/\+ listing Out$/);
  });
});

describe("QA round 3: a game on before his log has tonight's row", () => {
  // B-live (QA, 2026-11-25 00:22Z, roster 7 read "0% to win, projected 99"): the schedule says
  // in_game before the log has the row, and the slot was fixed at its current score with his later
  // games dropped. Replay with tonight's rows removed: r7 49.5% -> 0.1%, r12 93.1% -> 67%, r6 48.6% -> 19.1%.
  const log = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(1 + i).padStart(2, "0")}`, fp: 30 + ((i % 5) - 2) * 4, sp: 1800, min: 30, complete: true }));
  const m = playerModel(log, "2026-11-24");
  const mLater = playerModel(log, "2026-11-26");
  const fact = (row) => ({ pid: "pg", who: { positions: ["PG"] }, log, remaining: [{ date: "2026-11-26", gameId: "g2" }], live: { gameId: "g1", date: "2026-11-24", status: "in_game", row }, noData: false });
  const slot = { index: 0, label: "PG", playerId: "pg", banked: 0, lockState: null, lockStateReason: "first_game_in_progress" };
  const liveAt = (p) => liveTonight(p, m, { status: "in_game", periods: null });
  it("liveTonight: projection with a row, the pre-game forecast without one, null without a model", () => {
    expect(liveTonight(fact(null), m, null)).toEqual({ mean: m.dist.mean, sd: m.dist.sd, basis: "pregame" });
    expect(liveTonight(fact({ fp: 12, sp: 600 }), m, null).basis).toBe("projection");
    expect(liveTonight(fact(null), null, null)).toBeNull();
    // no usual minutes (no played games): pre-game, raised to the points showing
    const thin = { ...fact({ fp: 45, sp: 1500 }), log: [] };
    expect(liveTonight(thin, m, null)).toMatchObject({ mean: 45, basis: "pregame" });
  });
  const run = (row) => {
    const P = new Map([["pg", fact(row)]]);
    const input = teamSimInput({ slots: [slot], P, modelAt: () => mLater, statusOf: () => null, liveAt });
    const t = simulateTotals(input.team, { sims: 6000, seed: 3 });
    return { input, mean: t.reduce((a, b) => a + b, 0) / t.length, t };
  };
  it("counts tonight at his pre-game forecast and keeps his later game and the lock rule", () => {
    const noRow = run(null);
    expect(noRow.input.team.fixed).toBe(0);
    expect(noRow.input.livePregame).toBe(1);
    expect(noRow.input.liveAtCurrent).toBe(0);
    expect(noRow.input.team.live[0].games).toHaveLength(1);
    // one game at ~30 then the rule over one more: above a single game's mean, never ~0
    expect(noRow.mean).toBeGreaterThan(30);
  });
  it("matches the projected-live path at the tip (row with 0 seconds) within simulation noise", () => {
    const noRow = run(null);
    const atTip = run({ fp: 0, sp: 0 });
    expect(atTip.input.livePregame).toBe(0);
    expect(Math.abs(noRow.mean - atTip.mean)).toBeLessThan(0.5);
    const theirs = new Float64Array(6000).fill(32);
    expect(Math.abs(pWin(noRow.t, theirs) - pWin(atTip.t, theirs))).toBeLessThan(0.02);
  });
});
