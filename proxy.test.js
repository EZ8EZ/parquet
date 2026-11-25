/**
 * The redirect itself, through the real proxy and a real NextRequest.
 *
 * `lib/auth/entry.test.js` pins the decision; this pins the WIRING - that the lens
 * cookie is the one being read, that a redirect response actually comes back, and
 * that the matcher's exclusions are not silently doing the opposite of what they say.
 * The decision being correct in a module nobody calls would be no comfort at all.
 */
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "./proxy";
function request(path, cookie) {
  const req = new NextRequest(new URL(`http://localhost:3000${path}`));
  if (cookie) req.cookies.set("parquet_roster", cookie);
  return req;
}
describe("the front door", () => {
  it("REDIRECTS a fresh browser to the picker", async () => {
    const res = await proxy(request("/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")).pathname).toBe("/teams");
  });
  it("lets a returning reader straight through to Home", async () => {
    const res = await proxy(request("/", "3"));
    expect(res.headers.get("location")).toBeNull();
  });
  it("carries a deep link through the detour so a shared link survives", async () => {
    const res = await proxy(request("/web?trade=abc"));
    const location = new URL(res.headers.get("location"));
    expect(location.pathname).toBe("/teams");
    expect(location.searchParams.get("next")).toBe("/web?trade=abc");
  });
  it("does not bounce the picker, the claim link, or the explainer", async () => {
    for (const path of ["/teams", "/claim", "/claim/invalid", "/about"]) {
      expect((await proxy(request(path))).headers.get("location")).toBeNull();
    }
  });
  it("excludes API routes and static files from the matcher", async () => {
    // A POST bounced to an HTML page is a far more confusing failure than a 401,
    // and an icon has no reader to redirect.
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of [
      "/api/annotations",
      "/_next/static/chunk.js",
      "/favicon.png",
      "/manifest.webmanifest",
    ]) {
      expect(matcher.test(path)).toBe(false);
    }
    for (const path of ["/", "/roster", "/managers/3", "/teams"]) {
      expect(matcher.test(path)).toBe(true);
    }
  });
});

describe("focus mode (PARQUET_FULL_ACCESS_PASSWORD)", () => {
  const withPw = async (fn) => {
    const prev = process.env.PARQUET_FULL_ACCESS_PASSWORD;
    process.env.PARQUET_FULL_ACCESS_PASSWORD = "hunter2-test";
    try {
      await fn();
    } finally {
      if (prev === undefined) delete process.env.PARQUET_FULL_ACCESS_PASSWORD;
      else process.env.PARQUET_FULL_ACCESS_PASSWORD = prev;
    }
  };
  it("is off without the variable: every page opens as before", async () => {
    delete process.env.PARQUET_FULL_ACCESS_PASSWORD;
    const res = await proxy(request("/trade", "3"));
    expect(res.headers.get("location")).toBeNull();
  });
  it("sends a visitor without the cookie from any other page to /unlock, deep link kept", async () => {
    await withPw(async () => {
      const res = await proxy(request("/trade/finder?x=1", "3"));
      const loc = new URL(res.headers.get("location"));
      expect(loc.pathname).toBe("/unlock");
      expect(loc.searchParams.get("next")).toBe("/trade/finder?x=1");
    });
  });
  it("leaves the start-or-not pages open", async () => {
    await withPw(async () => {
      for (const path of ["/lockin", "/lockin?tab=players", "/teams", "/unlock"]) {
        const res = await proxy(request(path, "3"));
        expect(res.headers.get("location"), path).toBeNull();
      }
    });
  });
  it("sends a focused visitor from Home to the lock page, what-if kept; you keep Home", async () => {
    await withPw(async () => {
      const loc = new URL((await proxy(request("/?assume=t2L", "3"))).headers.get("location"));
      expect(loc.pathname + loc.search).toBe("/lockin?assume=t2L");
      // a fresh browser still picks a team first
      expect(new URL((await proxy(request("/"))).headers.get("location")).pathname).toBe("/teams");
      const { accessToken } = await import("./lib/auth/focus.js");
      const me = request("/", "3");
      me.cookies.set("parquet_full", await accessToken("hunter2-test"));
      expect((await proxy(me)).headers.get("location")).toBeNull();
    });
  });
  it("lets the right cookie through and refuses a wrong one", async () => {
    await withPw(async () => {
      const { accessToken } = await import("./lib/auth/focus.js");
      const good = request("/roster", "3");
      good.cookies.set("parquet_full", await accessToken("hunter2-test"));
      expect((await proxy(good)).headers.get("location")).toBeNull();
      const bad = request("/roster", "3");
      bad.cookies.set("parquet_full", await accessToken("wrong"));
      expect(new URL((await proxy(bad)).headers.get("location")).pathname).toBe("/unlock");
    });
  });
});
