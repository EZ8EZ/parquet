import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { ALL_SURFACES } from "../lib/nav";
import { THEME_STORAGE_KEY, type Theme } from "../lib/theme";
import { primeLens } from "./helpers";

/**
 * REGISTRY-DRIVEN ACCESSIBILITY SCAN, same shape as smoke.spec.ts: one entry per
 * `ALL_SURFACES` route rather than a hand-kept list, so a route this file forgot
 * to add is a route the registry itself was always going to miss too.
 *
 * Full axe ruleset once per route in the default (dark) theme catches everything
 * automatable - missing labels, heading order, ARIA misuse, contrast, the lot.
 *
 * Color contrast is the one rule category that is genuinely theme-sensitive - a
 * combination that clears WCAG on a near-black ground can fail on paper or fail
 * once a wash-backed element loses its background to opacity math (see D-whatever
 * the injury-tag / active-filter-pill fix that motivated adding this suite: three
 * call sites tinted their own ground at 15% alpha instead of using the opaque
 * `*-wash`/`*-edge` tokens app/globals.css already tunes per theme, and one count
 * span applied opacity-60 on TOP of an already-tighter accent-wash margin). So the
 * light/contrast passes re-run the registry with only `color-contrast` checked -
 * still every route, since that is exactly where a theme-specific regression would
 * show up, but a single rule keeps three full sweeps from tripling CI time for no
 * extra coverage on the theme-independent rules already covered by the dark pass.
 */
function describeViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} - ${v.nodes.length} node(s)\n` +
        v.nodes.slice(0, 3).map((n) => `  ${n.target.join(" ")}`).join("\n"),
    )
    .join("\n\n");
}

async function setTheme(page: import("@playwright/test").Page, theme: Theme) {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Private-mode Safari throws on write; the boot script falls back to the
        // default in that case too, which is an acceptable miss for this suite.
      }
    },
    { key: THEME_STORAGE_KEY, value: theme },
  );
}

for (const surface of ALL_SURFACES) {
  test(`${surface.href} has no automated accessibility violations`, async ({ page }) => {
    await primeLens(page);
    await page.goto(surface.href);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, describeViolations(results.violations)).toEqual([]);
  });
}

for (const theme of ["light", "contrast"] as const) {
  for (const surface of ALL_SURFACES) {
    test(`${surface.href} meets color-contrast in the ${theme} theme`, async ({ page }) => {
      await setTheme(page, theme);
      await primeLens(page);
      await page.goto(surface.href);
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(results.violations, describeViolations(results.violations)).toEqual([]);
    });
  }
}
