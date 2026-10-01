/**
 * THE ROOKIE PRIOR (D118) - NBA draft capital, for a player with college minutes and no
 * NBA ones.
 *
 * A just-drafted rookie is the one asset the rest of this model is blindest on: the
 * in-league production table has never seen him (D19), and the market's two ordinals
 * disagree about him more than about anyone. The question the owner asked was how to
 * price a player with a college record and no NBA game time. Measured, over the 2020-
 * 2026 NBA draft classes (413 draftees, every one mapped to a Sleeper id; outcome = three
 * seasons of this league's fantasy points, era-normalized, ranked within class; validated
 * leave-one-class-out):
 *
 *   - COLLEGE PRODUCTION ADDS NOTHING once anything else is known. College fantasy points
 *     per 40 minutes correlate with the outcome (rho +0.225, n = 185), but among the 162
 *     players with both a market price and a college line, out-of-sample R^2 is 0.187 for
 *     the market alone and 0.191 with college added; 0.360 for draft slot + age and
 *     0.353 with college added. Its partial swings by class (-0.11 to +0.53). It is
 *     deliberately NOT in the price - the honest answer to "use his college stats" is
 *     that the NBA's own draft already read them, and better.
 *   - NBA DRAFT POSITION IS THE STRONGEST SINGLE SIGNAL: rho -0.667 (n = 236), and it
 *     beats Sleeper's dynasty ADP out of sample (LOCO R^2 0.40 vs 0.28, n = 192), with a
 *     strong partial given ADP (-0.39). Thirty NBA front offices with workouts, medicals
 *     and interviews are a better-informed market than a fantasy ADP.
 *   - THE FIT: expected within-class outcome percentile P(pick) = 0.936 * e^(-pick/43.8)
 *     (A [0.88, 0.99], tau [38.6, 50.3]; LOCO R^2 0.456, residual SD 0.21), with a
 *     measured -0.16 for a non-college pick after #14 (international / Ignite /
 *     draft-and-stash players produce less early: CI [-0.23, -0.10], n = 54 vs 215).
 *     Blended 50/50 with the market's own within-class percentile, which stayed within
 *     0.02 of the optimal R^2 in every cut and always beat the market alone.
 *
 * HOW IT ENTERS THE PRICE: as a REORDERING within the class, not a new level. The class's
 * players keep the exact set of market ordinals they already hold; the blend only decides
 * which of them sits where (the same permutation property `effectiveRanks` uses for
 * production, for the same reason - the evidence is about ordering, and a permutation
 * cannot move any threshold or tier break calibrated on the value scale).
 *
 * WHEN IT STOPS: it applies to players with `yearsExp === 0` only. Sleeper increments
 * that at the next season, by which point the in-league production index and the live
 * market have NBA games to read - observed production displaces a pre-debut prior within
 * a few dozen games (D116's graduation study: K ~ 3-8 games against a stale prior).
 *
 * Pasted from the post-doc study (scripts/calibration/rookie/). Do not hand-edit: this is
 * a record of the 2026 NBA draft, mapped to Sleeper ids, not a tuning decision.
 */
export const ROOKIE_PRIOR = { A: 0.936, tau: 43.8, nonCollegeLatePenalty: 0.16, lateFrom: 15, marketWeight: 0.5 };
/**
 * [sleeper player id, overall NBA draft pick, came from college] for the 2026 NBA draft.
 * @type {[string, number, boolean][]}
 */
