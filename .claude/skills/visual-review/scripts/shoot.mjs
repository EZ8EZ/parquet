#!/usr/bin/env node
// Screenshot one or more routes at the app's design viewport (390x844), with the
// team-picker redirect and theme already handled - the two things that make a
// naive `page.goto` + `page.screenshot` loop against this app show the wrong
// thing (see SKILL.md for why).
//
// Usage: node shoot.mjs --base http://localhost:3200 --theme dark --roster 1 --out ./shots / /roster /values
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}
const base = flag("base", "http://localhost:3200");
const theme = flag("theme", "dark"); // dark | light | contrast
const roster = flag("roster", "1"); // fixture roster id; irrelevant against live Sleeper data
const outDir = flag("out", "./shots");
const routes = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== undefined && !["--base", "--theme", "--roster", "--out"].includes(args[i - 1]));

mkdirSync(outDir, { recursive: true });

const execPath = process.env.VISUAL_REVIEW_CHROMIUM; // set this if the sandbox's cached
// chromium revision is older than what the pinned @playwright/test expects - see
// SKILL.md's "Chromium revision mismatch" section. Leave unset on a normal machine.

(async () => {
  const browser = await chromium.launch(
    execPath ? { executablePath: execPath, args: ["--no-sandbox"] } : {},
  );
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  // Same cookie e2e/helpers.ts's primeLens sets, so a fresh browser skips the
  // first-run team picker instead of screenshotting it on every route.
  await context.addCookies([{ name: "parquet_roster", value: String(roster), url: base }]);

  // The boot script in app/layout.tsx reads this key before first paint (lib/theme.ts).
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* private-mode Safari; falls back to default theme */
      }
    },
    ["parquet:theme", theme],
  );

  for (const route of routes.length ? routes : ["/"]) {
    const name = (route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "_")) + `-${theme}`;
    try {
      await page.goto(`${base}${route}`, { waitUntil: "load", timeout: 20000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
      console.log("OK", route, "->", `${outDir}/${name}.png`);
    } catch (e) {
      console.log("FAIL", route, e.message);
    }
  }

  await browser.close();
})();
