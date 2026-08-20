import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { THEME_STORAGE_KEY } from "../lib/theme";
import {
  expectNoConsoleErrors,
  expectStableChrome,
  primeLens,
  watchConsole,
} from "./helpers";
/**
 * THE DEPTH CHART, END TO END, AND ITS OWN ACCESSIBILITY SWEEP.
 *
 * Two properties no unit test can hold, and one this file has to hold on its own:
 *
 *   1. THE ENTRY POINT EXISTS. `/depth/[team]` is reachable from the surfaces where
 *      the question occurs - a player row on /roster and /values - rather than being
 *      a route that merely resolves. The derivation is unit-tested to death in
 *      lib/depth; what a browser has to prove is that a reader who has never heard of
 *      this feature can get to it by tapping the player they were already looking at.
 *
 *   2. IT IS NOT A DEAD END. The registry's own suite (lib/nav.test.js) enforces two
 *      ways out of every REGISTERED surface, and a parameterised route cannot be in
 *      that registry - so `lib/depth/onward.test.js` pins the same contract on the
 *      steps and this pins that they actually render as links.
 *
 *   3. AXE. e2e/a11y.spec.js iterates `ALL_SURFACES`, so a dynamic route gets no
 *      automated accessibility coverage from it at all. Rather than leave this one
 *      surface outside the bar every other page is held to, it runs its own full axe
 *      pass in the default theme plus the contrast-only pass in the light one -
 *      exactly the two-pass shape that file uses, and for the same reason.
 */
async function setTheme(page, theme) {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Private-mode Safari throws on write; the boot script falls back to the
        // default, which is an acceptable miss here as it is in a11y.spec.js.
      }
    },
    { key: THEME_STORAGE_KEY, value: theme },
  );
}
function describeViolations(violations) {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.help} - ${v.nodes.length} node(s)`)
    .join("\n");
}
/** The first roster row that actually has depth-chart data behind it. */
async function openFirstRowWithDepth(page) {
  const rows = page.getByRole("button", { name: /Show details$/ });
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await rows.nth(i).click();
    const link = page.getByRole("link", { name: /^Where he sits on / });
    if ((await link.count()) > 0) return link.first();
    await rows.nth(i).click();
  }
  return null;
}
test("a roster row leads to the player's real NBA depth chart, and back out again", async ({
  page,
}) => {
  const guard = watchConsole(page);
  await primeLens(page);
  await page.goto("/roster");
  await expectStableChrome(page);
  const link = await openFirstRowWithDepth(page);
  expect(
    link,
    "no rostered player offered a depth chart - the entry point is gone",
  ).not.toBeNull();
  // The row states the standing as a COUNT, never as an ordinal. "2nd string" is the
  // one thing this feature must never render (lib/depth's header has the measurement
  // that makes an ordinal a coin flip on 43 of 149 live groups).
  const label = await link.textContent();
  expect(label).toMatch(/Where he sits on [A-Z]{2,4}/);
  await link.click();
  await expect(page).toHaveURL(/\/depth\/[A-Z]{2,4}\?player=/);
  await expectStableChrome(page);
  // The chart itself, and the player who brought us here, marked as such.
  await expect(
    page.getByRole("heading", { level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("players placed")).toBeVisible();
  await expect(page.locator("[aria-current='true']")).toHaveCount(1);
  // Two ways out, rendered - not merely returned by `depthOnwardSteps`.
  const onward = page.getByRole("navigation", { name: "Where to next" });
  await expect(onward).toBeVisible();
  expect(await onward.getByRole("link").count()).toBeGreaterThanOrEqual(2);
  await onward.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/(values|roster)/);
  expectNoConsoleErrors(guard);
});
test("the chart names its own source, its age, and where it can be wrong", async ({
  page,
}) => {
  const guard = watchConsole(page);
  await primeLens(page);
  await page.goto("/depth/LAL");
  await expectStableChrome(page);
  // Provenance is not optional chrome on this surface: the whole page is somebody
  // else's published data, and D19/D6 mean it has to say so and say what it refuses.
  await expect(page.getByText(/Sleeper's own depth chart/)).toBeVisible();
  const caveats = page.getByText("Where this chart can be wrong");
  await expect(caveats).toBeVisible();
  await caveats.click();
  await expect(page.getByText(/orders are not ranks/)).toBeVisible();
  expectNoConsoleErrors(guard);
});
test("a team nobody plays for gets the app's not-found page, not an empty chart", async ({
  page,
}) => {
  await primeLens(page);
  await page.goto("/depth/ZZZ");
  // Asserted on the RENDERED page rather than on the status code, because every
  // `notFound()` in this app answers 200 under `next dev` - checked against
  // /lineage/p:zzzz and /managers/999 before writing this, both of which do the same.
  // What matters is that a code nobody plays for lands on the 404 surface instead of
  // a chart with nothing in it.
  await expect(
    page.getByRole("heading", { name: "Nothing on this floor" }),
  ).toBeVisible();
});
test("an anchor link for a player who is not on the team says so instead of misleading", async ({
  page,
}) => {
  const guard = watchConsole(page);
  await primeLens(page);
  // A stale or hand-edited link is untrusted input; it must degrade, never throw.
  await page.goto("/depth/LAL?player=definitely-not-a-player");
  await expectStableChrome(page);
  await expect(page.getByText(/not on .* in Sleeper's data/)).toBeVisible();
  expectNoConsoleErrors(guard);
});
test("/depth/[team] has no automated accessibility violations", async ({
  page,
}) => {
  await primeLens(page);
  await page.goto("/depth/LAL");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, describeViolations(results.violations)).toEqual([]);
});
test("/depth/[team] meets color-contrast in the light theme", async ({
  page,
}) => {
  await setTheme(page, "light");
  await primeLens(page);
  await page.goto("/depth/LAL");
  const results = await new AxeBuilder({ page })
    .withRules(["color-contrast"])
    .analyze();
  expect(results.violations, describeViolations(results.violations)).toEqual([]);
});
