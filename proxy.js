/**
 * The one job: a browser that has never picked a team meets the picker, not EZ8.
 *
 * All of the reasoning, and all of the tests, live in `lib/auth/entry.js` - this file
 * is deliberately a five-line shell around two pure functions. Proxy (the file
 * convention formerly called middleware, renamed in Next 16) runs on every matched request in the app, so anything it imports is on the hot path of the
 * whole site; keeping the decision in a dependency-free module is what stops that
 * from mattering.
 */
import { NextResponse } from "next/server";
import {
  entryRedirectTarget,
  LENS_COOKIE,
  needsEntryPick,
  parseLens,
  PATH_HEADER,
} from "@/lib/auth/entry";
export function proxy(req) {
  const hasLens = parseLens(req.cookies.get(LENS_COOKIE)?.value) != null;
  const { pathname, search } = req.nextUrl;
  if (!needsEntryPick(pathname, hasLens)) {
    // The page path, so a lens that parses but names no roster (lib/history.js) can be
    // bounced to the picker with the same `next=` a first-time visitor gets.
    const headers = new Headers(req.headers);
    headers.set(PATH_HEADER, `${pathname}${search}`);
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.redirect(
    new URL(entryRedirectTarget(pathname, search), req.url),
  );
}
export const config = {
  /**
   * Page navigations only. Route handlers under /api answer for themselves (a POST
   * bounced to an HTML page would be a far more confusing failure than a 401), and
   * the trailing `.*\..*` clause excludes every file with an extension - the Next
   * build output, the icons, the web manifest - none of which have a reader to
   * redirect.
   */
  matcher: ["/((?!api/|_next/static|_next/image|.*\\..*).*)"],
};
