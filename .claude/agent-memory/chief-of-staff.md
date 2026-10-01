# chief-of-staff - memory

Lessons from past tasks, newest first. Read before starting; append when done.

## 2026-10-01
- Run the team as a pipeline: fan out scouts first (5 parallel read-only maps in <1 min each), then specialists, then a red-team pass before merging. The red team caught a design error (pure dynasty-ADP anchor) that the lead had already shipped to a branch.
- Ship one effect per commit when a change moves every price (D116 anchor, D117 curve). It made 10 fixture-test failures attributable to the curve alone in one experiment.
- Check the DECISIONS.md tail before numbering: D114 was already taken; renumbered to D116.
- Subagents cannot write report files in some harness modes; ask them to return the report text and save it yourself.
- git: use /Library/Developer/CommandLineTools/usr/bin/git. Worktree isolation via the Agent tool fails here; create worktrees by hand and symlink node_modules (but see fullstack-engineer notes on Turbopack).
