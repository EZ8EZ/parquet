import { test } from "@playwright/test";
import { ALL_SURFACES } from "../lib/nav";
import {
  expectNoConsoleErrors,
  expectStableChrome,
  primeLens,
  watchConsole,
} from "./helpers";
/**
 * REGISTRY-DRIVEN SMOKE - one test per entry in lib/nav.ts's `ALL_SURFACES`.
 *
 * Generated FROM the registry rather than hand-listed on purpose: `ALL_SURFACES`
 * is the single source of truth round 6 made for every real destination in the
 * app (see that file's header comment - it exists specifically because two
 * hand-kept lists had already silently diverged). A route this file forgot to
 * add to the registry is a route this suite was always going to miss anyway,
 * which is the same failure mode the registry itself exists to prevent.
 *
 * No dynamic-route params to derive here: every href in `ALL_SURFACES` is a
 * plain static path. The dynamic pages (/managers/[rosterId],
 * /managers/former/[ownerId], /drafts/[season]) are reached BY these pages
 * (dossier links, draft-history links, ...), not listed in the registry
 * itself - there is nothing in ALL_SURFACES today that needs a fixture id
 * derived from a listing page.
 *
 * Each page gets exactly one real assertion beyond "didn't 500" -
 * `expectStableChrome` (the bottom nav rendered, neither Next's dev overlay nor
 * the app's own error boundary/404 fired) - plus zero console/page errors. This
 * suite deliberately pins NO page-specific copy anywhere: several pages are
 * mid-edit by other agents as this file is being written (see the round-6
 * branch's working tree), and surviving that without becoming a second set of
 * copy-editing chores is the entire point of a registry-driven smoke suite.
 */
for (const surface of ALL_SURFACES) {
  test(`${surface.href} renders cleanly`, async ({ page }) => {
    const guard = watchConsole(page);
    await primeLens(page);
    await page.goto(surface.href);
    await expectStableChrome(page);
    expectNoConsoleErrors(guard);
  });
}
