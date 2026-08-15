#!/usr/bin/env node
// Ad hoc axe-core accessibility scan against a running dev server - the same
// check e2e/a11y.spec.ts runs in CI, but for one page at a time against
// whatever data the dev server is actually showing (fixture OR live), useful
// while iterating on a specific page rather than waiting on the full suite.
//
// Usage: node axe-scan.mjs --base http://localhost:3200 --theme light /roster /values
import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}
const base = flag("base", "http://localhost:3200");
const theme = flag("theme", "dark");
const roster = flag("roster", "1");
const routes = args.filter((a, i) => !a.startsWith("--") && !["--base", "--theme", "--roster"].includes(args[i - 1]));

const execPath = process.env.VISUAL_REVIEW_CHROMIUM;

(async () => {
  const browser = await chromium.launch(
    execPath ? { executablePath: execPath, args: ["--no-sandbox"] } : {},
  );
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await context.addCookies([{ name: "parquet_roster", value: String(roster), url: base }]);
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {}
    },
    ["parquet:theme", theme],
  );

  let anyFailed = false;
  for (const route of routes.length ? routes : ["/"]) {
    await page.goto(`${base}${route}`, { waitUntil: "load", timeout: 20000 });
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).analyze();
    if (results.violations.length === 0) {
      console.log(`OK   ${route} (${theme})`);
      continue;
    }
    anyFailed = true;
    console.log(`FAIL ${route} (${theme}) - ${results.violations.length} violation type(s)`);
    for (const v of results.violations) {
      console.log(`  ${v.id} (${v.impact}): ${v.help} - ${v.nodes.length} node(s)`);
      for (const n of v.nodes.slice(0, 3)) console.log(`    ${n.target.join(" ")}`);
    }
  }

  await browser.close();
  process.exit(anyFailed ? 1 : 0);
})();
