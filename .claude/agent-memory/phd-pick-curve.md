# phd-pick-curve - memory

Lessons from past tasks, newest first. Read before starting; append when done.

## 2026-10-01
- Fit the pick curve to the MODEL's own value of the drafted player (blended rank x the model's multiplier ratio), not to a bare base formula - the first fit was on a different scale from player values and QA caught picks priced above top-4 rookies.
- Quasi-Poisson WLS on per-slot means with an exact by-class bootstrap was the right loss; raw LS overweights R1, log LS overweights R3.
- Say explicitly that a draft-night-conversion pick curve is circular with the player model by design (market price), and report the realized check separately.
