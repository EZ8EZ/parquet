/**
 * `requestOrigin` - the front half of every claim link the commissioner hands out.
 *
 * The bug pinned here is a failure path that reported success, which is the same shape
 * D36 was written about. This returned `""` when the host could not be determined, and
 * `claimUrl` concatenated it into a RELATIVE `/claim?t=s1...` - a string that renders
 * inside a copy block looking exactly like a working link, copies like one, sends like
 * one, and resolves nowhere for whoever receives it. A commissioner has no way to tell
 * the difference by eye; the only signal is the missing front half of a URL nobody
 * reads character by character.
 *
 * So the contract is now: a real origin, or `null` and the caller must say so. There is
 * deliberately no fallback hostname - a claim link is a bearer credential, and one
 * pointed at a guessed host is worse than no link at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimUrl, signSeatToken } from "./seat";

const state = vi.hoisted(() => ({
  headers: new Headers() as Headers,
  throws: false,
}));

vi.mock("next/headers", () => ({
  headers: async () => {
    if (state.throws) throw new Error("called outside a request scope");
    return state.headers;
  },
}));

let requestOrigin: () => Promise<string | null>;

beforeEach(async () => {
  vi.resetModules();
  state.headers = new Headers();
  state.throws = false;
  ({ requestOrigin } = await import("./server"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestOrigin", () => {
  it("reads the plain host, and assumes http only for loopback", async () => {
    state.headers = new Headers({ host: "localhost:3007" });
    await expect(requestOrigin()).resolves.toBe("http://localhost:3007");

    state.headers = new Headers({ host: "127.0.0.1:3000" });
    await expect(requestOrigin()).resolves.toBe("http://127.0.0.1:3000");
  });

  it("assumes https for a real hostname with no forwarded proto", async () => {
    state.headers = new Headers({ host: "parquet.example" });
    await expect(requestOrigin()).resolves.toBe("https://parquet.example");
  });

  it("prefers the forwarded headers, which is what Vercel actually sends", async () => {
    state.headers = new Headers({
      host: "internal-lb",
      "x-forwarded-host": "parquet.example",
      "x-forwarded-proto": "https",
    });
    await expect(requestOrigin()).resolves.toBe("https://parquet.example");
  });

  it("returns NULL - not an empty string - when there is no host to read", async () => {
    state.headers = new Headers();
    await expect(requestOrigin()).resolves.toBeNull();
  });

  it("returns NULL when there is no request scope at all", async () => {
    state.throws = true;
    await expect(requestOrigin()).resolves.toBeNull();
  });

  it("would have produced a link that LOOKS fine and goes nowhere", async () => {
    // The exact artifact, reproduced against the real link builder, so the reason the
    // return type is nullable is legible rather than folklore: an empty origin does not
    // fail loudly, it silently degrades a shareable URL into a same-origin path.
    const secret = "test-secret-not-used-anywhere-real";
    const relative = claimUrl("u1", secret, "");
    expect(relative.startsWith("/claim?")).toBe(true);
    expect(relative).toContain(encodeURIComponent(signSeatToken("u1", secret)));
    // And with a real origin it is a link somebody can paste into a message.
    expect(claimUrl("u1", secret, "https://parquet.example")).toBe(
      `https://parquet.example${relative}`,
    );
  });
});
