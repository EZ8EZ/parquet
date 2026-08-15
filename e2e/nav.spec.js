import { expect, test } from "@playwright/test";
import { primarySurfaces } from "../lib/nav";
import { expectNoConsoleErrors, primeLens, watchConsole } from "./helpers";
/**
 * THE ALWAYS-VISIBLE NAVIGATION CONTRACT (DECISIONS.md D52, D53, D65).
 *
 * This suite exists because of a composition failure that no unit test could have
 * caught and no unit test can catch: one commit removed the Desk's permanent
 * destination row and paid for it with a full surface index on Home; a second
 * commit twenty-six minutes later removed that index, correctly on its own terms,
 * and the two together left the app advertising exactly one destination anywhere.
 * Both commits were green. What went missing was a property of the two of them
 * held together - "a reader who has tapped nothing can see where they can go" -
 * and a property of the rendered app is a thing only a browser can assert.
 *
 * D65 answered the question D53 left open: the primaries are now a persistent tab
 * row inside the Desk itself, on every route, not a Home-only shortcut. So this file
 * pins the PROPERTY somewhere stronger than Home alone - whatever `primarySurfaces()`
 * returns must be reachable from an ARBITRARY route without opening anything. If a
 * future round moves the row somewhere better, this test should be edited
 * deliberately; it must never go quietly green because the row vanished.
 */
test("the four primary destinations are visible on every route without opening anything", async ({
  page,
}) => {
  const guard = watchConsole(page);
  await primeLens(page);
  // An arbitrary non-primary route, deliberately not Home - the property being
  // pinned is that the row is GLOBAL chrome, not something Home alone carries.
  await page.goto("/league");
  const row = page.getByRole("navigation", { name: "Primary" });
  await expect(row).toBeVisible();
  for (const s of primarySurfaces()) {
    const link = row.getByRole("link", {
      name: s.short ?? s.label,
      exact: true,
    });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", s.href);
  }
  // The fifth tab: the same control that used to be the only one, still opening
  // the same drawer.
  await expect(row.getByRole("button", { name: "More", exact: true })).toBeVisible();
  expectNoConsoleErrors(guard);
});
/**
 * The drawer's scroll region used to be capped at a flat 26rem - 416pt of an
 * 846pt list on a 844pt-tall phone with 588pt available - so The Lab, Methodology,
 * Settings and Switch team all sat under a fold with nothing on screen admitting
 * it existed. The cap is gone and the remainder is announced. Asserted as
 * "the last group is reachable and the cue is honest" rather than as a pixel
 * height, because the height is viewport arithmetic and should stay free to move.
 */
test("the drawer reaches its last group, and says so while there is more below", async ({
  page,
}) => {
  const guard = watchConsole(page);
  await primeLens(page);
  await page.goto("/");
  await page.getByRole("button", { name: "More", exact: true }).click();
  const cue = page.locator("[data-more-below]");
  await expect(cue).toHaveAttribute("data-more-below", "true");
  // The deepest entry in the registry's last group, then the link that closes the
  // list. Both reachable, and Playwright's auto-scroll proves the region really
  // scrolls rather than clipping.
  await page.getByRole("link", { name: "The Lab" }).scrollIntoViewIfNeeded();
  const end = page.getByRole("link", { name: "See everything on one page" });
  await end.scrollIntoViewIfNeeded();
  await expect(end).toBeVisible();
  // Read to the end, the drawer stops saying there is more.
  await expect(cue).toHaveAttribute("data-more-below", "false");
  expectNoConsoleErrors(guard);
});
