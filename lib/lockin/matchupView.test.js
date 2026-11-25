import { describe, expect, it } from "vitest";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";
import {
  actionView,
  assumptionLines,
  availabilityView,
  avatarProps,
  bandScale,
  basisLine,
  habitView,
  historyView,
  intentLine,
  matchupView,
  oppSlotKey,
  profileView,
  reasonWithoutTime,
  recordText,
  stillToPlayText,
  whatIfView,
  whenText,
  winCompare,
  callRows,
  startRows,
  heldNote,
  callHeadline,
  tonightLine,
  roughen,
  BEAT_NOTE,
} from "./matchupView.js";
import { gapLines } from "./view.js";

const desk = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, fetchJson: fixtureFetchJson, now: FIXTURE_NOW });
const card = (id) => desk.cards.find((c) => c.playerId === id);

function numbers(o, out = []) {
  if (typeof o === "number") out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => numbers(x, out));
  else if (o && typeof o === "object") Object.values(o).forEach((v) => numbers(v, out));
  return out;
}
const allFinitePct = (o) => numbers(o).every((n) => Number.isFinite(n) && n >= 0 && n <= 100);

describe("matchupView", () => {
  it("is null off a board and 'none' without an opponent", () => {
    expect(matchupView({ status: "between_weeks" })).toBeNull();
    expect(matchupView({ ...desk, opponent: null })).toEqual({ state: "none" });
  });

  it("leads with the engine's win probability and both banked totals", () => {
    const v = matchupView(desk, { me: { name: "Parquet Kings" } });
    expect(v.state).toBe("win");
    expect(v.winPct).toBe(`${Math.round(desk.winProb.now * 100)}%`);
    expect(v.me.name).toBe("Parquet Kings");
    expect(v.me.banked).toBe(154);
    expect(v.them.banked).toBe(desk.opponent.bankedTotal);
    expect(v.them.name).toBe(desk.opponent.teamName);
    expect(v.them.record).toBe(recordText(desk.opponent.record));
    expect(v.oppSlots).toHaveLength(7);
    expect(v.oppSlots.every((s) => s.key !== "unresolved")).toBe(true);
    expect(allFinitePct(v.scale.rows)).toBe(true);
    expect(allFinitePct(v.scale.ticks.map((t) => t.pct))).toBe(true);
  });

  it("falls back to the points view when winProb is null", () => {
    const v = matchupView({ ...desk, winProb: null });
    expect(v.state).toBe("points");
    expect(v.winPct).toBeNull();
    expect(v.me.range).toBeNull();
    // their range still comes from opponent.projectedTotal
    expect(v.them.range.mean).toBe(desk.opponent.projectedTotal.mean);
    expect(v.scale.rows[0]).toBeNull();
  });

  it("never draws a reversed, NaN or missing range", () => {
    expect(bandScale([null, null])).toBeNull();
    expect(bandScale([{ mean: NaN, p10: 1, p90: 2 }, { mean: 5, p10: 9, p90: 1 }])).toBeNull();
    const s = bandScale([{ mean: 10, p10: 10, p90: 10 }, null]);
    expect(allFinitePct(s.rows)).toBe(true);
    expect(s.rows[1]).toBeNull();
  });
});

