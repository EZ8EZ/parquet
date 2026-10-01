# Dynasty value curve calibration (Sleeper adp_dynasty -> realized surplus)

**Data.** Snapshots 2021/22/23, top 250 by adp_dynasty (ties broken by adp_std), n=750 player-snapshots. Target = sum over s=Y..min(Y+4,2025) of 0.9^(s-Y) * max(0, FPG_s - repl_s) * min(gp,70)/70. Replacement = Nth-best FPG among gp>=20. N=98 gives about 20.2-21.3 FPG; N=140 gives about 17.4. Fits are scale-free least squares on individual player-snapshots (V = A*f(r), f(1)=1). Pure python, grid search. Script: `curve.py` (`python3 curve.py` then `python3 curve.py hyb`).

## Empirical E[surplus | rank] (repl=98, full horizon)
| rank bin | 1-3 | 4-6 | 7-10 | 11-15 | 16-20 | 21-30 | 31-40 | 41-60 | 61-80 | 81-100 | 101-130 | 131-200 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mean | 46.4 | 23.6 | 20.5 | 12.5 | 16.3 | 11.8 | 8.4 | 6.3 | 2.1 | 1.1 | 0.8 | ~0.5 |
| % zero | 0 | 0 | 0 | 0 | 0 | 0 | 20 | 18 | 42 | 70 | 72 | ~90 |

Isotonic, normalized to r=1: r5 .40, r10 .33, r20 .25, r30 .17, r50 .11, r75 .036, r100 .015.
The shape is a sharp head (ranks 1-3 are worth about 2x ranks 4-10), a slow middle, then an exponential tail that hits about 0 near rank 100-120. **No single exponential captures both the head and the tail.**

## Fits (individual-level R^2)
| repl N | exp k | R^2 | power a | R^2 | exp+floor (k, c) | R^2 | current k=.021 R^2 | **hybrid r^-a e^{-k(r-1)}** | R^2 |
|---|---|---|---|---|---|---|---|---|---|
| 98 | 0.044 (boot 90% CI .034-.062) | .650 | 0.68 | .651 | .050, .02 | .654 | .568 | a=.40, k=.017 | **.712** |
| 112 | 0.0345 | .662 | 0.63 | .634 | .038, .02 | .665 | .618 | a=.35, k=.015 | **.711** |
| 126 | 0.0295 | .667 | 0.605 | .623 | .032, .02 | .670 | .643 | a=.30, k=.015 | **.709** |
| 140 | 0.0255 | .670 | 0.57 | .611 | .029, .02 | .672 | .662 | a=.25, k=.015 | **.705** |

The floor is about 0 in every fit, so a floor is not needed. By snapshot (repl 98): 2021 (5 seasons) k=.049; 2022 (4 seasons) .038; 2023 (3 seasons) .046. A common 3-season horizon gives .0415. Horizon truncation has no systematic effect on k.

## Consolidation tests (ratio > 1 means the consolidated side wins)
| curve | #10 / (2 x #30) | #5 / (#15+#25) | V1/V10 | V1/V50 |
|---|---|---|---|---|
| current exp k=.021 | 0.76 | 0.68 | 1.21 | 2.8 |
| exp fit, repl 98 (k=.044) | 1.21 | 0.94 | 1.49 | 8.6 |
| power fit, repl 98 (a=.68) | 1.05 | 1.23 | 4.7 | 14 |
| hybrid, repl 98 | 1.09 | 1.09 | 2.9 | 11 |
| **hybrid, repl 112 (recommended)** | **0.99** | **0.99** | 2.6 | 8.2 |
| hybrid, repl 140 | 0.89 | 0.87 | 2.0 | 5.5 |
| empirical bins (approx.) | about 0.85-1.0 | about 0.95 | about 2.3 | about 7 |

**Verdict.** The current curve is far too flat at both ends. It prices the #1 player at only 1.2x the #10 (data: about 2.5x) and the #100 player at 12.5% of the #1 (data: about 1.5-4%). As a result it systematically favors 2-for-1 depth trades. With the empirically fitted shapes, mid-first-round consolidation is roughly break-even, and elite (top-3) consolidation carries a large premium.

## Age split (repl 98, exp fit within group)
young (age 23 or younger) k=.052 (n=285); prime (24-29) k=.054 (n=321); old (30+) k=.027, power a=.96 (n=144).
The market already prices age into the rank, so per-group curves are similar for young and prime players. Old players ranked about 20-40 *over-delivered* on the 3-5 season horizon, which makes their curve flatter. This is a sign of a market age discount that is too steep, not a horizon effect. Young players' bins at 16-30 ran higher than their 11-15 bin, which is noise (n of about 6-15 per bin).

## Horizon truncation bias
The 2022 snapshot has 4 seasons and the 2023 snapshot has 3. Value that is back-loaded (youth) gets cut off, which biases young players' targets down and steepens their curve slightly. Empirically the per-snapshot k values (.049/.038/.046) and the common-3-year k (.0415) are within bootstrap noise. The bias is small relative to replacement-level uncertainty, but the sample cannot see beyond a 5-year horizon.

## Caveats
1. **The replacement level dominates.** Moving N from 98 to 140 halves exp-k (.044 to .026). Lock-in plus a 9-man bench means injured starters are covered by players ranked about 99-140, so N of about 110-125 is the defensible choice.
2. **The head is estimated from about 9 player-snapshots** (ranks 1-3 across 3 years: Jokic, Giannis, and others). The power exponent a is fragile: the bootstrap 90% CI for the exp-k is .034-.062.
3. **Realized ex-post value, few independent draws.** Only 3 overlapping market snapshots (the 2021-2025 seasons are shared). Also: per-game FPG ignores the lock-in option value (best-of-week), which favors high-variance players. Sleeper dynasty ADP is not specific to this league's scoring. Bench and roster-spot value beyond replacement is ignored.
