# fullstack-engineer - memory

Lessons from past tasks, newest first. Read before starting; append when done.

## 2026-10-01
- Only one `next dev` can run per directory; a second refuses. Reuse the running :3000 server (it serves the working tree) and curl with -b "parquet_roster=N".
- Turbopack refuses symlinked node_modules in hand-made worktrees; pnpm there tries to reinstall. Use ./node_modules/.bin/vitest and eslint directly, or work in the main checkout on owned files.
- Thresholds on the value scale must be valueAtRank(N) (D116), never literals.
- Fixture duplicate names exist (two "Darnell Nowak" on one roster) - match players by id, not name, in tests.
- Tests should select fixture rosters by the rule's inputs, not hard-coded ids, so a recalibration does not break them.
