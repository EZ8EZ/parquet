import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { ALL_SURFACES } from "../lib/nav";
import { primeLens } from "./helpers";
/**
 * REGISTRY-DRIVEN ACCESSIBILITY SCAN, same shape as smoke.spec.ts: one entry per
 * `ALL_SURFACES` route rather than a hand-kept list, so a route this file forgot
 * to add is a route the registry itself was always going to miss too.
 *
 * Full axe ruleset once per route. There is one (dark) theme, so one pass covers
 * contrast too.
 */
function describeViolations(violations) {
  return violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} - ${v.nodes.length} node(s)\n` +
        v.nodes
          .slice(0, 3)
          .map((n) => `  ${n.target.join(" ")}`)
          .join("\n"),
    )
    .join("\n\n");
}
for (const surface of ALL_SURFACES) {
  test(`${surface.href} has no automated accessibility violations`, async ({
    page,
  }) => {
    await primeLens(page);
    await page.goto(surface.href);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, describeViolations(results.violations)).toEqual(
      [],
    );
  });
}
