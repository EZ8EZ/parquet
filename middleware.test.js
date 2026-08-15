/**
 * The redirect itself, through the real middleware and a real NextRequest.
 *
 * `lib/auth/entry.test.ts` pins the decision; this pins the WIRING - that the lens
 * cookie is the one being read, that a redirect response actually comes back, and
 * that the matcher's exclusions are not silently doing the opposite of what they say.
 * The decision being correct in a module nobody calls would be no comfort at all.
 */
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware, config } from "./middleware";
function request(path, cookie) {
  const req = new NextRequest(new URL(`http://localhost:3000${path}`));
  if (cookie) req.cookies.set("parquet_roster", cookie);
  return req;
}
describe("the front door", () => {
  it("REDIRECTS a fresh browser to the picker", () => {
    const res = middleware(request("/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")).pathname).toBe("/teams");
  });
  it("lets a returning reader straight through to Home", () => {
    const res = middleware(request("/", "3"));
    expect(res.headers.get("location")).toBeNull();
  });
  it("carries a deep link through the detour so a shared link survives", () => {
    const res = middleware(request("/web?trade=abc"));
    const location = new URL(res.headers.get("location"));
    expect(location.pathname).toBe("/teams");
    expect(location.searchParams.get("next")).toBe("/web?trade=abc");
  });
  it("does not bounce the picker, the claim link, or the explainer", () => {
    for (const path of ["/teams", "/claim", "/claim/invalid", "/about"]) {
      expect(middleware(request(path)).headers.get("location")).toBeNull();
    }
  });
  it("excludes API routes and static files from the matcher", () => {
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