describe("opponent slots and sheet lines", () => {
  it("maps contract lock states onto the board's state keys", () => {
    expect(oppSlotKey({ playerId: null })).toBe("empty");
    expect(oppSlotKey({ playerId: "x", lockState: "locked", lockCertain: true })).toBe("locked");
    expect(oppSlotKey({ playerId: "x", lockState: "locked", lockCertain: false })).toBe("unknown");
    expect(oppSlotKey({ playerId: "x", lockState: null, lockStateReason: "final_game_score_stands" })).toBe("final");
    expect(oppSlotKey({ playerId: "x", lockState: null, lockStateReason: "no_game_yet" })).toBe("yet");
    expect(oppSlotKey({ playerId: "x", lockState: "something new" })).toBe("unresolved");
  });

  it("formats a record object", () => {
    expect(recordText({ wins: 8, losses: 3, ties: 0 })).toBe("8-3");
    expect(recordText({ wins: 8, losses: 3, ties: 1 })).toBe("8-3-1");
    expect(recordText({ wins: null, losses: 3 })).toBeNull();
    expect(recordText("7-4")).toBe("7-4");
  });

  it("phrases the unknown-lock weight plainly and keeps the engine's assumptions", () => {
    const lines = assumptionLines(desk.winProb);
    expect(lines[0]).toBe(desk.winProb.assumptions[0]);
    expect(lines).toContain(`A score equal to his latest game is treated as locked ${Math.round(desk.winProb.unknownLockWeight * 100)}% of the time, the rate seen in past weeks.`);
    expect(assumptionLines(null)).toEqual([]);
  });

  it("lists who is still to play when given names, else the count", () => {
    expect(stillToPlayText({ playersStillToPlay: 5, gamesRemaining: 9 }).line).toBe("5 players still to play, 9 games left");
    expect(stillToPlayText({ playersStillToPlay: ["A", { name: "B" }] }).names).toEqual(["A", "B"]);
    expect(stillToPlayText({}).line).toMatch(/unknown/);
  });

  it("reads an avatar URL as a team logo and anything else as an avatar id", () => {
    expect(avatarProps("https://x/y.png")).toEqual({ avatarId: null, teamLogoUrl: "https://x/y.png" });
    expect(avatarProps("abc123")).toEqual({ avatarId: "abc123", teamLogoUrl: null });
    expect(avatarProps(null)).toEqual({ avatarId: null, teamLogoUrl: null });
  });
});

