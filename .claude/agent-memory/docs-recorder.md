# docs-recorder - memory

Lessons from past tasks, newest first. Read before starting; append when done.

## 2026-11-16
- Read the code behind every sentence: three README drafts had claims that were plausible but wrong (lock state is certain only when the score differs from the latest game AND matches an earlier one; first visits redirect to /teams; the +0.8 rotation bound applies to the per-player rule, not the lineup-aware lean).
- Pull numbers onto pages from the lib constants (LEAN_RECORD, MODEL_INFO) instead of retyping them; fewer places to drift.
- Mechanical .ts -> .js comment fixes: script it, restrict to comment lines, check the JS file exists, and keep a skip list for strings and test messages.
- Never `pkill -f "next dev"` in a shared machine: it was refused, rightly. Start servers under `timeout` and wait with until-loops.
- A 150-line README cap forces choices; write it long once, then cut to the claims you can cite.

## 2026-10-01
- Keep the decision entry in sync with the code as it moves (the anchor changed from swap to blend mid-session); re-read the diff right before finishing.
- Leave TODO(Dxxx-topic) placeholders for numbers that are not final rather than guessing.
