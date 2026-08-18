/**
 * `getDeskData` - specifically the no-lens branch this round added.
 *
 * The bug: `h.me` falls back to the DEPLOY OWNER'S own roster whenever there is no
 * `parquet_roster` cookie to read (see lib/history.ts, `resolveMe`). D35's middleware
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
    expect(data).toEqual({ seat: null, status: null });
    // The load-bearing half: the deploy owner's identity is not merely hidden from
    // the render, `getLeagueHistory` is never even asked for it.
    expect(historyState.calls).toBe(0);
  });
  it("answers the same 'nobody yet' for a garbage cookie value, exactly like the middleware's own guard", async () => {
    state.cookies.set("parquet_roster", "not-a-number");
    const data = await getDeskData();
    expect(data).toEqual({ seat: null, status: null });
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
    expect(data.status).not.toBeNull();
  });
});
