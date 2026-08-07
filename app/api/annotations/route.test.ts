/**
 * The write path, end to end through the real route handler.
 *
 * Two separate failures are pinned here, and they are the two that have actually
 * bitten this app:
 *
 *  1. AUTHORSHIP. The author used to come from `parquet_roster`, a non-httpOnly
 *     cookie any reader can rewrite, so anyone could author and edit as anyone.
 *  2. HONESTY ABOUT PERSISTENCE. The catch block used to report every database error
 *     as "no database configured", so a Postgres rejection (SQLSTATE 42P10, after the
 *     annotation unique index became composite) answered "saved for this session" and
 *     the user's typed reasoning was discarded while the UI said it was fine.
 *
 * Both are tested against the route itself rather than a helper, because in both
 * cases the bug lived in how the route WIRED correct pieces together.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signSeatToken } from "@/lib/auth/seat";

const state = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));
const db = vi.hoisted(() => ({
  upsert: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.cookies[name] != null ? { name, value: state.cookies[name] } : undefined,
  }),
  headers: async () => new Headers(),
}));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    prisma: { annotation: { upsert: db.upsert, findMany: db.findMany } },
  };
});

const SECRET = "test-secret-not-used-anywhere-real";
/** The fixture league's rosters are owned by u1..u14, roster N by uN. */
const ME = "u1";
const RIVAL = "u7";

function post(body: unknown) {
  return new Request("http://localhost/api/annotations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const NOTE = { transactionId: "fx-2022-rebuildA", reasoning: "because", posture: "rebuild" };

let POST: (req: Request) => Promise<Response>;
let invalidateHistory: () => void;

beforeEach(async () => {
  vi.resetModules();
  state.cookies = {};
  db.upsert.mockReset().mockImplementation(async (args: { create: unknown }) => args.create);
  db.findMany.mockReset().mockResolvedValue([]);
  delete process.env.AUTH_SECRET;
  ({ POST } = await import("./route"));
  ({ invalidateHistory } = await import("@/lib/history"));
  invalidateHistory();
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
  vi.restoreAllMocks();
});

describe("LEGACY MODE (no AUTH_SECRET) - the backward-compatibility contract", () => {
  it("writes with no seat at all, stamped with the lens, exactly as before", async () => {
    state.cookies.parquet_roster = "1";
    const res = await POST(post(NOTE));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, persisted: true });
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.upsert.mock.calls[0][0].where.transactionId_ownerId.ownerId).toBe(ME);
  });

  it("follows the lens when it moves, which is the pre-seat behaviour verbatim", async () => {
    state.cookies.parquet_roster = "7";
    await POST(post(NOTE));
    expect(db.upsert.mock.calls[0][0].where.transactionId_ownerId.ownerId).toBe(RIVAL);
  });
});

