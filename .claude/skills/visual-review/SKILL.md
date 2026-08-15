---
name: visual-review
description: Screenshot Parquet's pages at its 390px design viewport across all three themes (dark/paper/contrast), and run automated axe-core accessibility scans against a running dev server. Use before and after any UI or visual-design change, and whenever asked to review, audit, or verify how a page actually looks/renders.
---

# Visual review

Parquet is mobile-first, dark-editorial, and has three themes (`dark`/`light`/
`contrast`, see DESIGN.md and `lib/theme.ts`) and a team-scoped cookie
(`parquet_roster`) that gates almost every page behind a first-run team picker.
A naive `page.goto` + `page.screenshot` loop shows the team picker on every
route instead of the actual page - this skill exists so that mistake isn't
rediscovered every session.

No `chromium-cli` binary is available in this environment; these scripts drive
`@playwright/test`'s bundled `chromium` directly instead (already a
devDependency here).

## Quick start

```bash
# 1. Get a dev server (starts one on :3200 with the fixture provider - offline,
#    deterministic - if nothing is already listening there).
BASE=$(node .claude/skills/visual-review/scripts/ensure-server.mjs 3200 --fixture)

# 2. Screenshot routes at the design viewport, one theme at a time.
node .claude/skills/visual-review/scripts/shoot.mjs --base "$BASE" --theme dark \
  --out /tmp/shots / /roster /values

# 3. Read the PNGs back with the Read tool - screenshots are only useful once
#    you actually look at them.

# 4. Accessibility scan the same routes (also per-theme: color-contrast is the
#    one rule category that genuinely varies by theme).
node .claude/skills/visual-review/scripts/axe-scan.mjs --base "$BASE" --theme dark \
  / /roster /values

# 5. Optional: a Lighthouse pass for the categories axe doesn't cover -
#    viewport meta, heading order, touch target size, deprecated APIs.
node .claude/skills/visual-review/scripts/lighthouse.mjs --base "$BASE" / /roster
```

Repeat step 2/4 with `--theme light` and `--theme contrast` - most visual bugs
this skill has caught so far were theme-specific (a token that reads fine in
dark and fails once the same element sits on `light`'s ground).

Already have `pnpm dev` running on your own port for manual testing? Point
`--base` at that instead of starting a second server - reuse, don't relaunch
(Next 16 refuses a second `next dev` in the same directory anyway).

## Picking a team

Every page redirects to the team picker (`/teams`) until a `parquet_roster`
cookie is set - `shoot.mjs`/`axe-scan.mjs` set it for you (`--roster`,
default `1`, the fixture's "5-Year Plan" / owner's own team). Against the
*live* provider (unset `--fixture` in step 1, i.e. real Sleeper data) roster
ids differ - if a screenshot still shows the team picker, the id doesn't
match a real roster in that league; drop `--roster` and instead prime the
cookie by clicking a team card once, or just leave the fixture provider on for
anything that's about layout/visual design rather than real data.

## The committed a11y CI gate

`e2e/a11y.spec.ts` runs the same axe-core check as `axe-scan.mjs`, but as a
proper Playwright test: full ruleset once per route (dark) plus a
`color-contrast`-only pass per route in `light` and `contrast`, driven off the
same `ALL_SURFACES` registry `e2e/smoke.spec.ts` uses (`lib/nav.ts`). Run it
with `pnpm e2e e2e/a11y.spec.ts`. This is the thing to keep green, not a
replacement for eyeballing the screenshots - axe catches contrast/ARIA/label
issues, not "this looks cramped" or "this reads as a verdict, not a fact".

## Lighthouse: what it catches that axe doesn't

`lighthouse.mjs` runs performance/accessibility/best-practices/SEO against a
route (mobile form factor at the app's 390x844 design viewport, same team
cookie trick as the other two scripts, via an extra request header since
Lighthouse has no page-scripting hook). Its accessibility category overlaps
with `axe-scan.mjs` but isn't identical - it caught a real WCAG 2.5.8
touch-target-size finding and a real WCAG 2.5.3 label/content mismatch on the
Desk's menu button that axe-core's ruleset doesn't check for at all. Treat its
`performance` score as noisy in a shared sandbox
(that's a spot-check number, not a merge gate) - `accessibility` and `seo` are
the stable, actionable ones. See the script's header comment for one more
known dev-server-only false positive (`valid-source-maps`, harmless under
`next dev`, says nothing about the production build).

## Chromium revision mismatch (sandbox-specific)

Some containers pre-install a chromium build older than what this repo's
pinned `@playwright/test` expects (`browserType.launch: Executable doesn't
exist at .../chromium_headless_shell-<rev>`). Real CI isn't affected -
`.github/workflows/ci.yml` runs `playwright install --with-deps chromium`
itself. If you hit this locally:

- `shoot.mjs` / `axe-scan.mjs` / `lighthouse.mjs`: set
  `VISUAL_REVIEW_CHROMIUM=/opt/pw-browsers/chromium` (or wherever
  `ls $PLAYWRIGHT_BROWSERS_PATH` shows a chromium binary; `lighthouse.mjs` also
  accepts the more conventional `CHROME_PATH`) and they'll launch that build
  directly instead of the one Playwright expects.
- The committed `pnpm e2e` suite (`playwright.config.mjs`) has no such override
  and shouldn't get one - hard-coding a sandbox-local path into the repo's own
  config would break it on every other machine, including real CI, where the
  correct revision genuinely is installed. If you need to run the suite itself
  in an affected sandbox, override `use.launchOptions.executablePath` in an
  **uncommitted** local config (`playwright.config.verify.ts` that re-exports
  `./playwright.config` with the override merged in) and delete it before
  committing anything.
