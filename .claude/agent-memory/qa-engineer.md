# qa-engineer - memory

Lessons from past tasks, newest first. Read before starting; append when done.

## 2026-11-25
- Worktrees with node_modules symlinked to another checkout cannot run `next build` or `next dev` (Turbopack panic "Symlink [project]/node_modules ... points out of the filesystem root"). Use `git archive <sha> | tar -x` into the scratchpad + `pnpm install --offline --frozen-lockfile` + `pnpm exec prisma generate` (forgetting prisma generate made 50 e2e tests fail with ".prisma/client/default").
- `ss` is not installed; find your servers with `pgrep -f next-server` + `readlink /proc/PID/cwd` and kill only those under your scratch folder.
- Engine equality: a two-lib replay script (import both lib/lockin/index.js, same recording, strip *Ms keys) answers "no-assumption output identical" in seconds; record a fresh live recording each candidate.
- Instrument a COPY of lib (globalThis hooks in teamSimInput / slot inference) to see the plan's fills and force certain lock states; re-apply the patch per candidate because the return line changes between releases (assert the anchor or the run silently tests nothing).
- The candidate moved twice mid-task; keep a per-candidate folder (cand, cand2, cand3) and re-run only gates + engine + the flows the merge touched.
- Playwright: `dialog[open]` can match a non-sheet dialog; take `.last()` and filter tile buttons by aria-label prefix. Full-page shots of sheets are cut by the fixed bottom nav; read the .txt dump next to each PNG.
- The Win % tab id is `?tab=options` (not `win`).
- Round 4 (same day, baa983b): verify each old finding with its original repro first (curl + a tiny Playwright script), then re-run gates. A vitest timeout during parallel pnpm installs was CPU contention; rerun the file alone and the suite alone before calling anything.
- When a candidate adds a field to the desk (gamesLeft), make the equality script drop that key explicitly in the JSON replacer; a sed on the regex silently did nothing the first time.
- Page-level validation (loadLockDesk validAssume) is separate from the engine: test URL tokens through the real server, not only buildWeekDesk.

## 2026-10-01
- Sweep script lives in the scratchpad of the session that wrote it; re-create: list app/ routes, curl each with -b parquet_roster=6/14/3, grep visible text for Application error|NaN|undefined|Infinity|[object Object]|CAPS_ENUMS.
- Coordinate with the lead before sweeping a tree that is mid-edit; you will otherwise report transient states as bugs (still useful: caught the pick/player scale mismatch).