describe("decision card", () => {
  it("compares win chances with the gain in points of win chance", () => {
    const c = card("lk02");
    const w = winCompare(c, desk.winProb);
    expect(w.lockPct).toBe(`${Math.round(c.lean.winProbIfLock * 100)}%`);
    expect(w.holdPct).toBe(`${Math.round(c.lean.winProbIfHold * 100)}%`);
    expect(w.gainText).toBe(`+${Math.round(Math.abs(c.lean.winProbIfLock - c.lean.winProbIfHold) * 100)} pts of win chance`);
    expect(w.disagree).toBeNull();
    expect(winCompare(card("lk07"), desk.winProb)).toBeNull();
  });

  it("greys a pair inside the engine's noise and calibration floor, and names win chance as rough", () => {
    const lean = { value: "hold", reason: "x", winProbIfLock: 0.24, winProbIfHold: 0.27, winProbDiffReal: false, winProbDiffSe: 0.021 };
    expect(winCompare({ lean })).toMatchObject({ real: false, se: 0.021 });
    expect(winCompare({ lean: { ...lean, winProbDiffReal: true } }).real).toBe(true);
    expect(roughen("24.5 now; win chance 24% if you lock, 27% if you hold")).toBe("24.5 now; rough win chance 24% if you lock, 27% if you hold");
    expect(roughen("Rough win chance 30%")).toBe("Rough win chance 30%");
    expect(BEAT_NOTE).not.toMatch(/high|low|over-?states|under-?states/i);
  });

  it("shows the engine's reason as written when win chance and the points lean disagree", () => {
    const c = { lean: { value: "lock", reason: "Win chance favours holding; acting on win chance alone has not won more matchups here", winProbIfLock: 0.3, winProbIfHold: 0.34, pointsLean: "lock", disagrees: true } };
    expect(winCompare(c).disagree).toBe("Rough win chance favours holding; acting on win chance alone has not won more matchups here.");
    expect(winCompare({ lean: { ...c.lean, disagrees: false } }).disagree).toBeNull();
    expect(winCompare({ lean: { ...c.lean, winProbIfLock: 0.343 } }).gainText).toBe("under 1 pt of win chance");
  });

  it("builds the boom/bust bar inside 0-100 with n", () => {
    const v = profileView(card("lk02").profile, { x: 31.5 });
    expect(v.ok).toBe(true);
    expect(v.nText).toBe("last 30 games");
    expect(v.boom.text).toMatch(/^Boom \d+%$/);
    expect(allFinitePct(v.pos)).toBe(true);
    expect(v.pos.lo).toBeLessThanOrEqual(v.pos.mid);
    expect(v.pos.mid).toBeLessThanOrEqual(v.pos.hi);
    expect(profileView(null).ok).toBe(false);
    expect(profileView({ p10: 5, p50: 3, p90: 9 }).ok).toBe(false);
  });

  it("shows availability per remaining game and for all of them", () => {
    const v = availabilityView(card("lk02"));
    expect(v.games.length).toBe(card("lk02").gamesLeft);
    expect(v.games[0].day).toBe("Sat");
    expect(v.allPct).toMatch(/%$/);
    expect(availabilityView({})).toBeNull();
    expect(availabilityView(card("lk03")).games[0].pct).toBe("0%");
  });

  it("shows an uncertain listing as the listing, never a listed-play rate", () => {
    const c = { injury: { status: "GTD" }, weekGames: [], availability: { perGame: [{ date: "2026-11-25", pPlay: 0.5 }, { date: "2026-11-27", pPlay: 0.9 }], pAll: 0.45, n: 40 } };
    const v = availabilityView(c);
    expect(v.games[0].pct).toBe("listed GTD");
    expect(v.games[0].value).toBeNull();
    expect(v.games[1].pct).toBe("90%");
    expect(v.allPct).toBeNull();
  });

  it("turns the decision action into the model's call with its triggers", () => {
    const wait = actionView(card("lk06"));
    expect(wait.title).toBe("Wait until");
    expect(wait.whenFallback).toBe(whenText(card("lk06").decision.deadline));
    expect(wait.reason).toBe("Hal Pruitt's game, if you want that slot for him");
    // triggers depend on the model (QA M4 limits suppress noisy ones); only their shape is pinned here
    expect(wait.triggers.every((t) => ["opponent_lead", "injury_listing"].includes(t.kind))).toBe(true);
    expect(actionView({ decision: { action: "lock_now" } }).title).toBe("Lock now");
    expect(actionView({ decision: { action: "hold" } }).title).toBe("Hold");
    expect(actionView({ decision: { kind: "lineup", action: null } })).toBeNull();
    expect(whenText("not a date")).toBeNull();
    expect(whenText("2026-11-13T19:30:00-05:00")).toBe("Fri 7:30 PM");
  });

  it("shows only the flip under a wait headline, not the engine's full deadline sentence", () => {
    const t = {
      kind: "opponent_lead",
      appliesAt: "deadline",
      flipsTo: "hold",
      condition: "your opponent's projected lead grows past 45",
      text: "At the deadline (Wed 7:30 PM) the call is lock; it becomes hold if your opponent's projected lead grows past 45",
    };
    const v = actionView({ decision: { action: "wait", deadline: "2026-11-25T19:30:00-05:00", waitTriggers: [t] } });
    expect(v.triggers[0].text).toBe("Hold instead if your opponent's projected lead grows past 45");
    const hold = actionView({ decision: { action: "hold", waitTriggers: [{ kind: "opponent_lead", text: "Lock if you are projected to lead by more than 8" }] } });
    expect(hold.triggers[0].text).toBe("Lock if you are projected to lead by more than 8");
  });

  it("drops only the clock time from the engine's deadline reason", () => {
    expect(reasonWithoutTime("his next game, Fri 7:30 PM ET")).toBe("his next game");
    expect(reasonWithoutTime("Hal Pruitt's game Thu 9:30 PM ET, if you want that slot for him")).toBe("Hal Pruitt's game, if you want that slot for him");
    expect(reasonWithoutTime("before his next game")).toBe("before his next game");
    expect(reasonWithoutTime(null)).toBeNull();
  });
});

