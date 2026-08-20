/**
 * IN-LEAGUE PRODUCTION, MEASURED - the model's first per-player input.
 *
 * Until this file existed, a player's price in this app descended entirely from
 * `search_rank`: Sleeper's REDRAFT POPULARITY ORDINAL. Everything else was a multiplier
 * on top of it - age, injury, depth-chart role, position - so values, tiers, TCI, RFI,
 * the power ranking, the trade evaluator and the trade finder all rested on a number
 * that is not a measurement of how anybody played. For an app whose premise is an
 * honest record derived from real league history, that was the sharpest gap available.
 *
 * The table below closes part of it. `scripts/derive-production.js` carries the method,
 * the endpoint semantics, the four confounds and the argument for every constant; it is
 * run by hand and its output is pasted here, exactly as `./ageCurve.js` does. The
 * cold-start reason is stronger here than there: `lib/history.js`'s `loadMatchups` is
 * DELIBERATELY fixture-only because loading weekly matchups live costs ~110 requests
 * and ~15s, so this input could not be computed per request even if D25 allowed it.
 *
 * ---------------------------------------------------------------------------------
 * WHAT THE INDEX IS
 * ---------------------------------------------------------------------------------
 * Mean fantasy points a player banked PER ROSTERED WEEK in this league, zeros included,
 * era-normalized so 1.000 is an average qualifying player-season, combined across the
 * two most recent completed seasons at 0.54 / 0.46. This league runs Sleeper's LOCK-IN
 * format, so a week's figure is ONE GAME, not a weekly sum - which makes the index
 * denominated in the currency this league actually pays in.
 *
 * ---------------------------------------------------------------------------------
 * HOW IT IS USED, AND THE PROPERTY THAT MAKES IT SAFE (D55)
 * ---------------------------------------------------------------------------------
 * NOT as a multiplier. D55's standing rule is that an absolute threshold on a
 * rescalable scale is a defect on sight, and the app is full of them: `STAR_VALUE`
 * (3000) in lib/tradefinder, `STAR_THRESHOLD` (4500) and `DEAD_THRESHOLD` (250) in
 * lib/gameplan, the 400 and 700 literals beside them, and `EXPOSURE_REF` in
 * lib/metrics/fragility.js, which the age-curve recalibration already saturated once.
 * Another multiplier folded into `theoreticalMaxMultiplier` would have moved every
 * price in the product and put all of those back in play at once.
 *
 * So production does not move the value SCALE at all. It REORDERS WHO SITS ON IT.
 *
 * `effectiveRanks()` takes the set of players who have both a `search_rank` and a
 * production index, blends the two as PERCENTILES, re-ranks the set by that blend, and
 * then hands each player back the search rank belonging to his NEW position in the set.
 * The multiset of ranks going in is the multiset of ranks coming out - it is a
 * permutation, by construction - so `base = maxValue * exp(-rankDecay * (rank - 1))`
 * produces exactly the same collection of base values as before, assigned to different
 * players. `maxValue`, `rankDecay`, `theoreticalMaxMultiplier` and D28's fixed 1.16 age
 * peak are all untouched, and no constant sitting on the value scale sees a distribution
 * it has not already been calibrated against.
 *
 * This is also the honest shape for the evidence. Production earned a claim about
 * ORDERING - who should be ahead of whom - and nothing at all about dynasty price
 * levels, which no in-league measurement can supply.
 *
 * ---------------------------------------------------------------------------------
 * THE WEIGHT IS 0.23, AND THE FIRST MEASUREMENT SAID ZERO
 * ---------------------------------------------------------------------------------
 * Worth recording plainly, because it nearly killed the feature and it is the reason
 * the weight is small.
 *
 * ASKED THE OBVIOUS QUESTION FIRST: does past in-league production predict NEXT
 * SEASON's in-league production better than `search_rank` does? It does not, and it is
 * not close. Predicting 2025 production (n = 209): `search_rank` alone rho = 0.590,
 * prior production alone rho = 0.420, and the partial correlation of production GIVEN
 * `search_rank` is -0.051 (z = -0.73). Every blend weight above zero made the forecast
 * worse, monotonically, on all five candidate metrics tried. Sleeper's ordinal is a
 * live human forecast that already embeds injuries, trades and role changes; a
 * three-season average of banked points cannot beat it at a one-season-ahead question,
 * and the two are largely the same signal anyway (rho between them is 0.76 to 0.84).
 *
 * A redraft ordinal being good at a redraft question is not, however, the question this
 * model asks. A dynasty value is a claim about the NEXT SEVERAL seasons. Re-run against
 * that target - the discounted sum of the following THREE seasons of production, with a
 * ZERO for a season the player did not produce in, the same survivorship discipline
 * `./ageCurve.js` uses - production separates cleanly from the ordinal:
 *
 *     rho(target, search_rank)          0.889
 *     rho(target, production)           0.664
 *     PARTIAL rho(production | search_rank)   0.412   (n = 243, ~SE 0.065, z = 6.4)
 *     standardized OLS weight on production   0.233
 *     R^2   0.826   against   0.790 for search_rank alone
 *
 * That is the whole case, and it is narrow on purpose: the consensus ordinal is better
 * at next season, production carries real independent information about the seasons
 * AFTER next, and a dynasty price is about the latter. 0.23 is the measured OLS weight,
 * used as measured rather than rounded up.
 *
 * TWO WAYS THIS NUMBER IS CONSERVATIVE, both worth stating. The `search_rank` snapshot
 * is from Aug 2026 and the target window is 2023-25, so the incumbent predictor is
 * scored WITH HINDSIGHT over the thing it is predicting and production is not - the
 * comparison is tilted toward search_rank and 0.23 is therefore a floor. And the
 * calibration used a SINGLE season of production as the predictor, while the shipped
 * index averages two, which can only be less noisy.
 *
 * ONE WAY IT IS GENEROUS, equally worth stating: the target counts a season the player
 * did not produce in as a zero, and in this league "did not produce" partly means "was
 * not rostered by any of fourteen managers". So some of what production predicts is
 * RETENTION - whether this league will still want him - rather than production itself.
 * For a price in this league those are not fully separable, and pretending the target
 * is pure production would be the dishonest version.
 *
 * ---------------------------------------------------------------------------------
 * THE ONE CONFOUND WORTH NAMING HERE
 * ---------------------------------------------------------------------------------
 * All four are argued in `scripts/derive-production.js` - opportunity, the manager's lock
 * choice, selection on who got rostered, and availability - but the fourth is the one a
 * reader of THIS file needs up front, because it overlaps another term in the same model.
 * A player hurt for eleven weeks banked eleven zeros, so production charges him for an
 * absence `./injury.js` is also looking at: 12 of the 20 largest value drops on the live
 * league carry a current injury flag, against 3.9 expected by chance. The terms are not
 * redundant (injury prices FORWARD risk from a current flag and sits near 1.0 for most of
 * them; production records output that did not happen), and on real numbers the stacking
 * is usually mild - but on Tyrese Haliburton it is a 0.73 injury multiplier AND a -1,917
 * production drop for one Achilles rupture. Deliberately not fixed in this pass; the
 * script carries the variant that was measured and rejected, and why.
 *
 * ---------------------------------------------------------------------------------
 * WHAT IT DOES NOT COVER (D19)
 * ---------------------------------------------------------------------------------
 * 325 players are indexed. 246 of the 250 currently rostered players - 98.4% - are
 * among them, which is high for one specific and temporary reason: the 2026 rookie
 * draft has not run yet, so every current roster is last season's roster. The moment it
 * runs, every drafted rookie will be a player this table cannot price, and so is anyone
 * signed off the wire who has not spent eight weeks on a roster here.
 *
 * Those players are NOT given a zero and NOT given a league-average guess. They keep
 * their `search_rank` exactly as before, `productionBacked` is false, and the app says
 * so - `/methodology` names them and counts them. A player missing from this table
 * tells you nothing about the player: this league holds ~266 roster spots against ~500
 * NBA players who play real minutes, so absence is a fact about fourteen managers'
 * choices, not about him.
 *
 * ---------------------------------------------------------------------------------
 * DELIBERATELY NOT DONE
 * ---------------------------------------------------------------------------------
 * D74's star-tier age adjustment selects its cohort with `isStarTier(player.searchRank)`
 * - the RAW search rank, not the production-blended one, and that is left alone on
 * purpose even though D74's own derivation defined its star cohort by era-relative
 * PRODUCTION and used the consensus ordinal only as the proxy available at the time.
 * Re-pointing it at this index would change which players the adjustment selects
 * without re-measuring the adjustment against the new cohort, and it would tangle two
 * effects in one change so that neither could be attributed. It is a real follow-up,
 * not a thing to slip in.
 */
