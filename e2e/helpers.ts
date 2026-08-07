import { expect, type Page } from "@playwright/test";
import { LENS_COOKIE } from "../lib/auth/entry";
import { BASE_URL } from "./constants";

/**
 * Console/page-error capture shared by every spec.
 *
 * Exactly ONE entry, and it is dev-tooling noise, not app behaviour: Next 16's
 * Fast Refresh client opens a `/_next/webpack-hmr` WebSocket on every page load
 * under `next dev`, and in this environment that handshake reliably fails
 * (`net::ERR_INVALID_HTTP_RESPONSE`) regardless of which route loaded it or how
 * many workers are running - reproduced serially (`--workers=1`) as well as in
 * parallel, so it is not a concurrency flake either. Fast Refresh plays no part
 * in what a real user sees or in anything this suite asserts on, and the socket
 * cannot even exist in the production server (`next start`) this app actually
 * ships on - there is no HMR client there to open it. If a future page ever logs
 * a REAL error alongside this one, it still fails: this pattern only matches the
 * literal `_next/webpack-hmr` URL, nothing broader.
 */
const ALLOWLIST: RegExp[] = [/_next\/webpack-hmr/];

export interface ConsoleGuard {
  errors: string[];
}

/**
 * Attach BEFORE any navigation (call this first, then `page.goto`) so nothing
 * that fires during the very first paint - including a React hydration error -
 * is missed. Check with `expectNoConsoleErrors` at the end of the test.
 */
export function watchConsole(page: Page): ConsoleGuard {
  const guard: ConsoleGuard = { errors: [] };
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (ALLOWLIST.some((re) => re.test(text))) return;
    guard.errors.push(text);
  });
  page.on("pageerror", (err) => {
    const text = err.message;
    if (ALLOWLIST.some((re) => re.test(text))) return;
    guard.errors.push(`pageerror: ${text}`);
  });
  return guard;
}

export function expectNoConsoleErrors(guard: ConsoleGuard) {
  expect(
    guard.errors,
    `Unexpected browser console/page error(s):\n${guard.errors.join("\n")}`,
  ).toEqual([]);
}

/**
 * The one assertion every route in the registry has to satisfy - deliberately
 * free of any page-specific copy (see e2e/smoke.spec.ts's header for why pinning
 * per-page text here would make this suite brittle by design):
 *
 *   - The app's stable chrome rendered: the primary bottom nav, present in the
 *     root layout (app/layout.tsx) on every route with no per-page opt-out.
 *   - Neither the app's own root error boundary (app/error.tsx) nor its 404
 *     (app/not-found.tsx) fired - a registry entry whose route doesn't actually
 *     resolve, or whose page throws, fails here instead of being mistaken for a
 *     clean render.
 *
 * Deliberately NOT checking for Next's `<nextjs-portal>` element: in Next 16 dev
 * mode that custom element is always present (it also hosts the persistent dev
 * tools indicator, not only the error overlay), so its mere existence is not a
 * usable signal - `expectNoConsoleErrors` is what actually catches a build or
 * runtime error, since the overlay is a symptom of exactly the error that would
 * already have logged there.
 */
export async function expectStableChrome(page: Page) {
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "This page hit a snag" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Nothing on this floor" }),
  ).toHaveCount(0);
}

/**
 * Set the app's "lens" cookie so navigation skips the first-run team picker
 * (middleware.ts / lib/auth/entry.ts: a browser with no `parquet_roster` cookie
 * is redirected to `/teams` for every page except the handful that must work
 * before a lens exists). Every spec in this suite calls this before its first
 * `page.goto` - without it, EVERY registry route would redirect to the picker
 * and the smoke suite would just be re-testing that one redirect 20-odd times.
 *
 * Defaults to roster 1 (EZ8, `u1`) - the same identity `lib/history.ts` falls
 * back to with no cookie at all, and the author of the fixture's one seeded
 * ledger annotation (see e2e/core-flow.spec.ts), so priming this cookie doesn't
 * change WHOSE data the suite is looking at, only whether the picker intercepts
 * the very first request.
 */
export async function primeLens(page: Page, rosterId = 1): Promise<void> {
  await page.context().addCookies([
    { name: LENS_COOKIE, value: String(rosterId), url: BASE_URL },
  ]);
}
