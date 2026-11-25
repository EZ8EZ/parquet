/**
 * `getDeskData` - specifically the no-lens branch this round added.
 *
 * The bug: `h.me` falls back to the DEPLOY OWNER'S own roster whenever there is no
 * `parquet_roster` cookie to read (see lib/history.js, `resolveMe`). D35's middleware
 * exists purely to keep a stranger with no lens off any page that would print that
 * fallback identity as fact - but the Desk renders in the ROOT LAYOUT, on every route,
 * including the three pages that must work with no lens at all (`/teams`, `/about`,
 * `/claim/invalid`). Curled cookieless, `/teams` - the page whose entire job is asking
 * "whose team are you?" - rendered the deploy owner's real team name and record in the
 * persistent chip at the bottom of the very same screen. Same leak, one layer of
 * chrome over, reopened by a component D35 never touched.
 *
 * The fix reads the lens cookie FIRST, with no corpus involved, and answers "nobody
 * yet" before ever calling `getLeagueHistory` - so the two things this file pins are
 * exactly the two halves of that fix: no lens means no corpus read at all (not just a
 * masked identity), and a real lens still gets the real thing. `./history` is mocked
 * to a fixture-backed stand-in only so the corpus assembly stays a synchronous fixture
 * call in a unit test rather than a real provider request - everything else here is
 * the real module, same as `app/commissioner/seats.test.jsx`'s own reasoning for why
 * that is the more honest test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFixtureHistory } from "./testing/fixtureHistory.js";
const state = vi.hoisted(() => ({ cookies: new Map() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name) => {
      const v = state.cookies.get(name);
      return v === undefined ? undefined : { value: v };
    },
  }),
}));
const historyState = vi.hoisted(() => ({ calls: 0 }));
vi.mock("./history", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getLeagueHistory: async () => {
      historyState.calls += 1;
      return buildFixtureHistory();
    },
  };
});
let getDeskData;
beforeEach(async () => {
  vi.resetModules();
  state.cookies = new Map();
  historyState.calls = 0;
  // Legacy mode (no AUTH_SECRET) is the default and every deploy today - readSeat()
  // falls through to LEGACY_SEAT with no cookie needed, same as D35 pins elsewhere.
  delete process.env.AUTH_SECRET;
  ({ getDeskData } = await import("./desk.js"));
});
describe("getDeskData - no lens yet", () => {
  it("answers 'nobody yet', and never touches the corpus, with no lens cookie at all", async () => {
    const data = await getDeskData();
    expect(data).toEqual({ seat: null, bug: null, focus: false });
    // The load-bearing half: the deploy owner's identity is not merely hidden from
    // the render, `getLeagueHistory` is never even asked for it.
    expect(historyState.calls).toBe(0);
  });
  it("answers the same 'nobody yet' for a garbage cookie value, exactly like the middleware's own guard", async () => {
    state.cookies.set("parquet_roster", "not-a-number");
    const data = await getDeskData();
    expect(data).toEqual({ seat: null, bug: null, focus: false });
    expect(historyState.calls).toBe(0);
  });
});
describe("getDeskData - a real lens", () => {
  it("reads the corpus and returns the chosen roster's own identity", async () => {
    state.cookies.set("parquet_roster", "1");
    const data = await getDeskData();
    expect(historyState.calls).toBeGreaterThan(0);
    expect(data.seat).not.toBeNull();
    expect(data.seat.label).toBe("Parquet Kings");
    expect(data.bug).not.toBeNull();
    expect(data.bug.parts[0]).toBe("PK");
  });
});
describe("scorebug - what the bottom bar prints", () => {
  let scorebug;
  beforeEach(async () => {
    ({ scorebug } = await import("./desk.js"));
  });
  const form = { wins: 1, losses: 2, rank: 9, teams: 14, season: "2026", isLive: true };

  it("in a lock-in week leads with the week, slots showing a score and open decisions", () => {
    const bug = scorebug({ teamName: "Parquet Kings", form, scored: { scored: 5, of: 7, week: 4 }, toDecide: 2 });
    expect(bug.parts).toEqual(["Wk 4", "5/7 scored", "2 to decide", "1-2"]);
    expect(bug.label).toContain("week 4: 5 of 7 slots show a score");
    expect(bug.label).toContain("2 lock-or-hold decisions open");
    expect(bug.href).toBe("/");
    expect(scorebug({ teamName: "Parquet Kings", form, scored: { scored: 5, of: 7, week: 4 }, toDecide: null }).parts).toEqual(["Wk 4", "5/7 scored", "1-2"]);
  });

  it("with a fresh board prints the score, the rough win chance, open calls and the next deadline", () => {
    const bug = scorebug({
      teamName: "5-Year Plan",
      form,
      scored: { scored: 3, of: 7, week: 6 },
      toDecide: 3,
      matchup: { mine: 91.5, theirs: 184.5, win: 0.27, next: { at: "2026-11-24T19:00:00-05:00", tz: "America/New_York" } },
      now: new Date("2026-11-24T21:55:00Z"),
    });
    expect(bug.parts).toEqual(["91.5–184.5", "27% rough"]);
    expect(bug.toDecide).toBe(3);
    expect(bug.label).toContain("3 decisions open");
    // the countdown runs to the decide-by time, 10 minutes before the 7:00 PM tip
    expect(bug.next).toEqual({ at: "2026-11-24T23:50:00.000Z", text: "by 6:50 PM", urgent: false });
    expect(bug.label).toContain("rough win chance 27 percent");
    expect(bug.label).toContain("next move by 6:50 PM");
    // inside the buffer: no countdown to a passed time, the tip instead
    const late = scorebug({ teamName: "5-Year Plan", form, scored: { scored: 3, of: 7, week: 6 }, matchup: { mine: 91.5, theirs: 184.5, win: 0.54, next: { at: "2026-11-24T19:00:00-05:00", tz: "America/New_York" } }, now: new Date("2026-11-24T18:55:00-05:00") });
    expect(late.next).toEqual({ at: null, text: "decide now · tips 7:00", urgent: true });
    expect(late.parts.join(" · ")).not.toMatch(/passed/);
    expect(bug.href).toBe("/");
  });

  it("before the first game of the week says when it is, else keeps 0/7 scored", () => {
    const zero = { scored: 0, of: 7, week: 5 };
    const bug = (firstNight) => scorebug({ teamName: "Parquet Kings", form, scored: zero, firstNight }).parts;
    expect(bug({ day: "Mon", tonight: true, started: false })).toEqual(["Wk 5", "first game tonight", "1-2"]);
    expect(bug({ day: "Tue", tonight: false, started: false })).toEqual(["Wk 5", "first game Tue", "1-2"]);
    expect(bug({ day: "Tue", tonight: false, started: true })).toEqual(["Wk 5", "0/7 scored", "1-2"]);
    expect(bug(null)).toEqual(["Wk 5", "0/7 scored", "1-2"]);
  });

  it("never prints TCI or window years, and drops the scored count when unknown", () => {
    const bug = scorebug({ teamName: "Parquet Kings", form, scored: null });
    expect(bug.parts).toEqual(["PK", "1-2", "9th of 14"]);
    // the scorebug always opens This Week (it used to open the standings out of a week)
    expect(bug.href).toBe("/");
    expect(bug.parts.join(" ")).not.toMatch(/TCI|20\d\d/);
  });
});
