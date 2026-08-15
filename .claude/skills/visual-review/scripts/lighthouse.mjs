#!/usr/bin/env node
// Ad hoc Lighthouse pass (performance/accessibility/best-practices/SEO) against
// a running dev server, using the same team-cookie trick as shoot.mjs/axe-scan.mjs
// (Lighthouse has no page-scripting hook, so the cookie goes in via an extra
// request header instead of localStorage/document.cookie).
//
// This is a spot-check tool, not a CI gate: Lighthouse's performance numbers
// are noisy in a shared/virtualized sandbox (CPU throttling calibration, cold
// caches), so treat a low performance score here as "worth a second look
// locally", not as a merge-blocking regression. Best-practices has one similar
// dev-only false positive worth knowing by name: "Missing source maps for
// large first-party JavaScript" fires against `next dev`'s Turbopack output
// and says nothing about the production build. Accessibility/SEO scores are
// the stable ones and worth acting on directly - they're what e2e/a11y.spec.ts's
// axe pass doesn't cover (viewport meta, heading order, touch target size,
// deprecated APIs, etc.).
//
// Usage: node lighthouse.mjs --base http://localhost:3200 /roster
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}
const base = flag("base", "http://localhost:3200");
const roster = flag("roster", "1");
const routes = args.filter(
  (a, i) => !a.startsWith("--") && !["--base", "--roster"].includes(args[i - 1]),
);

const chromePath = process.env.VISUAL_REVIEW_CHROMIUM ?? process.env.CHROME_PATH;

(async () => {
  const chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: ["--headless=new", "--no-sandbox"],
  });

  let anyBelowThreshold = false;
  for (const route of routes.length ? routes : ["/"]) {
    const result = await lighthouse(`${base}${route}`, {
      port: chrome.port,
      output: "json",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      formFactor: "mobile",
      screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false },
      extraHeaders: { Cookie: `parquet_roster=${roster}` },
    });
    const scores = result.lhr.categories;
    console.log(
      `${route} - performance ${scores.performance.score} · accessibility ${scores.accessibility.score} · ` +
        `best-practices ${scores["best-practices"].score} · seo ${scores.seo.score}`,
    );
    for (const [key, cat] of Object.entries(scores)) {
      if (key === "performance") continue; // noisy in a sandbox, see header comment
      if (cat.score < 1) anyBelowThreshold = true;
      for (const ref of cat.auditRefs) {
        const audit = result.lhr.audits[ref.id];
        if (audit.score !== null && audit.score < 1) {
          console.log(`  [${key}] ${audit.id}: ${audit.title}`);
        }
      }
    }
  }

  await chrome.kill();
  process.exit(anyBelowThreshold ? 1 : 0);
})();
