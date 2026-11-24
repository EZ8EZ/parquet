import { describe, expect, it } from "vitest";
import { simulateTotals, pWin, walkPlayer, rngFrom, startChain } from "./winprob.js";
import { recalibrateBeat, BEAT_RECAL } from "./recalibrate.js";
import { intentOf, profileFor } from "./managers.js";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";
import { isoEastern, leadTrigger, WIN_DIFF_FLOOR } from "./matchup.js";

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
    const t = leadTrigger({ lockT, holdT, theirs, projectedLead: 10, lockNow: false });
    expect(t).toMatchObject({ kind: "opponent_lead", threshold: 5, basis: "projected final margin" });
    expect(t.text).toBe("Lock if your opponent's projected lead falls below 5");
  });

  it("leading: names where holding would become the better call, in the manager's terms", () => {
    const theirs = new Float64Array(900).fill(120); // projected 120 vs my 135: I lead by 15
    const t = leadTrigger({ lockT, holdT, theirs, projectedLead: -15, lockNow: true });
    expect(t.threshold).toBe(0);
    expect(t.text).toBe("Hold instead if the projected totals draw level");
    const ahead = leadTrigger({ lockT, holdT, theirs, projectedLead: -25, lockNow: true });
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