describe("what moves your win chance", () => {
  it("puts real differences first by win chance and the rest last", () => {
    const v = whatIfView(desk);
    expect(v.basePct).toBe(`${Math.round(desk.whatIf.baseline * 100)}%`);
    const noise = v.rows.findIndex((r) => r.noise);
    expect(noise).toBeGreaterThan(0);
    expect(v.rows.slice(noise).every((r) => r.noise)).toBe(true);
    // rows above the plan lead
    const firstNotAbove = v.rows.findIndex((r) => !r.above);
    expect(v.rows.slice(firstNotAbove).every((r) => !r.above)).toBe(true);
    expect(v.rows.find((r) => r.noise).deltaText).toBe("no real difference");
    expect(v.headline).toBe(`Rough win chance if you follow the model's calls: ${Math.round((desk.whatIf.plan?.winProb ?? desk.whatIf.baseline) * 100)}%`);
    for (const r of v.rows) if (r.bar) expect(allFinitePct(r.bar)).toBe(true);
  });

  it("orders deviations from the plan: any above it, then the costliest, then noise", () => {
    const w = {
      baseline: 0.46,
      plan: { winProb: 0.46, delta: 0 },
      doNothing: { winProb: 0.02 },
      options: [
        { id: "hold", winProb: 0.43, delta: -3, real: true, text: "Hold A instead of locking" },
        { id: "noise", winProb: 0.46, delta: 0.2, real: false, text: "Lock B" },
        { id: "up", winProb: 0.48, delta: 2, real: true, text: "Swap C in" },
        { id: "big", winProb: 0.3, delta: -16, real: true, text: "Let D go" },
      ],
    };
    const v = whatIfView({ whatIf: w });
    expect(v.rows.map((r) => r.id)).toEqual(["up", "big", "hold", "noise"]);
    expect(v.rows[0].above).toBe(true);
    expect(v.rows[1].deltaText).toBe("−16");
    expect(v.above).toBe(1);
    expect(v.followPct).toBe("46%");
    expect(v.doNothingPct).toBe("2%");
  });

  it("keeps each player's best option once on Home", () => {
    const v = whatIfView(desk, { limit: 3, distinct: true });
    expect(v.rows).toHaveLength(3);
    expect(new Set(v.rows.map((r) => r.playerId)).size).toBe(3);
    expect(whatIfView({ whatIf: null })).toBeNull();
  });

  it("signs the change, rounds it and uses a true minus", () => {
    const v = whatIfView({ whatIf: { baseline: 0.5, options: [{ id: "a", winProb: 0.47, delta: -2.6, real: true, text: "Hold A" }] } });
    expect(v.rows[0].deltaText).toBe("−3");
    expect(v.rows[0].bar.dir).toBe("down");
    expect(v.rows[0].bar.left + v.rows[0].bar.width).toBeCloseTo(50, 5);
  });
});

describe("habits, intent and history", () => {
  const profile = {
    lockTiming: { earlyShare: 0.61, cutoffDay: "Thu", league: 0.48 },
    lockThreshold: { median: 31.5, vsForecast: 1.14, league: 1.06 },
    emptySlotRate: { value: 0.04, league: 0.05 },
    weeks: 32,
    shrinkage: 0.22,
    halfLifeWeeks: 8,
    seasons: [
      { season: "2026", weeks: 9, weight: 0.58 },
      { season: "2025", weeks: 23, weight: 0.42 },
    ],
    source: "manager",
  };

  it("describes habits as facts with the league beside each", () => {
    const v = habitView(profile, { season: "2026" });
    expect(v.lead).toBe("Usually locks early: 61% of banked slots locked before Thursday");
    expect(v.facts[0]).toEqual({ label: "Locked before Thursday", value: "61%", league: "48%" });
    expect(v.basis).toBe("Based on 9 weeks this season and 23 weeks last season, recent weeks weighted more (half-life 8 weeks).");
    expect(v.provisional).toBe(false);
    expect(habitView(null)).toBeNull();
  });

  it("tags a provisional profile and says when the figures are the league's", () => {
    const v = habitView(desk.opponent.profile, { season: desk.season });
    expect(v.provisional).toBe(desk.opponent.profile.source === "provisional");
    if (!desk.opponent.profile.weeks) expect(v.shrinkText).toBe("Too few of their own weeks yet, so these are the league's figures.");
  });

  it("falls back to a week count without per-season rows", () => {
    expect(basisLine({ weeks: 5 })).toBe("Based on 5 weeks, recent weeks weighted more.");
    expect(basisLine({})).toBeNull();
  });

  it("phrases intent as evidence, never a label on the person", () => {
    const v = intentLine({ label: "contending", confidence: "moderate", evidence: ["8-3", "inside the playoff line"] });
    expect(v.text).toBe("Playing like a contender: 8-3, inside the playoff line");
    expect(v.confidence).toBe("moderate confidence");
    expect(intentLine(desk.opponent.intent).text).toMatch(/^Playing like/);
    expect(intentLine({ label: "tanking" })).toBeNull();
    expect(intentLine(null)).toBeNull();
  });

  it("splits points left on the table and carries n", () => {
    const v = historyView(desk.history);
    expect(v.ok).toBe(true);
    expect(v.nText).toBe(`n=${desk.history.n} weeks`);
    expect(v.earlyPct + v.latePct).toBeCloseTo(100, 0);
    expect(v.weeks[0].label).toBe("Week 1 '26");
    expect(historyView(null)).toBeNull();
    expect(historyView({ n: 0 }).ok).toBe(false);
  });
});

