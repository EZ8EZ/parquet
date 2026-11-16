/** Pure parts of scripts/snapshot-lineups.js. No network: fetch is injected. */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SnapshotError,
  latestSnapshot,
  sameAsSnapshot,
  snapshot,
  snapshotPath,
  stampOf,
  validateMatchups,
  weekDir,
} from "./snapshot-lineups.js";

const MATCHUPS = [
  { roster_id: 1, starters: ["1747", "2055"], starters_points: [30.5, 0], players: ["1747", "2055", "9"], points: 30.5 },
  { roster_id: 2, starters: ["4"], starters_points: [12], players: ["4"], points: 12 },
];

function fakeFetch(routes) {
  return async (url) => {
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (!key) return new Response("not found", { status: 404 });
    const v = routes[key];
    if (v instanceof Response) return v;
    return new Response(JSON.stringify(v), { status: 200 });
  };
}

const dirs = [];
function scratch() {
  const d = mkdtempSync(join(tmpdir(), "lineups-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe("path naming", () => {
  it("uses ISO 8601 basic timestamps and zero-padded weeks", () => {
    const d = new Date("2026-11-16T01:45:00.123Z");
    expect(stampOf(d)).toBe("20261116T014500Z");
    expect(snapshotPath("root", "2026", 4, d)).toBe(
      join("root", "2026", "week-04", "20261116T014500Z.json"),
    );
    expect(weekDir("root", 2026, 12)).toBe(join("root", "2026", "week-12"));
  });

  it("stamps sort chronologically as strings", () => {
    const a = stampOf(new Date("2026-11-16T09:00:00Z"));
    const b = stampOf(new Date("2026-11-16T10:00:00Z"));
    expect([b, a].sort()).toEqual([a, b]);
  });
});

describe("schema", () => {
  it("accepts the live shape and treats null / [] as no matchups", () => {
    expect(validateMatchups(MATCHUPS)).toBe(MATCHUPS);
    expect(validateMatchups(null)).toBeNull();
    expect(validateMatchups([])).toBeNull();
  });

  it("rejects a payload that does not match", () => {
    expect(() => validateMatchups({})).toThrow(SnapshotError);
    expect(() => validateMatchups([{ starters: [] }])).toThrow(/roster_id/);
    expect(() => validateMatchups([{ roster_id: 1, starters: [7] }])).toThrow(/starters/);
    expect(() => validateMatchups([{ roster_id: 1, starters_points: ["x"] }])).toThrow(
      /starters_points/,
    );
  });
});

describe("a run", () => {
  const state = { week: 4, season: "2026", season_type: "regular" };

  it("writes one file, then skips an identical payload", async () => {
    const root = scratch();
    const fetchImpl = fakeFetch({ "/state/nba": state, "/matchups/4": MATCHUPS });
    const first = await snapshot({
      leagueId: "L",
      root,
      fetchImpl,
      now: () => new Date("2026-11-16T01:00:00Z"),
    });
    expect(first.status).toBe("written");
    const rec = JSON.parse(readFileSync(first.path, "utf8"));
    expect(rec).toMatchObject({ season: "2026", week: 4, leagueId: "L", payload: MATCHUPS });
    expect(rec.fetchedAt).toBe("2026-11-16T01:00:00.000Z");

    const second = await snapshot({
      leagueId: "L",
      root,
      fetchImpl,
      now: () => new Date("2026-11-16T02:00:00Z"),
    });
    expect(second.status).toBe("identical");
    expect(readdirSync(weekDir(root, "2026", 4))).toHaveLength(1);
  });

  it("writes again when a lineup changed", async () => {
    const root = scratch();
    await snapshot({
      leagueId: "L",
      root,
      fetchImpl: fakeFetch({ "/state/nba": state, "/matchups/4": MATCHUPS }),
      now: () => new Date("2026-11-16T01:00:00Z"),
    });
    const changed = structuredClone(MATCHUPS);
    changed[0].starters = ["2055", "1747"];
    const r = await snapshot({
      leagueId: "L",
      root,
      fetchImpl: fakeFetch({ "/state/nba": state, "/matchups/4": changed }),
      now: () => new Date("2026-11-16T02:00:00Z"),
    });
    expect(r.status).toBe("written");
    const dir = weekDir(root, "2026", 4);
    expect(readdirSync(dir)).toHaveLength(2);
    expect(sameAsSnapshot(latestSnapshot(dir), changed)).toBe(true);
  });

  it("out of season: no matchups, nothing written, no error", async () => {
    const root = scratch();
    const r = await snapshot({
      leagueId: "L",
      root,
      fetchImpl: fakeFetch({ "/state/nba": state, "/matchups/4": null }),
    });
    expect(r.status).toBe("no-matchups");
    expect(readdirSync(root)).toHaveLength(0);
  });

  it("an HTTP failure throws and writes nothing", async () => {
    const root = scratch();
    await expect(
      snapshot({
        leagueId: "L",
        root,
        fetchImpl: fakeFetch({
          "/state/nba": state,
          "/matchups/4": new Response("down", { status: 503 }),
        }),
      }),
    ).rejects.toThrow(/HTTP 503/);
    expect(readdirSync(root)).toHaveLength(0);
  });

  it("a schema mismatch throws and writes nothing", async () => {
    const root = scratch();
    await expect(
      snapshot({
        leagueId: "L",
        root,
        fetchImpl: fakeFetch({ "/state/nba": state, "/matchups/4": [{ nope: 1 }] }),
      }),
    ).rejects.toThrow(SnapshotError);
    expect(readdirSync(root)).toHaveLength(0);
  });
});
