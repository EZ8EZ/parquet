# Rookie prior study (post-doc B) — dynasty basketball, 2026 class

All paths under `scratchpad/postdoc-b/`. Repo untouched. Data pulled 2026-10-01.

## 0. Bottom line
- **Slot (NBA pick) is the only robust predictor of 3-yr fantasy production.** LOCO (leave-one-class-out) R² of within-class production percentile: pick 0.40-0.46; archived Sleeper ADP 0.28; ADP+pick+age 0.39 (no gain over pick).
- **College FP/40 adds nothing out-of-sample** (ADP&college n=162: ADP 0.187 -> +fp40 0.191; pick+age 0.360 -> +fp40 0.353). In-sample partial rho given ADP is +0.28 (n=162, 2020-23) but swings by class (-0.11, 0.26, 0.31, 0.53) and falls to +0.15 (n=244) once 2024-25 are added.
- **Age at draft:** raw rho -0.16, but that is slot-mediated. Given ADP it is slightly *positive* (+0.15, n=192) and given pick also (+0.16, n=185 college): older = a bit better in a 3-yr window. LOCO gain only +0.01 R². Horizon-biased; not evidence against a youth premium over a dynasty horizon.
- **Market vs slot:** best market blend weight 0.20-0.30 (CI ~0-0.6); 50/50 loses <=0.02 CV R² vs optimum and always beats market-only. Archived ADP is noisy/coarse (see §6), so do not over-read.
- **Ship:** `P = clip(0.936*exp(-pick/43.8), 0, 1)` = expected within-class percentile of 3-season era-normalized fantasy points; haircut -0.16 for non-college picks after #14. College and age neutral.