export const NBA_DRAFT_2026 = [
  ["4866", 1, true], // AJ Dybantsa,
  ["4882", 2, true], // Darryn Peterson,
  ["4873", 3, true], // Cameron Boozer,
  ["4862", 4, true], // Caleb Wilson,
  ["4881", 5, true], // Keaton Wagler,
  ["4871", 6, true], // Mikel Brown Jr.,
  ["4891", 7, true], // Darius Acuff Jr.,
  ["4876", 8, true], // Kingston Flemings,
  ["4885", 9, true], // Morez Johnson Jr.,
  ["4883", 10, true], // Brayden Burries,
  ["4864", 11, true], // Yaxel Lendeborg,
  ["4888", 12, true], // Aday Mara,
  ["4884", 13, true], // Nate Ament,
  ["4869", 14, true], // Hannes Steinbach,
  ["4863", 15, true], // Dailyn Swain,
  ["4889", 16, true], // Bennett Stirtz,
  ["4867", 17, true], // Ebuka Okorie,
  ["4868", 18, true], // Christian Anderson Jr.,
  ["4880", 19, true], // Allen Graves,
  ["4879", 20, true], // Jayden Quaintance,
  ["4872", 21, false], // Karim López,
  ["4865", 22, true], // Labaron Philon Jr.,
  ["4875", 23, true], // Zuby Ejiofor,
  ["4874", 24, true], // Cameron Carr,
  ["4886", 25, false], // Sergio de Larrea,
  ["4878", 26, true], // Tarris Reed Jr.,
  ["4877", 27, true], // Chris Cenac Jr.,
  ["4870", 28, true], // Joshua Jefferson,
  ["4890", 29, true], // Alex Karaban,
  ["4887", 30, true], // Koa Peat,
  ["4904", 31, true], // Bruce Thornton,
  ["4902", 32, true], // Richie Saunders,
  ["4900", 33, true], // Isaiah Evans,
  ["4895", 34, true], // Meleek Thomas,
  ["4922", 35, true], // Trevon Brazile,
  ["4913", 36, true], // Baba Miller,
  ["4915", 37, true], // Ryan Conwell,
  ["4896", 38, true], // Braden Smith,
  ["4892", 39, false], // Jack Kayil,
  ["4907", 40, true], // Dillon Mitchell,
  ["4919", 41, true], // Otega Oweh,
  ["4908", 42, true], // Ja'Kobi Gillespie,
  ["4899", 43, true], // Tyler Bilodeau,
  ["4909", 44, true], // Maliq Brown,
  ["4921", 45, true], // Emanuel Sharp,
  ["4898", 46, true], // Felix Okpara,
  ["4893", 47, true], // Tyler Nickel,
  ["4917", 48, true], // Tobi Lawal,
  ["4923", 49, true], // Bryce Hopkins,
  ["4910", 50, true], // Jaden Bradley,
  ["4924", 51, true], // Izaiyah Nelson,
  ["4905", 52, true], // Henri Veesaar,
  ["4894", 53, true], // Ugonna Onyenso,
  ["4897", 54, true], // Lajae Jones,
  ["4911", 55, true], // Nick Martinelli,
  ["4918", 56, false], // Vsevolod Ishchenko,
  ["4912", 57, false], // Narcisse Ngoy,
  ["4906", 58, true], // Jaron Pierre Jr.,
  ["4901", 59, true], // Trey Kaufman-Renn,
  ["4916", 60, false], // Malique Lewis
];
const PICK_BY_PLAYER = new Map(NBA_DRAFT_2026.map(([id, pick, college]) => [id, { pick, college }]));
/** @param {string} id */
export function nbaDraftOf(id) {
  return PICK_BY_PLAYER.get(id) ?? null;
}
/**
 * Expected within-class outcome percentile from NBA draft position alone.
 * @param {number} pick
 * @param {boolean} college
 */
export function draftCapitalPercentile(pick, college, cfg = ROOKIE_PRIOR) {
  let p = cfg.A * Math.exp(-pick / cfg.tau);
  if (!college && pick >= cfg.lateFrom) p -= cfg.nonCollegeLatePenalty;
  return Math.min(1, Math.max(0, p));
}
/**
 * Reorder a rookie class within its own market ordinals by the 50/50 blend of market
 * percentile and draft-capital percentile. Mutates nothing; returns playerId -> new rank.
 * Players in the class with no NBA draft record keep their market percentile alone.
 * @param {{ playerId: string, rank: number }[]} cls the class's players with their market ordinals
 * @returns {Map<string, number>}
 */
export function reorderRookieClass(cls, cfg = ROOKIE_PRIOR) {
  const out = new Map();
  if (cls.length < 2) return out;
  const byRank = [...cls].sort((a, b) => a.rank - b.rank || a.playerId.localeCompare(b.playerId));
  const n = byRank.length;
  // Market percentile within the class, 1 = best (the P scale's direction).
  const score = new Map(
    byRank.map((p, i) => {
      const market = 1 - i / (n - 1);
      const d = nbaDraftOf(p.playerId);
      const draft = d ? draftCapitalPercentile(d.pick, d.college, cfg) : null;
      return [p.playerId, draft == null ? market : cfg.marketWeight * market + (1 - cfg.marketWeight) * draft];
    }),
  );
  const ranks = byRank.map((p) => p.rank);
  [...byRank]
    .sort((a, b) => score.get(b.playerId) - score.get(a.playerId) || a.rank - b.rank)
    .forEach((p, i) => out.set(p.playerId, ranks[i]));
  return out;
}