/**
 * @typedef {Object} ProductionRow
 * @property {number} index era-normalized mean points banked per rostered week; 1.0 = average
 * @property {number} weeks rostered weeks the index is computed from
 * @property {number} seasons qualifying seasons in the window (1 or 2)
 */
/**
 * PLAYER ID, INDEX, ROSTERED WEEKS, QUALIFYING SEASONS - in that order, sorted by
 * index descending. Compact tuples rather than objects because there are 325 rows and
 * the shape is documented once here; `PRODUCTION_BY_PLAYER` below is the read path.
 *
 * Pasted from `pnpm derive:production`. Do not hand-edit: like the age curve, this is a
 * measurement, and hand-editing a measurement is how a measurement stops being one.
 * @type {[string, number, number, number][]}
 */
export const DERIVED_PRODUCTION = [
  ["1658", 2.751, 46, 2],
  ["1613", 2.261, 47, 2],
  ["1970", 2.245, 46, 2],
  ["2577", 2.158, 46, 2],
  ["2267", 2.137, 46, 2],
  ["2308", 2.127, 46, 2],
  ["1845", 2.010, 46, 2],
  ["1957", 2.004, 46, 2],
  ["1240", 2.000, 46, 2],
  ["2289", 1.969, 46, 2],
  ["2133", 1.930, 46, 2],
  ["1362", 1.864, 46, 2],
  ["2574", 1.859, 46, 2],
  ["1846", 1.857, 46, 2],
  ["1747", 1.853, 46, 2],
  ["1711", 1.837, 46, 2],
  ["1716", 1.833, 46, 2],
  ["1967", 1.830, 46, 2],
  ["2126", 1.828, 46, 2],
  ["2313", 1.822, 46, 2],
  ["2463", 1.783, 23, 1],
  ["1380", 1.781, 46, 2],
  ["1433", 1.770, 46, 2],
  ["1830", 1.741, 46, 2],
  ["2284", 1.737, 46, 2],
  ["2449", 1.707, 46, 2],
  ["1350", 1.702, 46, 2],
  ["2438", 1.700, 46, 2],
  ["1535", 1.697, 46, 2],
  ["2143", 1.678, 46, 2],
  ["2259", 1.669, 46, 2],
  ["1803", 1.668, 46, 2],
  ["1872", 1.666, 46, 2],
  ["1486", 1.665, 46, 2],
  ["2055", 1.645, 23, 1],
  ["2181", 1.627, 46, 2],
  ["1648", 1.608, 46, 2],
  ["4740", 1.602, 23, 1],
  ["2422", 1.576, 19, 1],
  ["2285", 1.573, 46, 2],
  ["2458", 1.554, 46, 2],
  ["1321", 1.543, 46, 2],
  ["1308", 1.511, 46, 2],
  ["4760", 1.501, 23, 1],
  ["2728", 1.498, 46, 2],
  ["1697", 1.498, 46, 2],
  ["1787", 1.490, 46, 2],
  ["4737", 1.483, 23, 1],
  ["1450", 1.470, 46, 2],
  ["2179", 1.457, 46, 2],
  ["1975", 1.456, 46, 2],
  ["1434", 1.455, 45, 2],
  ["1085", 1.454, 46, 2],
  ["1831", 1.448, 46, 2],
  ["2136", 1.441, 46, 2],
  ["1988", 1.432, 47, 2],
  ["2233", 1.431, 26, 1],
  ["1913", 1.422, 46, 2],
  ["2032", 1.411, 46, 2],
  ["1595", 1.396, 46, 2],
  ["2580", 1.392, 47, 2],
  ["2135", 1.385, 46, 2],
  ["1924", 1.382, 46, 2],
  ["1525", 1.368, 46, 2],
  ["4751", 1.360, 23, 1],
  ["2258", 1.356, 35, 2],
  ["2316", 1.340, 46, 2],
  ["2613", 1.327, 46, 2],
  ["2086", 1.291, 46, 2],
  ["1739", 1.290, 46, 2],
  ["1822", 1.286, 46, 2],
  ["1272", 1.273, 46, 2],
  ["2142", 1.272, 46, 2],
  ["2001", 1.267, 46, 2],
  ["2296", 1.259, 11, 1],
  ["2726", 1.244, 46, 2],
  ["2007", 1.240, 46, 2],
  ["2474", 1.222, 29, 1],
  ["2054", 1.220, 46, 2],
  ["2036", 1.219, 46, 2],
  ["1589", 1.219, 46, 2],
  ["1339", 1.211, 23, 1],
  ["2029", 1.205, 46, 2],
  ["2293", 1.203, 11, 1],
  ["1809", 1.202, 46, 2],
  ["1000", 1.200, 46, 2],
  ["2722", 1.198, 46, 2],
  ["2733", 1.198, 46, 2],
  ["1945", 1.194, 46, 2],
  ["4793", 1.193, 21, 1],
  ["1934", 1.178, 46, 2],
  ["2010", 1.176, 24, 1],
  ["2564", 1.173, 46, 2],
  ["1964", 1.172, 46, 2],
  ["1487", 1.166, 46, 2],
  ["1718", 1.160, 46, 2],
  ["2835", 1.159, 46, 2],
  ["1752", 1.138, 46, 2],
  ["1883", 1.137, 46, 2],
  ["2566", 1.133, 46, 2],
  ["1998", 1.131, 46, 2],
  ["1254", 1.127, 37, 2],
  ["2152", 1.127, 32, 2],
  ["2455", 1.126, 46, 2],
  ["2461", 1.126, 46, 2],
  ["2453", 1.125, 46, 2],
  ["4748", 1.116, 23, 1],
  ["2281", 1.103, 46, 2],
  ["2065", 1.103, 46, 2],
  ["2445", 1.101, 46, 2],
  ["1319", 1.098, 30, 1],
  ["1082", 1.096, 39, 2],
  ["1749", 1.095, 11, 1],
  ["2752", 1.089, 15, 1],
  ["1637", 1.081, 46, 2],
  ["1583", 1.081, 46, 2],
  ["4750", 1.080, 23, 1],
  ["1974", 1.080, 46, 2],
  ["2768", 1.058, 14, 1],
  ["1614", 1.046, 23, 1],
  ["2490", 1.043, 8, 1],
  ["4758", 1.042, 23, 1],
  ["2141", 1.039, 21, 1],
  ["1526", 1.039, 47, 2],
  ["1200", 1.029, 9, 1],
  ["2715", 1.025, 46, 2],
  ["2447", 1.023, 46, 2],
  ["2494", 1.020, 41, 2],
  ["1941", 1.017, 16, 1],
  ["2157", 1.017, 46, 2],
  ["2454", 1.014, 32, 2],
  ["2476", 1.009, 46, 2],
  ["1698", 1.008, 46, 2],
  ["2714", 1.005, 45, 2],
  ["1779", 1.004, 46, 2],
  ["2568", 1.003, 46, 2],
  ["2583", 1.002, 46, 2],
  ["2146", 1.001, 46, 2],
  ["2565", 1.000, 46, 2],
  ["1178", 0.999, 32, 2],
  ["1541", 0.999, 29, 1],
  ["2309", 0.999, 46, 2],
  ["1074", 0.993, 47, 2],
  ["2766", 0.990, 46, 2],
  ["2590", 0.990, 46, 2],
  ["2009", 0.990, 45, 2],
  ["2091", 0.989, 46, 2],
  ["1983", 0.983, 46, 2],
  ["1841", 0.981, 12, 1],
  ["2304", 0.976, 46, 2],
  ["2468", 0.972, 35, 2],
  ["2440", 0.970, 46, 2],
  ["1265", 0.969, 46, 2],
  ["1799", 0.963, 46, 2],
  ["1604", 0.961, 46, 2],
  ["2724", 0.960, 46, 2],
  ["1511", 0.950, 46, 2],
  ["2161", 0.949, 46, 2],
  ["2720", 0.944, 46, 2],
  ["2435", 0.936, 46, 2],
  ["2012", 0.936, 46, 2],
  ["1792", 0.932, 42, 2],
  ["1516", 0.930, 15, 1],
  ["2456", 0.923, 46, 2],
  ["1821", 0.923, 22, 1],
  ["1707", 0.912, 24, 1],
  ["2586", 0.902, 46, 2],
  ["2441", 0.902, 46, 2],
  ["2275", 0.900, 46, 2],
  ["2457", 0.900, 46, 2],
  ["1997", 0.894, 46, 2],
  ["2475", 0.893, 27, 1],
  ["2776", 0.887, 14, 1],
  ["2492", 0.882, 9, 1],
  ["2145", 0.870, 42, 2],
  ["4764", 0.867, 23, 1],
  ["2119", 0.866, 26, 1],
  ["2302", 0.862, 46, 2],
  ["4754", 0.861, 23, 1],
  ["1081", 0.857, 46, 2],
  ["2040", 0.855, 46, 2],
  ["1512", 0.845, 46, 2],
  ["2581", 0.839, 28, 1],
  ["2324", 0.838, 13, 1],
  ["2603", 0.834, 31, 2],
  ["2299", 0.832, 43, 2],
  ["1632", 0.829, 23, 1],
  ["2020", 0.827, 32, 2],
  ["1621", 0.819, 28, 1],
  ["2608", 0.819, 11, 1],
  ["2563", 0.817, 46, 2],
  ["2050", 0.815, 32, 2],
  ["2600", 0.814, 10, 1],
  ["1959", 0.812, 46, 2],
  ["2255", 0.804, 46, 2],
  ["1590", 0.801, 46, 2],
  ["2131", 0.798, 43, 2],
  ["2772", 0.797, 23, 1],
  ["2753", 0.794, 45, 2],
  ["4743", 0.794, 23, 1],
  ["1444", 0.788, 46, 2],
  ["4777", 0.788, 23, 1],
  ["2262", 0.782, 43, 2],
  ["2737", 0.778, 46, 2],
  ["2305", 0.771, 46, 2],
  ["2165", 0.763, 26, 1],
  ["2748", 0.758, 23, 2],
  ["2156", 0.753, 15, 1],
  ["2571", 0.753, 46, 2],
  ["2095", 0.751, 46, 2],
  ["2719", 0.750, 46, 2],
  ["2159", 0.747, 46, 2],
  ["1972", 0.741, 27, 2],
  ["2432", 0.727, 18, 1],
  ["1892", 0.726, 34, 2],
  ["2280", 0.722, 22, 1],
  ["1128", 0.718, 26, 1],
  ["4808", 0.705, 10, 1],
  ["2434", 0.702, 22, 1],
  ["1676", 0.698, 23, 1],
  ["4757", 0.696, 23, 1],
  ["2836", 0.695, 46, 2],
  ["2711", 0.693, 46, 2],
  ["2718", 0.692, 46, 2],
  ["4778", 0.686, 15, 1],
  ["2053", 0.683, 8, 1],
  ["2606", 0.683, 31, 2],
  ["1257", 0.677, 40, 2],
  ["1690", 0.661, 38, 2],
  ["2710", 0.655, 39, 2],
  ["2144", 0.650, 46, 2],
  ["2416", 0.649, 46, 2],
  ["1054", 0.648, 46, 2],
  ["2597", 0.642, 23, 1],
  ["1713", 0.631, 46, 2],
  ["2480", 0.630, 46, 2],
  ["4738", 0.625, 23, 1],
  ["2709", 0.623, 23, 1],
  ["2118", 0.611, 23, 1],
  ["2465", 0.610, 8, 1],
  ["4739", 0.607, 23, 1],
  ["1801", 0.606, 29, 1],
  ["2578", 0.605, 46, 2],
  ["4744", 0.599, 23, 1],
  ["2090", 0.599, 41, 2],
  ["2589", 0.586, 22, 1],
  ["1887", 0.585, 46, 2],
  ["4755", 0.583, 23, 1],
  ["2286", 0.570, 46, 2],
  ["2723", 0.566, 46, 2],
  ["1585", 0.564, 46, 2],
  ["2712", 0.562, 46, 2],
  ["2620", 0.560, 46, 2],
  ["4752", 0.553, 23, 1],
  ["1131", 0.550, 29, 1],
  ["2413", 0.537, 14, 1],
  ["2576", 0.534, 24, 1],
  ["4773", 0.534, 22, 1],
  ["1717", 0.528, 46, 2],
  ["2278", 0.517, 46, 2],
  ["4794", 0.503, 23, 1],
  ["2596", 0.500, 28, 1],
  ["1534", 0.494, 24, 1],
  ["2256", 0.492, 17, 1],
  ["1378", 0.491, 31, 2],
  ["4804", 0.483, 23, 1],
  ["1950", 0.481, 32, 2],
  ["1871", 0.472, 23, 1],
  ["4742", 0.472, 23, 1],
  ["1798", 0.467, 34, 2],
  ["2713", 0.456, 46, 2],
  ["2439", 0.451, 46, 2],
  ["2569", 0.448, 23, 1],
  ["2451", 0.447, 46, 2],
  ["2292", 0.445, 20, 1],
  ["4759", 0.440, 23, 1],
  ["2125", 0.434, 16, 1],
  ["4745", 0.415, 23, 1],
  ["2736", 0.410, 46, 2],
  ["2306", 0.406, 46, 2],
  ["4746", 0.382, 23, 1],
  ["4791", 0.378, 23, 1],
  ["2591", 0.350, 23, 1],
  ["1727", 0.348, 23, 1],
  ["2725", 0.348, 42, 2],
  ["4749", 0.347, 23, 1],
  ["2482", 0.346, 20, 2],
  ["2717", 0.320, 46, 2],
  ["4753", 0.316, 23, 1],
  ["1546", 0.311, 23, 1],
  ["2584", 0.307, 46, 2],
  ["2567", 0.289, 23, 1],
  ["2573", 0.286, 46, 2],
  ["2763", 0.277, 35, 2],
  ["2582", 0.253, 46, 2],
  ["4761", 0.251, 23, 1],
  ["2105", 0.247, 14, 1],
  ["2729", 0.236, 46, 2],
  ["4765", 0.232, 23, 1],
  ["4756", 0.229, 23, 1],
  ["4741", 0.195, 23, 1],
  ["4781", 0.187, 8, 1],
  ["4763", 0.158, 23, 1],
  ["4747", 0.144, 23, 1],
  ["4792", 0.144, 23, 1],
  ["2738", 0.139, 25, 1],
  ["2716", 0.116, 46, 2],
  ["2572", 0.111, 23, 1],
  ["2297", 0.084, 24, 1],
  ["2721", 0.081, 25, 1],
  ["2765", 0.079, 46, 2],
  ["2481", 0.071, 23, 1],
  ["2755", 0.063, 46, 2],
  ["2575", 0.052, 27, 1],
  ["2730", 0.050, 46, 2],
  ["2466", 0.041, 16, 1],
  ["4774", 0.034, 23, 1],
  ["2593", 0.018, 23, 1],
  ["2732", 0.018, 23, 1],
  ["2621", 0.015, 24, 1],
  ["2769", 0.012, 23, 1],
  ["2734", 0.007, 46, 2],
  ["1999", 0.000, 8, 1],
  ["4736", 0.000, 23, 1],
  ["4762", 0.000, 23, 1],
];
/** Provenance, stated wherever the index is shown. */
export const PRODUCTION_PROVENANCE = {
  /** Seasons in the window, most recent first, Sleeper's start-year convention (D14). */
  seasons: ["2025", "2024"],
  /** Player-seasons clearing the rostered-weeks floor. */
  playerSeasons: 534,
  /** Player-weeks of `players_points` read to build the table. */
  playerWeeks: 11939,
  /** League-week requests the derivation makes. Offline; never on a render path. */
  requests: 46,
  /** Rostered weeks a player-season needs before it is scored at all. */
  minWeeks: 8,
  /** Combination weights across the window, from measured lag-1 / lag-2 persistence. */
  recency: [0.54, 0.46],
  /** Rank-rank persistence of the metric by lag, which is why the window is 2. */
  persistence: [
    { lag: 1, rho: 0.541, n: 633 },
    { lag: 2, rho: 0.455, n: 356 },
    { lag: 3, rho: 0.192, n: 153 },
  ],
  /** Split-half reliability of the weekly mean, and the shrinkage constant it implies. */
  splitHalf: { r: 0.932, n: 964, impliedK: 0.8 },
  /** The date `scripts/derive-production.js` was last run. */
  derivedOn: "2026-08-20",
};
/**
 * THE BLEND WEIGHT. 0.23, the standardized OLS weight production earns against
 * `search_rank` on a three-season-forward target - see this file's header for the full
 * measurement, including the run that said zero.
 */