describe("MULTI-USER MODE - the forged-cookie hole, closed", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
  });

  it("REFUSES a write from a browser with no seat", async () => {
    state.cookies.parquet_roster = "1";
    const res = await POST(post(NOTE));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "no seat" });
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("refuses a FORGED seat cookie", async () => {
    state.cookies.parquet_roster = "1";
    state.cookies.parquet_seat = `s1.${ME}.${"0".repeat(64)}`;
    expect((await POST(post(NOTE))).status).toBe(401);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("refuses a seat signed with a DIFFERENT secret", async () => {
    state.cookies.parquet_roster = "1";
    state.cookies.parquet_seat = signSeatToken(ME, "some-other-secret");
    expect((await POST(post(NOTE))).status).toBe(401);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("stamps the SEAT, not the lens - flipping the lens no longer changes the author", async () => {
    // The exact attack: hold your own seat, point the readable cookie at a
    // leaguemate, and try to write a note into their record.
    state.cookies.parquet_seat = signSeatToken(ME, SECRET);
    state.cookies.parquet_roster = "7";
    const res = await POST(post(NOTE));
    expect(res.status).toBe(200);
    expect(db.upsert.mock.calls[0][0].where.transactionId_ownerId.ownerId).toBe(ME);
    expect(db.upsert.mock.calls[0][0].where.transactionId_ownerId.ownerId).not.toBe(RIVAL);
  });

  it("lets a seated manager write in their own seat", async () => {
    state.cookies.parquet_seat = signSeatToken(ME, SECRET);
    state.cookies.parquet_roster = "1";
    await expect((await POST(post(NOTE))).json()).resolves.toMatchObject({
      persisted: true,
    });
  });

  it("checks the seat BEFORE parsing the body, so a refusal is cheap", async () => {
    const res = await POST(
      new Request("http://localhost/api/annotations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json at all",
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("PERSISTENCE HONESTY - a rejected write must never look like a saved one", () => {
  const originalUrl = process.env.DATABASE_URL;
  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  it("does NOT report success when the database rejects the write", async () => {
    // The production incident, reproduced: Postgres refuses an upsert whose ON
    // CONFLICT target matches no unique index. Before the fix this answered
    // 200 { ok: true, persisted: false, message: "Saved for this session..." } and
    // the note was gone.
    process.env.DATABASE_URL = "postgresql://example/db";
    state.cookies.parquet_roster = "1";
    const err = Object.assign(
      new Error(
        "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      ),
      { code: "42P10" },
    );
    db.upsert.mockRejectedValueOnce(err);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(post(NOTE));
    const body = await res.json();

    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.persisted).toBe(false);
    expect(body.reason).toBe("db-error");
    // The user-facing sentence has to say the note is gone, not that it is held.
    expect(body.message).toMatch(/NOT saved/);
    expect(body.message).not.toMatch(/Saved for this session/);
  });

  it("logs the driver's own code and message, which is all that made it diagnosable", async () => {
    process.env.DATABASE_URL = "postgresql://example/db";
    state.cookies.parquet_roster = "1";
    db.upsert.mockRejectedValueOnce(
      Object.assign(new Error("connect ECONNREFUSED"), { code: "P1001" }),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await POST(post(NOTE));

    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    expect(line).toContain("P1001");
    expect(line).toContain("connect ECONNREFUSED");
  });

  it("still degrades kindly when there is genuinely NO database configured (D18)", async () => {
    delete process.env.DATABASE_URL;
    state.cookies.parquet_roster = "1";
    const res = await POST(post(NOTE));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, persisted: false, reason: "no-database" });
    expect(body.message).toMatch(/Saved for this session/);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("reports a real success as persisted", async () => {
    process.env.DATABASE_URL = "postgresql://example/db";
    state.cookies.parquet_roster = "1";
    await expect((await POST(post(NOTE))).json()).resolves.toMatchObject({
      ok: true,
      persisted: true,
    });
  });
});

/**
 * COST. A one-key write must not cost the next reader a league.
 *
 * This route used to call `invalidateHistory()` after every successful upsert, which
 * nulls the corpus single-flight slot, so the next read re-ran `assembleCorpus` - ~145
 * Sleeper requests and the 1.4s cold start D25 calls a budget to protect - and minted a
 * fresh `players` Map, which misses lib/valuation's WeakMap and revalues every player in
 * the league. A prior pass deleted three cheaper `invalidateHistory()` calls for exactly
 * this reason and left the most expensive one, on the understanding that it was the only
 * mechanism making a writer's own note visible to their own next read.
 *
 * It was not, and that is worth stating precisely: probed on the running dev server,
 * lib/history is instantiated once per Next build layer, so the route handler's corpus
 * and a page's corpus are two different caches and neither the old invalidation nor this
 * publication crosses between them (see `publishAnnotation`). What these tests pin is
 * the behaviour WITHIN one module registry, which is the contract this module is written
 * to and the only one it can honour on its own.
 *
 * `getUsers` is the spy target for the same reason lib/history.test.ts uses it: it is
 * called exactly once per assembly and nowhere else on this path, so its call count IS
 * the assembly count. Both halves have to hold together - dropping the invalidation
 * without publishing the row would make the write cheap and invisible, which is worse.
 */
describe("WRITE COST - the note is visible without rebuilding the corpus", () => {
  const originalUrl = process.env.DATABASE_URL;
  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  /** A transaction the fixture seed does NOT annotate, so "absent" means absent. */
  const FRESH = { transactionId: "fx-2025-pivot", reasoning: "why I pivoted", posture: null };

  async function warm() {
    process.env.DATABASE_URL = "postgresql://example/db";
    state.cookies.parquet_roster = "1";
    const history = await import("@/lib/history");
    const { FixtureProvider } = await import("@/lib/providers/fixture");
    const spy = vi.spyOn(FixtureProvider.prototype, "getUsers");
    const before = await history.getLeagueHistory();
    expect(spy).toHaveBeenCalledTimes(1);
    return { history, spy, before };
  }

  it("a successful write is visible to the next read with NO reassembly", async () => {
    const { history, spy, before } = await warm();
    expect(history.myAnnotation(before, FRESH.transactionId)).toBeNull();

    db.upsert.mockImplementationOnce(async (args: { create: object }) => ({
      ...args.create,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    expect((await POST(post(FRESH))).status).toBe(200);

    const after = await history.getLeagueHistory();
    // The whole point: the reader sees the note, and nobody paid for a cold start.
    expect(history.myAnnotation(after, FRESH.transactionId)?.reasoning).toBe(
      "why I pivoted",
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("leaves the corpus identities alone, so the valuation WeakMap keeps its hit", async () => {
    const { history, before } = await warm();
    db.upsert.mockImplementationOnce(async (args: { create: object }) => ({
      ...args.create,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await POST(post(FRESH));
    const after = await history.getLeagueHistory();

    // `valuesByCorpus` in lib/valuation keys on `h.players` identity. A new Map here
    // means every page after a capture revalues the league from scratch.
    expect(after.players).toBe(before.players);
    expect(after.transactions).toBe(before.transactions);
    // Same Map object, one key richer - which is why the write is visible at all.
    expect(after.annotations).toBe(before.annotations);
  });

  it("overwrites an existing note in place rather than stacking a second one", async () => {
    const { history, before } = await warm();
    // The fixture seeds u1's 2022 rebuild statement; an edit must replace it.
    const seeded = history.myAnnotation(before, NOTE.transactionId);
    expect(seeded?.reasoning).toMatch(/Full rebuild/);
    const sizeBefore = before.annotations.size;

    db.upsert.mockImplementationOnce(async (args: { create: object }) => ({
      ...args.create,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await POST(post(NOTE));

    const after = await history.getLeagueHistory();
    expect(history.myAnnotation(after, NOTE.transactionId)?.reasoning).toBe("because");
    expect(after.annotations.size).toBe(sizeBefore);
  });

  it("does not publish anything when the database REJECTED the write", async () => {
    const { history } = await warm();
    db.upsert.mockRejectedValueOnce(
      Object.assign(new Error("nope"), { code: "42P10" }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await POST(post(FRESH))).status).toBe(500);

    // D36's rule, applied to the cache: a note the database refused must not be shown
    // back to the writer as though it had been kept.
    const after = await history.getLeagueHistory();
    expect(history.myAnnotation(after, FRESH.transactionId)).toBeNull();
  });
});
