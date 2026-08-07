/**
 * The Seats section, rendered - because both bugs it carries are bugs in what the
 * commissioner is HANDED, and neither is visible from the functions underneath.
 *
 *  1. A LINK THAT LOOKS FINE AND GOES NOWHERE. `requestOrigin()` used to return `""`
 *     when the host header was missing, and `claimUrl` concatenated that into a
 *     relative `/claim?t=s1...` rendered inside a copy block labelled "Claim link for
 *     {name}". The commissioner copies it, sends it, and it resolves against whatever
 *     host the recipient happens to be on. The only correct answer is to say so - and
 *     NOT to guess a hostname, because a bearer credential pointed at the wrong host is
 *     worse than no link at all.
 *  2. ONE BAD ID TAKING DOWN THE PAGE. `claimUrl` -> `signSeatToken` THROWS on an owner
 *     id the separator-delimited token cannot carry, and the throw happens inside the
 *     `.map` that builds every row - so one malformed id is an unhandled error in a
 *     server component, i.e. the whole /commissioner render rather than one row.
 *
 * The three request-scoped inputs are stubbed and everything else is the real module,
 * because what is under test is what the component DOES with an answer, not how the
 * answer is obtained - `requestOrigin`'s own contract is pinned in lib/auth/server.test.ts.
 * The component is a server component with no nested async children, so awaiting it and
 * rendering the result is the real thing rather than a stand-in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { buildFixtureHistory } from "@/lib/testing/fixtureHistory";
import type { LeagueHistory } from "@/lib/history";
import type { Seat } from "@/lib/auth/seat";
import { SeatLinks } from "./seats";

const state = vi.hoisted(() => ({
  seat: { enforced: true, ownerId: "u1" } as Seat,
  owner: "u1" as string | null,
  origin: "https://parquet.example" as string | null,
}));

vi.mock("@/lib/auth/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/server")>()),
  readSeat: async () => state.seat,
  deployOwnerId: async () => state.owner,
  requestOrigin: async () => state.origin,
}));

const SECRET = "test-secret-not-used-anywhere-real";
/** The fixture's deploy owner, i.e. the only seat this section renders for. */
const OWNER = "u1";

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  state.seat = { enforced: true, ownerId: OWNER };
  state.owner = OWNER;
  state.origin = "https://parquet.example";
});

async function render(h: LeagueHistory): Promise<string> {
  const el = await SeatLinks({ h });
  return el ? renderToStaticMarkup(el as ReactElement) : "";
}

const CLAIM_LINK = /https:\/\/parquet\.example\/claim\?t=[^<"\s]+/g;

describe("SeatLinks", () => {
  const base = buildFixtureHistory();

  it("hands out ABSOLUTE links, one per manager", async () => {
    const html = await render(base);
    expect([...html.matchAll(CLAIM_LINK)]).toHaveLength(base.rosters.length);
    expect(html).toContain("Claim link for");
  });

  // Both spellings of "no origin". `null` is what `requestOrigin` returns today; the
  // empty string is what it used to return and is the shape the bug actually shipped
  // in, so the guard has to mean the same thing for either.
  it.each([null, ""])("renders NO link at all when the origin is %o", async (origin) => {
    state.origin = origin;
    const html = await render(base);

    // The whole bug: not one relative `/claim?t=` may reach the copy block, because a
    // relative link is indistinguishable from a working one once it is pasted into a
    // message.
    expect(html).not.toContain("/claim?t=");
    expect(html).not.toContain("Claim link for");
    // And the reader is told what happened rather than shown an empty panel.
    expect(html).toContain("Claim links cannot be built on this request");
  });

  it("invents no fallback origin - a link to a guessed host is worse than none", async () => {
    state.origin = null;
    const html = await render(base);
    for (const guess of ["localhost", "127.0.0.1", "vercel.app", "http://", "https://"]) {
      expect(html.includes(`${guess}/claim`)).toBe(false);
    }
  });

  it("SKIPS an unsignable owner id instead of throwing the whole page away", async () => {
    // An id carrying the token's own separator. `signSeatToken` refuses it, and before
    // this the refusal propagated straight out of the render.
    const broken: LeagueHistory = {
      ...base,
      rosters: base.rosters.map((r, i) => (i === 0 ? { ...r, ownerId: "u.1" } : r)),
    };

    const html = await render(broken);

    expect(html).toContain("has no link");
    expect(html).toContain("u.1");
    // Everybody else is unaffected, and the count is the survivors, not the roster
    // count - claiming fourteen links while rendering thirteen is its own small lie.
    expect([...html.matchAll(CLAIM_LINK)]).toHaveLength(base.rosters.length - 1);
    expect(html).toContain(`${base.rosters.length - 1} links`);
  });

  it("renders nothing at all for anyone who is not the deploy owner", async () => {
    // A claim link is a bearer credential; a panel announcing that fourteen of them
    // live behind this door is an invitation, so the answer is silence, not a lock.
    state.seat = { enforced: true, ownerId: "u7" };
    expect(await render(base)).toBe("");
  });

  it("renders nothing when the deploy owner cannot be confirmed", async () => {
    state.owner = null;
    expect(await render(base)).toBe("");
  });

  it("shows the setup note, and no links, in legacy single-user mode", async () => {
    delete process.env.AUTH_SECRET;
    const html = await render(base);
    expect(html).not.toContain("/claim?t=");
    expect(html).toContain("single user");
  });
});