export const PRODUCTION_WEIGHT = 0.23;
/**
 * Fewest blendable players before `effectiveRanks` declines to blend at all.
 *
 * The construction is a PERMUTATION of a pool's own search ranks, so a tiny pool would
 * shuffle a handful of players across the whole value scale on almost no evidence -
 * with three players it could hand the worst of them the best rank in the set. 40 is
 * comfortably below the 246 the real league supplies and comfortably above the size at
 * which a permutation stops being a nudge. A pool under it falls back whole, and every
 * player in it reads `productionBacked: false`, so the refusal is visible rather than
 * silent (D19).
 */
export const MIN_BLEND_POOL = 40;
/** @type {Map<string, ProductionRow>} */
export const PRODUCTION_BY_PLAYER = new Map(
  DERIVED_PRODUCTION.map(([id, index, weeks, seasons]) => [
    id,
    { index, weeks, seasons },
  ]),
);
/**
 * This player's measured in-league production, or null if the league has never rostered
 * him for eight weeks in the window. Null is the honest answer and never 0 or 1.0.
 * @param {string} playerId
 * @returns {ProductionRow|null}
 */
export function productionOf(playerId) {
  return PRODUCTION_BY_PLAYER.get(playerId) ?? null;
}
/**
 * @typedef {Object} EffectiveRank
 * @property {number} rank the rank `valuePlayer` should price him at
 * @property {number} searchRank Sleeper's own ordinal, unchanged
 * @property {number} index his production index
 * @property {number} weeks rostered weeks behind the index
 * @property {number} seasons qualifying seasons behind the index
 */