describe("copy rules", () => {
  it("never grades a manager", () => {
    const text = JSON.stringify([habitView(desk.history.profile), habitView(desk.opponent.profile), intentLine(desk.opponent.intent), historyView(desk.history)]);
    expect(text).not.toMatch(/\b(tank|tanking|bad|good|mistake|poor|great|should|grade|winner|loser)\b/i);
  });
});

describe("opponent data gap", () => {
  it("names the opponent's players in the gap banner", () => {
    const op = desk.opponent.slots[0];
    const d = { ...desk, gaps: [{ source: "playerLog", subject: op.playerId, url: null, code: "fetch_failed", message: "x" }] };
    expect(gapLines(d)[0]).toBe(`Game logs missing for ${op.name} (opponent) (fetch failed).`);
  });
});

describe("Home: your calls and Tonight's line", () => {
  const rows = callRows(desk);
  it("lists every live decision, lock-now first, then by deadline, in the board's zone", () => {
    // every live decision, plus each bench move the plan assumes (then_start)
    expect(rows.length).toBe(desk.cards.filter((c) => c.urgencyRank <= 1).length + (desk.whatIf?.plan?.actions || []).filter((a) => a.kind === "then_start").length);
    const firstNonLockNow = rows.findIndex((r) => r.action !== "lock_now");
    if (firstNonLockNow > 0) expect(rows.slice(0, firstNonLockNow).every((r) => r.action === "lock_now")).toBe(true);
    const later = rows.filter((r) => r.action !== "lock_now").map((r) => r.deadlineMs);
    expect([...later].sort((a, b) => a - b)).toEqual(later);
    for (const r of rows) {
      expect(r.title).not.toMatch(/E[SD]T\b/);
      if (r.action === "wait") {
        expect(r.title).toMatch(/^(Wait until .+, then (lock|hold) · (locks|tips|.+ tips) at \d{1,2}:\d{2}|Decide now · (locks|tips|.+ tips) at \d{1,2}:\d{2})$/);
        expect(r.leanPrefix).toBe("At the deadline:");
      } else expect(r.leanPrefix).toBeNull();
      for (const t of r.triggers) expect(t.text).not.toMatch(/your opponent's/);
    }
  });
  it("puts the decide-by time DECIDE_BUFFER_MIN before the tip, and says Decide now inside the buffer", () => {
    const card = { lean: { value: "lock" }, decision: { action: "wait", deadline: "2026-11-25T19:30:00-05:00" } };
    const opts = (now) => ({ tz: "America/New_York", today: "2026-11-25", nowMs: Date.parse(now) });
    expect(callHeadline(card, opts("2026-11-25T12:00:00-05:00"))).toMatchObject({ headline: "Wait until 7:20 PM, then lock · locks at 7:30", urgent: false });
    expect(callHeadline(card, { ...opts("2026-11-24T12:00:00-05:00"), today: "2026-11-24" }).headline).toBe("Wait until Wed 7:20 PM, then lock · locks at 7:30");
    expect(callHeadline(card, opts("2026-11-25T19:24:00-05:00"))).toMatchObject({ headline: "Decide now · locks at 7:30", urgent: true });
    const hold = { lean: { value: "hold" }, decision: { action: "hold", deadline: "2026-11-25T19:00:00-05:00" } };
    expect(callHeadline(hold, { ...opts("2026-11-24T12:00:00-05:00"), today: "2026-11-24" }).headline).toBe("Hold · decide again by Wed 6:50 PM");
    expect(callHeadline(hold, opts("2026-11-25T18:55:00-05:00"))).toMatchObject({ headline: "Decide now · resets at 7:00", urgent: true });
    expect(callHeadline({ decision: { action: "lock_now" } }).headline).toBe("Lock now");
  });

  it("names the teammate when the deadline is his tip, never 'locks' or 'resets' (QA r3: Hartenstein, Turner)", () => {
    const opts = (now) => ({ tz: "America/New_York", today: "2026-11-24", nowMs: Date.parse(now) });
    const by = { pid: "x", name: "Tristan da Silva" };
    const hold = { lean: { value: "hold" }, decision: { action: "hold", deadline: "2026-11-24T19:00:00-05:00", deadlineBy: by } };
    expect(callHeadline(hold, opts("2026-11-24T12:00:00-05:00")).headline).toBe("Hold · decide again by 6:50 PM · Tristan da Silva tips at 7:00");
    expect(callHeadline(hold, opts("2026-11-24T18:51:00-05:00")).headline).toBe("Decide now · Tristan da Silva tips at 7:00");
    const wait = { lean: { value: "lock" }, decision: { action: "wait", deadline: "2026-11-24T22:00:00-05:00", deadlineBy: { pid: "y", name: "Morez Johnson Jr." } } };
    expect(callHeadline(wait, opts("2026-11-24T12:00:00-05:00")).headline).toBe("Wait until 9:50 PM, then lock · Morez Johnson Jr. tips at 10:00");
    // review NICE: a teammate with no name still reads as a teammate, never as this player's own tip
    const unnamed = { ...hold, decision: { ...hold.decision, deadlineBy: { pid: "x", name: null } } };
    expect(callHeadline(unnamed, opts("2026-11-24T12:00:00-05:00")).headline).toBe("Hold · decide again by 6:50 PM · a teammate tips at 7:00");
  });

  it("offers the chance tiebreak only on a close call, never on a listed-out player or lock now", () => {
    for (const r of rows) {
      if (r.chance) {
        expect(r.action === "lock_now").toBe(false);
        expect(/^out$/i.test(r.listed || "")).toBe(false);
        expect(r.win?.real === false || r.lean?.confidence === "marginal").toBe(true);
      }
    }
    expect(rows.find((r) => r.listed === "Out")?.chance ?? false).toBe(false);
  });
  it("folds Tonight into one line only when it has no move to make", () => {
    // the fixture night has a swap (Kip Arden), so the full section shows
    expect(tonightLine(desk)).toBeNull();
    const quiet = { ...desk, tonight: { ...desk.tonight, timeline: (desk.tonight?.timeline || []).filter((i) => i.kind !== "start" && i.kind !== "swap_check") } };
    const line = tonightLine(quiet);
    expect(line).not.toBeNull();
    expect(line.allSet).toBe(true);
    expect(line.count).toBeGreaterThan(0);
  });
});

describe("bench moves the plan assumes (then_start)", () => {
  it("lists each as a call row with its decide-by time and condition, ordered with the calls", () => {
    const starts = startRows(desk);
    expect(starts.length).toBe((desk.whatIf?.plan?.actions || []).filter((a) => a.kind === "then_start").length);
    const novak = starts.find((r) => r.name === "Ike Novak");
    expect(novak.title).toMatch(/^Then start Ike Novak at C from Fri 7:30 PM/);
    expect(novak.title).not.toMatch(/ ET\b| if /);
    expect(novak.when).toBe("by Fri 7:20 PM · tips 7:30");
    expect(novak.condition).toBe("if Eli Brandt's score tonight is under 16.9");
    const rows = callRows(desk);
    expect(rows.some((r) => r.kind === "start" && r.playerId === novak.playerId)).toBe(true);
    const later = rows.filter((r) => r.action !== "lock_now").map((r) => r.deadlineMs);
    expect([...later].sort((a, b) => a - b)).toEqual(later);
  });
  it("names the slot's continuation beside expected-if-held when that is what it is", () => {
    expect(heldNote({ stopping: { expectedIfHeldBasis: "slot_continuation", heldContinuation: { name: "Kel'el Ware", from: "2026-11-25" } } })).toBe("Kel'el Ware in the slot from Wed");
    expect(heldNote({ stopping: { expectedIfHeldBasis: "own" } })).toBeNull();
  });
});

