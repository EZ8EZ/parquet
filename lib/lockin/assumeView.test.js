import { describe, expect, it } from "vitest";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";
import { parseAssume } from "./assume.js";
import { MINE_UNKNOWN_NOTE, assumeFromSearch, assumeHref, assumeOptions, assumedOf, contradictionText, keepAssume, whatIfBar, withAssume } from "./assumeView.js";

describe("what-if choices on a slot tile", () => {
  it("does not offer 'playing on' for your own unknown slot, and says why", () => {
    const o = assumeOptions({ side: "mine", key: "unknown", banked: 33 });
    expect(o.options.map((x) => x.state)).toEqual(["locked", null]);
    expect(o.options[0].label).toBe("Treat as locked at 33.0");
    expect(o.options[1].current).toBe(true);
    expect(o.note).toBe(MINE_UNKNOWN_NOTE);
  });
  it("offers both ways on their unknown slot, playing on against a lock, nothing on a final or empty slot", () => {
    expect(assumeOptions({ side: "theirs", key: "unknown", banked: 29 }).options.map((x) => x.state)).toEqual(["locked", "open", null]);
    expect(assumeOptions({ side: "theirs", key: "locked", banked: 45 }).options.map((x) => x.state)).toEqual(["open", null]);
    expect(assumeOptions({ side: "mine", key: "final" })).toBeNull();
    expect(assumeOptions({ side: "theirs", key: "empty" })).toBeNull();
    expect(assumeOptions({ side: "mine", key: "yet" })).toBeNull();
  });
  it("marks the current assumption", () => {
    const o = assumeOptions({ side: "theirs", key: "unknown", assumed: "open", banked: 29 });
    expect(o.options.find((x) => x.current).state).toBe("open");
    expect(assumedOf("assumed_open_live")).toBe("open");
    expect(assumedOf("assumed_locked")).toBe("locked");
    expect(assumedOf("banked_equals_latest_game")).toBeNull();
  });
});

describe("the assume param", () => {
  it("replaces one slot, keeps other params, and resets cleanly", () => {
    let list = withAssume([], "mine", 3, "locked");
    list = withAssume(list, "theirs", 0, "open");
    expect(assumeHref("/lockin", "tab=calls&open=lk02", list)).toBe("/lockin?tab=calls&open=lk02&assume=m3L%2Ct0O");
    list = withAssume(list, "mine", 3, null);
    expect(assumeHref("/", "assume=m3L,t0O", list)).toBe("/?assume=t0O");
    expect(assumeHref("/lockin", "tab=week&assume=t0O", [])).toBe("/lockin?tab=week");
    expect(assumeFromSearch("tab=x&assume=m1L,t2O")).toEqual([{ side: "mine", slot: 1, state: "locked" }, { side: "theirs", slot: 2, state: "open" }]);
  });
  it("keeps assumptions in links between Home and the lock board while set", () => {
    const list = [{ side: "mine", slot: 1, state: "locked" }];
    expect(keepAssume("/lockin?tab=options", list)).toBe("/lockin?tab=options&assume=m1L");
    expect(keepAssume("/lockin", list)).toBe("/lockin?assume=m1L");
    expect(keepAssume("/lockin", [])).toBe("/lockin");
  });
});

describe("the What-if bar", () => {
  it("is absent without assumptions and says the change with them, rough-labelled by the caller", async () => {
    const plain = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, fetchJson: fixtureFetchJson, now: FIXTURE_NOW });
    expect(whatIfBar(plain)).toBeNull();
    const desk = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, fetchJson: fixtureFetchJson, now: FIXTURE_NOW, assume: parseAssume("m1L,t0O").list });
    const bar = whatIfBar(desk);
    expect(bar.count).toBe(2);
    expect(bar.fromPct).toMatch(/^\d+%$/);
    expect(bar.toPct).toMatch(/^\d+%$/);
    expect(bar.contradictions[0].text).toBe("Their PG: The app had this slot as locked; you're treating it as playing on.");
    expect(contradictionText({ inferred: "reset", state: "locked" })).toBe("The app had this slot as reset to 0; you're treating it as locked.");
  });
});
