# postdoc-rookie-scout - memory

Lessons from past tasks, newest first. Read before starting; append when done.

## 2026-10-01
- Result (shipped D118): NBA pick rho -0.667 beats dynasty ADP out of sample (LOCO R^2 0.40 vs 0.28); college FP/40 adds +0.004 R^2. 413/413 draftees mapped to Sleeper. ~253k tokens over 33 min - the slowest member, and worth it.
- College-stats matching is the bottleneck: >1000 Sports-Reference pages unresolved on first pass, and non-college prospects (international, Ignite, OTE) are missing by construction. Budget for it.
- The estimand that matters is incremental value GIVEN the market (dynasty+redraft blend), validated leave-one-class-out - not raw correlation with outcomes.