## 1. Dataset (dataset.json / dataset.csv, 413 rows, 62 cols)
| class | picks | college | reliable FP/40 | Sleeper-matched | ADP (<999) | seasons observed |
|---|---|---|---|---|---|---|
| 2020 | 60 | 49 | 47 | 60 | 54 | 3 |
| 2021 | 60 | 51 | 49 | 60 | 53 | 3 |
| 2022 | 58 | 44 | 43 | 58 | 31 | 3 |
| 2023 | 58 | 46 | 46 | 58 | 54 | 3 (2023-24..2025-26 all complete) |
| 2024 | 58 | 43 | 43 | 58 | 51 | 2 |
| 2025 | 59 | 46 | 45 | 59 | 53 | 1 |
| 2026 | 60 | 54 | 53 | 60 | 57 | n/a |
- Forfeited picks excluded (2022/23 had 58; 2024 #59-60; 2025 #60 blank). Source: BBRef draft pages (pick, college, NBA G); Wikipedia draft tables (pre-draft club/class year, nationality, 80 non-college rows = 64 intl pro, 13 G League Ignite, 2 OTE, 1 prep); CBB (sports-reference) school-year pages (per-game, advanced: BPM/PER/USG/TS/WS40); birth dates from Sleeper (Jack Kayil 2006-01-27 from web, flagged `birth_source`).
- Age = (draft date - birth_date)/365.25; draft dates 2020-11-18, 2021-07-29, 2022-06-23, 2023-06-22, 2024-06-26, 2025-06-25, 2026-06-23.
- College line = last college season (always = draft year except Petrusev: 2019-20, flagged). `college_stats_reliable` = season==draft year and >=300 total minutes (326 rows). Null by design: 80 non-college, Scrubb (JUCO), Sharpe (0 college games). Spot checks: Flagg 19.2/7.5/4.2, Cunningham 20.1/6.2/3.5, Edwards 19.1/5.2/2.8 match.
- FP/40 = (0.5 pts + reb + ast + 2 stl + 2 blk - tov + 0.5 3PM)/mpg*40 (dd/td ignored). Per-40 lines, BPM/OBPM/DBPM/PER/USG/TS/WS40 included.
- **Sleeper mapping: 413/413.** High 360 (318 verified: BBRef career G vs Sleeper gp 2020-25 within +-2; 42 = league id list); medium 53 (35 players with <10 NBA G where games agree within 1; 18 name-unique 2026 non-league). Overrides: Ron Holland->2836 (Ronald Holland), Nikola Djurisic->2757 (Durisic), Jaylin Williams disambiguated by games. List: `matches_not_high_confidence.json`.
- **League's 42 ids (`coverage_42.json`): all 42 map to 2026 NBA draftees; none undrafted.** Picks 1-37, 41, 42, 45, 52, 56. 39 have a college line (38 reliable); 3 internationals null (Lopez #21, de Larrea #25, Ishchenko #56); Quaintance #20 has 4 college games (injury) -> flagged unreliable, FP/40 excluded. ADP present for all 42. The other 18 draftees (picks 38-60 gaps) are in the dataset but not league ids.

## 2. Outcome / method
- FP/season = 0.5pts+reb+ast+2stl+2blk-to+0.5tpm+dd+2td+2*bonus40+2*bonus50-2tf-2ff from Sleeper stats; Sleeper season Y = 2020-21 for Y=2020. Seasons 0 if absent.
- Era norm: FP_s / mean FP of qualified players that season (gp >= 50% of season max). Target = sum over first K<=3 seasons. Primary **T = within-class percentile (avg ranks, ties=0s) of that sum** so K=1,2,3 classes pool.
- Sample A = 2020-23 (K=3, n=236). Sample B = A + 2024 (K=2) + 2025 (K=1) (n=353). Conclusions given for both. Predictors: pick, age, FP/40 (+BPM as the one pre-listed secondary), adp_dynasty. Bootstrap = 1,000-2,000 player resamples; class-block bootstrap where noted.

## 3. (a) Spearman vs T (95% boot CI)
| | A: 2020-23 | B: 2020-25 | A, R1 only | A, top-30 by market |
|---|---|---|---|---|
| pick | -0.667 [-0.73,-0.58] n=236 | -0.630 n=353 | -0.485 n=120 | -0.672 n=144 |
| age | -0.159 [-0.29,-0.04] n=236 | -0.159 n=353 | -0.002 n=120 | -0.121 n=144 |
| FP/40 | +0.225 [0.08,0.36] n=185 | +0.142 [0.02,0.25] n=273 | +0.342 [0.15,0.50] n=97 | +0.299 n=119 |
| BPM | +0.263 n=185 | +0.163 n=273 | +0.275 n=97 | +0.319 n=119 |
| adp | -0.580 [-0.68,-0.47] n=192 | -0.564 n=296 | -0.473 n=116 | -0.620 n=144 |
- Never-played "easy zeros" do not drive it: restricting to played>=1 game moves rho by <=0.02 (pick -0.648 n=221). Late-bloom target (seasons 2+3 only, A): pick -0.633, age -0.147, FP/40 +0.225, adp -0.543 (n=192).
- By class FP/40 rho: 2020 -0.02, 2021 +0.14, 2022 +0.37, 2023 +0.45, 2024 -0.05, 2025 +0.03 (K=2,1 classes show nothing).
- Collinearity: pick~adp 0.82, pick~age 0.45, adp~age 0.47, FP/40~pick -0.07, FP/40~adp -0.10, FP/40~age 0.28. On the same ADP-available sample (n=192) pick LOCO Spearman 0.653 > ADP 0.542.

## 4. (b) Increment given the market (ADP)
Partial Spearman given adp_dynasty (n; 95% CI; per-class):
| X | A all (n=192/162) | A R1 only | B all (n=296/244) |
|---|---|---|---|
| pick | -0.39 [-0.54,-0.22]; cls -0.29,-0.52,-0.59,-0.11 | -0.19 [-0.38,0.01] | -0.33 [-0.45,-0.21] |
| age | +0.15 [0.01,0.28]; cls +0.10,+0.10,+0.27,+0.18 | +0.23 [0.06,0.38] | +0.11 [0.00,0.22] |
| FP/40 | +0.28 [0.12,0.43]; cls -0.11,+0.26,+0.31,+0.53; class-block CI [0.04,0.48] | +0.29 [0.09,0.47]; block CI [-0.16,0.55] | +0.15 [0.02,0.27]; block CI [-0.06,0.37] |
| BPM | +0.27 [0.12,0.40] | +0.23 | +0.15 |
OLS on within-class ranks (std betas, boot CI), A: T~adp+pick+age n=192: adp -0.21 [-0.38,-0.05], pick -0.56 [-0.71,-0.38], age +0.17 [0.05,0.28], R² 0.453 vs ADP-only 0.310 (dR² 0.143 [0.07,0.24]). Adding FP/40 (n=162): adp -0.12 [-0.31,0.05], pick -0.56, age +0.12 [-0.01,0.26], FP/40 +0.18 [0.04,0.30]; R² 0.432 vs ADP-only 0.234. adp+FP/40 only: dR² 0.043 [0.005,0.115] (A), 0.013 [0,0.05] (B). R1-only: FP/40 beta +0.28 [0.07,0.47] (A, n=95), +0.19 [0.03,0.36] (B, n=138); adp beta -0.18 [-0.41,0.09] with pick+age (A R1, n=116) and -0.01 once FP/40 is added (n=95): market adds little beyond slot in R1.
**Out-of-sample (LOCO, n in brackets)**: A [192]: rank-ADP R² 0.284; ln-pick 0.398; pick+age 0.399; ADP+pick+age 0.391. [162 ADP&college]: ADP 0.187, ADP+fp40 0.191, pick+age 0.360, +fp40 0.353, ADP+pick+age+fp40 0.318. In-sample FP/40 significance does not survive LOCO.
**Blend** yhat = w*market(rank ADP) + (1-w)*slot(ln pick + age), LOCO R²: best w = 0.20 [0.00,0.45] (A, 0.406 vs slot-only 0.399 vs market-only 0.284); B 0.25 [0.05,0.50]; A R1 0.25 [0,0.65]; A top-30-by-market 0.30 [0.05,0.60]; B top-30 0.45 [0.20,0.65]. At w=0.5 CV R² is within 0.01-0.02 of best in every cut. Per-class Spearman market/slot: 2020 .69/.69, 2021 .43/.67, 2022 .53/.72, 2023 .63/.59, 2024 .50/.55, 2025 .59/.56. Within R1 the market >= slot in 2020, 2023, 2024.

## 5. (c) Fallback when ADP missing
- ADP-missing players (A n=44; B n=57): mean pick 43.5, 4 of 44 in R1, 34% never played, mean T 0.275. A pooled slot+age model overpredicts them by -0.11 (A) / -0.15 (B). Fit on the missing group only (n=44): `T = 0.9815 - 0.19*ln(pick) - 0.005*(age-20)`.
- LOCO R² (A, n=236): ln-pick 0.416 (linear 0.443, sqrt 0.454, exp-decay 0.453-0.456), +age 0.420; age alone 0.019. College subset (n=185): pick 0.368, +fp40 0.362, +age+fp40 0.362, +BPM 0.363, fp40 only 0.011, age+fp40 w/o slot 0.045. => **fallback = slot (+tiny age), no college.**
- Fitted (A n=236): `T = 1.179 - 0.2179*ln(pick) + 0.0166*(age-20)` (95% CI age [-0.005,0.038]); all classes (n=353): 1.1625, -0.215, +0.022 [0.005,0.039]; pick-only ln: 1.162 - 0.2089 ln(pick). Exp-decay forms below are better.
- Non-college (intl/Ignite/OTE) residual vs slot-only prior: picks<=14 -0.02 (n=20 vs 64, p=0.72); picks 15-30 -0.13 (n=14, p=0.05); picks 31-60 -0.17 (n=40, p<0.001); all >14: -0.16 [-0.23,-0.10] (54 vs 215). Draft-and-stash is the likely driver.

## 6. (d) Shippable prior
`P(pick) = clip(A*exp(-pick/tau), 0, 1)` — expected within-class percentile of 3-season era-normalized fantasy points.
| fit | n | A | tau | age term d*(age-20) | LOCO R² | resid SD |
|---|---|---|---|---|---|---|
| **pick only, 2020-23 (ship)** | 236 | 0.936 [0.881,0.995] | 43.8 [38.6,50.3] | - | 0.456 | 0.212 |
| pick+age, 2020-23 | 236 | 0.9535 | 40.2 [34.9,46.8] | +0.0234 [0.003,0.046] | 0.466 | 0.210 |
| pick only, 2020-25 | 353 | 0.908 | 46.3 [41.0,53.1] | - | 0.405 | 0.222 |
| pick+age, 2020-25 | 353 | 0.9377 | 40.2 | +0.0284 [0.012,0.044] | 0.422 | 0.219 |
- FP units: E[sum of 3 season FP/qualified-season-mean] = 4.06*exp(-pick/24.4) (3.0 = qualified-average for 3 seasons).
- Calibration (A; observed T / predicted / mean normalized FP): 1-3 .89/.90/4.0; 4-5 .87/.85/3.6; 6-10 .77/.78/2.6; 11-14 .63/.70/2.0; 15-20 .68/.63/2.2; 21-30 .58/.52/1.6; 31-40 .38/.42/0.85; 41-50 .28/.33/0.51; 51-60 .32/.27/0.66. Within-bucket SD of T 0.10-0.24: single-player uncertainty is large.
- Recommendation: ship pick-only; **age and college neutral**; non-college haircut -0.16 for pick>14; blend 50/50 with the within-class ADP percentile when ADP exists; use pick-only (or ADP-missing fit above) when it does not. 2026 priors per pick: `results.json -> prior_2026` (e.g. #1 0.915, #5 0.835, #10 0.745, #20 0.593, #30 0.472, #45 0.335, #56 0.261 pick-only).

## 7. Red-team items (from peer agent)
1. **Missingness.** Non-college share of top-14 picks excluded from any FP/40 fit, by class: 2020 29%, 2021 21%, 2022 21%, 2023 36%, 2024 43%, 2025 14% (2026: 0%). Top-5: only 3/5, 4/5, 5/5, 1/5, 2/5, 5/5 covered. All college-stat fits are on the matched subset only; the recommended prior does not use college stats, so it covers everyone. For unmatched use slot-only (+ the non-college haircut after #14). `unresolved_pages.json` is now 1 entry (early listing was from a partial crawl).
2. **Incremental over the market.** §4: partials/blend given ADP, per-class values and class-block bootstrap. Caveat: `adp_dynasty` from `projections/nba/regular/{year}` is not verified point-in-time (2020-22 values are integers, 2020 median 900, 2022 only 31/58 covered; 2023+ fractional averages). Slot beating ADP argues against hindsight leakage but also says the archived ADP is noisy. The live 2026 ADP (57/60, fractional) is better measured, so w_market is probably understated; 0.5 is the defensible default.
3. **Horizon/target.** Primary conclusions use K=3 classes only (A); B shows sensitivity: FP/40 falls from +0.28 to +0.15 partial, age from +0.15 to +0.11; pick/ADP conclusions unchanged. 2024/2025 FP/40 per-class rho ~0. Late-bloom target (seasons 2-3) gives the same ordering. Never-played zeros are not driving results (played-only and R1-only and top-30-by-market tables above).
4. **Forking paths.** Predictors fixed ex ante: pick, age, FP/40 (+BPM once); no scan of usg/TS/conference/position. ~4 predictors x 2 samples x 5 subsets of tests are reported without multiplicity correction, so model selection rests on LOCO and per-class stability, not p-values. Age is draft-night age; age~pick rho 0.45, but partial given pick (+0.15) has the opposite sign of the raw rho (-0.16), so it is not a pure slot proxy; its effect is small and horizon-limited.

## 8. Caveats
n small (6 classes; per-class n~50-60); partial correlations are noisy and class-heterogeneous; 2024/25 outcomes truncated; Sleeper gp can differ from BBRef by 1-2 games; 2020-21 was a 72-game season; qualified threshold arbitrary (50% of max gp); Sleeper stats have no minutes filter for bonus/dd; selection: players without ADP are mostly late picks; stash players get zero by construction; Sleeper `adp_dynasty` semantics unknown; college efficiency is context-dependent (pace, competition, role) and FP/40 ignores that; no conference/strength-of-schedule adjustment. 2026 class: no outcomes, only priors.
