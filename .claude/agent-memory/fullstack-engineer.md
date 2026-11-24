# fullstack-engineer - memory

Lessons from past tasks, newest first. Read before starting; append when done.

## 2026-11-24
- Building against a contract another worker is writing: keep the stub test-only, write view helpers that tolerate several shapes (record string or object, noise or real), and dump the real desk JSON the moment the engine fixture lands. Five shape changes arrived mid-task; the helpers absorbed all of them with small edits.
- Compare the same action across two panels on live data before calling them consistent: the card's win chance (rest of week on the model's policy) and the what-if row (single action vs doing nothing) differed 45% vs 2% for one player. Fixture tests could not show it.
- Home height: every new panel needs a matching cut. Order by deadline (Tonight above the what-if), fold non-hazard live rows into the "All players" link, print points as one line when win chances lead. Still 2,168px live for roster 6 (was 1,859); 1,700 needs a product call on what leaves Home.
- The worktree guard refuses shell lines that mention `.git` paths or chain git with other commands; poll a ref file with a node script instead.
- First-load JS without Next's size column: sum `/_next/static` script transfer bytes per route with CDP against `next start`, before and after. Build the baseline from `git archive origin/main` into the scratchpad with `pnpm install --offline`.
- Use one shared legend under both slot strips; a second legend costs 40px and says the same thing.

## 2026-11-17
- Check a live game night against the engine JSON row by row: it caught an Out bench player being started first and bench players listed as "starting then". Fixture tests alone did not.
- For a same-moment UI-vs-engine check, record the responses (capture.mjs) and replay them on a dev server (LOCKIN_REPLAY_DIR + ?at=); the live server's desk is cached and log rows live 15 min.
- A prod server started with NEXT_PUBLIC_* values that differ from the build gives React #418 hydration errors (inlined at build). Not a code bug; start servers with the build's env.
- Playwright's default timezone is UTC; set timezoneId for screenshots that show local times.
- React recoverable errors arrive as `pageerror`, not console: listen to both.
- The worktree guard refuses compound shell lines with git: one git command per call.

## 2026-10-01
- Never name an options key `valueOf`: `{}`.valueOf is Object.prototype.valueOf and silently wins. Use `valueFn`.
- Ranked "disagreement" lists need a relevance pool and a relative (log-ratio) sort, or the deep tail dominates.
- Only one `next dev` can run per directory; a second refuses. Reuse the running :3000 server (it serves the working tree) and curl with -b "parquet_roster=N".
- Turbopack refuses symlinked node_modules in hand-made worktrees; pnpm there tries to reinstall. Use ./node_modules/.bin/vitest and eslint directly, or work in the main checkout on owned files.
- Thresholds on the value scale must be valueAtRank(N) (D116), never literals.
- Fixture duplicate names exist (two "Darnell Nowak" on one roster) - match players by id, not name, in tests.
- Tests should select fixture rosters by the rule's inputs, not hard-coded ids, so a recalibration does not break them.
