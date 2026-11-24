import { describe, expect, it } from "vitest";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";
import { withOpponentStub } from "./__fixtures__/opponentStub.js";
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
  stillToPlayText,
  whatIfView,
  whenText,
  winCompare,
} from "./matchupView.js";

const plain = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, fetchJson: fixtureFetchJson, now: FIXTURE_NOW });
const desk = withOpponentStub(plain);
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
    expect(matchupView(plain)).toEqual({ state: "none" });
  });

  it("leads with the engine's win probability and both banked totals", () => {
    const v = matchupView(desk, { me: { name: "Parquet Kings" } });
    expect(v.state).toBe("win");
    expect(v.winPct).toBe("62%");
    expect(v.me.name).toBe("Parquet Kings");
    expect(v.me.banked).toBe(154);
    expect(v.them.banked).toBe(150);
    expect(v.them.name).toBe("Glass Cleaners");
    expect(v.oppSlots.map((s) => s.key)).toEqual(["locked", "unknown", "reset", "final", "unknown", "empty", "unknown"]);
    expect(v.oppSummary).toBe("1 locked · 3 unknown · 2 open · 1 final");
    expect(allFinitePct(v.scale.rows)).toBe(true);
    expect(allFinitePct(v.scale.ticks.map((t) => t.pct))).toBe(true);
    expect(v.scale.rows[0].mean).toBeGreaterThan(v.scale.rows[1].mean);
  });

  it("falls back to the points view when winProb is null", () => {
    const v = matchupView({ ...desk, winProb: null });
    expect(v.state).toBe("points");
    expect(v.winPct).toBeNull();
    expect(v.me.range).toBeNull();
    // their range still comes from opponent.projectedTotal
    expect(v.them.range.mean).toBe(196.8);
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
    expect(oppSlotKey({ playerId: "x", lockState: "final score stands" })).toBe("final");
    expect(oppSlotKey({ playerId: "x", lockState: "something new" })).toBe("unresolved");
  });

  it("phrases the unknown-lock weight plainly and keeps the engine's assumptions", () => {
    const lines = assumptionLines(desk.winProb);
    expect(lines[0]).toBe(desk.winProb.assumptions[0]);
    expect(lines).toContain("A score equal to his latest game is treated as locked 58% of the time, the rate seen in past weeks.");
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
  it("compares win chances and explains a disagreement with the points lean", () => {
    const w = winCompare(card("lk02"), desk.winProb);
    expect(w.lockPct).toBe("66%");
    expect(w.holdPct).toBe("61%");
    expect(w.gainText).toBe("+5 pts of win chance");
    expect(w.disagree).toBe("Points favour holding; with your lead, locking is the safer path to a win.");
    expect(winCompare(card("lk03"), desk.winProb).disagree).toBeNull();
    expect(winCompare(card("lk07"), desk.winProb)).toBeNull();
  });

  it("phrases a trailing disagreement the other way", () => {
    const c = { lean: { value: "hold", winProbIfLock: 0.3, winProbIfHold: 0.34, pointsLean: "lock", disagrees: true } };
    const wp = { mine: { mean: 180, p10: 160, p90: 200 }, theirs: { mean: 200, p10: 180, p90: 220 } };
    expect(winCompare(c, wp).disagree).toMatch(/^Points favour locking; trailing/);
  });

  it("builds the boom/bust bar inside 0-100 with n", () => {
    const v = profileView(card("lk02").profile, { x: 31.5 });
    expect(v.ok).toBe(true);
    expect(v.nText).toMatch(/^from \d+ games$/);
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
    const out = availabilityView(card("lk03"));
    expect(out.games[0].pct).toBe("0%");
  });

  it("turns the decision action into the model's call with its triggers", () => {
    const wait = actionView(card("lk02"));
    expect(wait.title).toBe("Wait until");
    expect(wait.whenFallback).toBe("Sat 7:30 PM EST");
    expect(wait.reason).toBe("his next game");
    expect(wait.triggers.map((t) => t.kind)).toEqual(["injury_listing", "opponent_lead"]);
    expect(actionView(card("lk03")).title).toBe("Lock now");
    expect(actionView({ decision: { action: "hold" } }).title).toBe("Hold");
    expect(actionView({ decision: { kind: "lineup" } })).toBeNull();
    expect(whenText("not a date")).toBeNull();
  });
});

describe("what moves your win chance", () => {
  it("puts real differences first by win chance and noise last", () => {
    const v = whatIfView(desk);
    expect(v.basePct).toBe("62%");
    const noise = v.rows.findIndex((r) => r.noise);
    expect(noise).toBeGreaterThan(0);
    expect(v.rows.slice(noise).every((r) => r.noise)).toBe(true);
    const real = v.rows.slice(0, noise).map((r) => r.winProb);
    expect(real).toEqual([...real].sort((a, b) => b - a));
    expect(v.rows.find((r) => r.noise).deltaText).toBe("no real difference");
    expect(v.plan.text).toBe("Do all of the model's calls: 74% (now 62%)");
    for (const r of v.rows) if (r.bar) expect(allFinitePct(r.bar)).toBe(true);
  });

  it("keeps the card's figures and the panel's figures the same", () => {
    const v = whatIfView(desk);
    const lock = v.rows.find((r) => r.id === "lock-lk02");
    expect(lock.winPct).toBe(winCompare(card("lk02"), desk.winProb).lockPct);
  });

  it("limits rows for Home and reports how many more", () => {
    const v = whatIfView(desk, { limit: 3 });
    expect(v.rows).toHaveLength(3);
    expect(v.more).toBe(whatIfView(desk).rows.length - 3);
    expect(whatIfView({ whatIf: null })).toBeNull();
  });

  it("signs the change and uses a true minus", () => {
    const v = whatIfView({ whatIf: { baseline: 0.5, options: [{ id: "a", winProb: 0.47, delta: -3, text: "Hold A" }] } });
    expect(v.rows[0].deltaText).toBe("−3");
    expect(v.rows[0].bar.dir).toBe("down");
    expect(v.rows[0].bar.left + v.rows[0].bar.width).toBeCloseTo(50, 5);
  });
});

describe("habits, intent and history", () => {
  it("describes habits as facts with the league beside each", () => {
    const v = habitView(desk.opponent.profile, { season: "2026" });
    expect(v.lead).toBe("Usually locks early: 61% of banked slots locked before Thursday");
    expect(v.facts[0]).toEqual({ label: "Locked before Thursday", value: "61%", league: "48%" });
    expect(v.basis).toBe("Based on 9 weeks this season and 23 weeks last season, recent weeks weighted more (half-life 8 weeks).");
    expect(habitView(null)).toBeNull();
  });

  it("falls back to a week count without per-season rows", () => {
    expect(basisLine({ weeks: 5 })).toBe("Based on 5 weeks, recent weeks weighted more.");
    expect(basisLine({})).toBeNull();
  });

  it("phrases intent as evidence, never a label on the person", () => {
    const v = intentLine(desk.opponent.intent);
    expect(v.text).toBe("Playing like a contender: 8-3, inside the playoff line, added production last week");
    expect(v.confidence).toBe("moderate confidence");
    expect(intentLine({ label: "tanking" })).toBeNull();
    expect(intentLine(null)).toBeNull();
  });

  it("splits points left on the table and carries n", () => {
    const v = historyView(desk.history);
    expect(v.ok).toBe(true);
    expect(v.nText).toBe("n=12 weeks");
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