/**
 * Blend production into the rank prior, as a permutation of the pool's own ranks.
 *
 * Returns entries ONLY for players who were actually blended. A caller must treat an
 * absent player as "price him on `searchRank` exactly as before" - that is the D19
 * fallback, and it is why this returns a sparse map rather than a rank for everybody.
 *
 * PERCENTILES, NOT RAW RANKS, on the way in. `search_rank` runs 1 to ~999 across the
 * corpus while the production table holds 325 players, so averaging the two raw numbers
 * would be averaging two different scales. Percentiles within the blendable pool put
 * both on [0, 1]; re-ranking and reading back the pool's own sorted search ranks puts
 * the result back on the real scale with the pool's exact distribution.
 *
 * TIES are broken by `searchRank` then `playerId`, so the output is deterministic
 * across renders and does not depend on the order the corpus happens to iterate in.
 * @param {{ playerId: string, searchRank?: number|null }[]} players
 * @param {number} [weight]
 * @returns {Map<string, EffectiveRank>}
 */
export function effectiveRanks(players, weight = PRODUCTION_WEIGHT) {
  /** @type {{ id: string, sr: number, prod: ProductionRow }[]} */
  const pool = [];
  for (const p of players) {
    if (p.searchRank == null) continue;
    const prod = PRODUCTION_BY_PLAYER.get(p.playerId);
    if (!prod) continue;
    pool.push({ id: p.playerId, sr: p.searchRank, prod });
  }
  /** @type {Map<string, EffectiveRank>} */
  const out = new Map();
  if (pool.length < MIN_BLEND_POOL || weight <= 0) return out;
  const n = pool.length;
  const span = n - 1;
  /** Percentile position, 0 = best. */
  /** @type {Map<string, number>} */
  const srPct = new Map();
  const bySr = [...pool].sort((a, b) => a.sr - b.sr || a.id.localeCompare(b.id));
  bySr.forEach((p, i) => srPct.set(p.id, i / span));
  /** @type {Map<string, number>} */
  const prodPct = new Map();
  [...pool]
    .sort((a, b) => b.prod.index - a.prod.index || a.id.localeCompare(b.id))
    .forEach((p, i) => prodPct.set(p.id, i / span));
  // The pool's own search ranks, ascending. The output is a permutation of exactly this
  // list, which is the property the whole design rests on.
  const ranks = bySr.map((p) => p.sr);
  const blended = [...pool].sort((a, b) => {
    const ba =
      (1 - weight) * (srPct.get(a.id) ?? 0) + weight * (prodPct.get(a.id) ?? 0);
    const bb =
      (1 - weight) * (srPct.get(b.id) ?? 0) + weight * (prodPct.get(b.id) ?? 0);
    return ba - bb || a.sr - b.sr || a.id.localeCompare(b.id);
  });
  blended.forEach((p, i) => {
    out.set(p.id, {
      rank: ranks[i],
      searchRank: p.sr,
      index: p.prod.index,
      weeks: p.prod.weeks,
      seasons: p.prod.seasons,
    });
  });
  return out;
}
