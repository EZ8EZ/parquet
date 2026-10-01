# Rookie pick curve calibration (14-team, 3-round linear; classes 2023-2026)

Script: `calibrate.py` (pure python, no numpy). Full output: `results.json`.
Market value of a pick = Vbase(rank of drafted player by Sleeper adp_dynasty in that season's snapshot), unranked = 0.
The age-adjusted variant (x ageMult/1.16) is almost identical, because rookies are 19-21. The age multiplier is effectively a no-op here.

## 1. Per-slot market value (n=4 classes; mean / median; current curve)
| slot | mean | median | SD | 2023 | 2024 | 2025 | 2026 | current |
|---|---|---|---|---|---|---|---|---|
| 1.01 | 6721 | 8113 | 3151 | 8633 | 2027 | 8454 | 7772 | 5000 |
| 1.02 | 4766 | 4607 | 2085 | 4897 | 2398 | 4317 | 7453 | 4292 |
| 1.03 | 3344 | 2629 | 1747 | 2299 | 2205 | 2958 | 5916 | 3686 |
| 1.04 | 3480 | 3220 | 2800 | 3085 | 333 | 3355 | 7146 | 3167 |
| 1.05 | 2022 | 1718 | 1030 | | | | | 2722 |
| 1.07 | 1601 | 1487 | 709 | | | | | 2015 |
| 1.10 | 841 | 942 | 300 | | | | | 1292 |
| 1.14 | 550 | 527 | 311 | | | | | 727 |
| 2.01 (15) | 376 | 313 | 259 | | | | | 633 |
| 2.07 (21) | 194 | 248 | 133 | | | | | 292 |
| 2.14 (28) | 96 | 74 | 82 | | | | | 145 |
| 3.01 (29) | 80 | 77 | 55 | | | | | 134 |
| 3.07 (35) | 30 | 29 | 16 | | | | | 95 |
| 3.14 (42) | 18 | 14 | 20 | | | | | 79 |
All 42 slots are in results.json (`slots.base`). From mid R1 onward the current curve is too high: about 1.5x at 1.06-1.10, 1.5-2x in R2, and 3-5x in R3.

## 2. Parametric fit V(k)=floor+(top-floor)exp(-d(k-1)), fit to per-slot means (the mean is the right estimand because a pick's value is its expected value)
Bootstrap: the exact by-class bootstrap, all 4^4=256 resamples of the 4 classes. Intervals are 5-95%.
| loss | top | d | floor | R2 (raw) |
|---|---|---|---|---|
| raw LS | 6387 [4659, 7986] | 0.259 [0.185, 0.409] | 102 [13, 182] | 0.981 |
| log LS | 3794 [2593, 5625] | 0.151 [0.139, 0.176] | ~0 [0, 6] | 0.843 |
| **quasi-Poisson WLS (var proportional to mean)** | **5762 [4113, 7401]** | **0.204 [0.184, 0.235]** | **37 [17, 77]** | 0.970 |
| power law, raw | a=7476, b=0.92, floor 0 | | | 0.925 |
| current | 5000 | 0.155 | 70 | |

Choice of loss: per-slot SD grows with the mean, but more slowly than the mean does. The CV is 0.58 in R1 and 0.91 in R3, so the variance sits between var proportional to mean and var proportional to mean^2.
- Raw LS lets R1 dominate and pushes the floor too high (102 against observed R3 means of about 30).
- Log LS lets the near-zero R3 values dominate and underprices 1.01 by about 45%.
- Quasi-Poisson weighting (weight 1/fitted) sits between the two. It fits R1 and R3 acceptably, and its CI on d is the tightest of the well-fitting forms.
- The power law fits worse than the exponential.

## 3. Class strength (class mean / pooled mean)
| | 2023 | 2024 | 2025 | 2026 | SD | mean per-slot CV |
|---|---|---|---|---|---|---|
| R1 | 1.00 | 0.47 | 0.93 | 1.60 | 0.46 | 0.58 |
| R2 | 1.09 | 0.82 | 1.06 | 1.03 | 0.12 | 0.61 |
| R3 | 1.14 | 1.07 | 0.96 | 0.84 | 0.13 | 0.91 |
| all | 1.01 | 0.50 | 0.94 | 1.54 | 0.42 | |
Almost all of the class-level risk sits in R1: one class SD is about 46% of value. At the level of a single slot, the CV is about 0.6 even once the class is known. An unknown-class future R1 pick should therefore carry about ±45% value uncertainty. A risk-neutral curve uses the mean, and any risk discount is a policy choice.

## 4. Realized check (2023-25 classes, NBA production through 2025)
Two measures of production:
- "rankV": fantasy points ranked within each season, mapped through Vbase, averaged over the seasons a player has had. This is era-normalized by construction.
- "normFP": fantasy points divided by the mean of that season's top 150.

| | R1 share | R2 share | R3 share | top3 / slots 4-14 | QP-fit d |
|---|---|---|---|---|---|
| market draft-night (2023-25) | 0.887 | 0.094 | 0.019 | 4.46 | 0.223 |
| realized rankV | 0.817 | 0.161 | 0.023 | 4.12 | 0.144 |
| realized normFP (linear scale) | 0.50 | 0.31 | 0.19 | 1.82 | n/a |
| current curve | 0.843 | 0.120 | 0.037 | | 0.155 |

On the value scale, the realized shape is broadly similar to the market's shape: R1 dominates and the top-3 premium is similar. Realized production decays somewhat more slowly than the market, with R2 earning about 16% of total value against the market's 9%.
- Player-level Spearman correlation with normFP: 0.54 for slot and 0.62 for draft-night market value.
- Realized levels are far below market levels (1.01 rankV 3125 vs 6721), as expected for 1-3 rookie seasons.
- Only the shape is informative here.

## 5. The 1.01 premium
- Market: mean(1.01) / mean(1.02, 1.03) = **1.66**.
- By class: 2.40 (2023), 0.88 (2024), 2.32 (2025), 1.16 (2026). This is extremely class-dependent.
- The QP fit implies 1.35 (5762 vs 4275). The current curve implies 1.25.
- If a 1.01 premium is wanted, add a separate bump: about +20-25% on k=1 relative to the QP curve (to reach about 7000), with a very wide CI (0.9-2.4x).
