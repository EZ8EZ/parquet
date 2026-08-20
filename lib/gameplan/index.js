import { analyzeRoster, leagueValueRanking } from "../roster.js";
import { getStrategyReport } from "../strategy/index.js";
import { cachedLeagueTimelines } from "../metrics/duration.js";
import { stanceOf } from "../metrics/axes.js";
/**
 * WHAT COUNTS AS A STAR. Cornerstone-or-better, and the number is checked against the
 * league's own tier breaks rather than asserted.
 *
 * Re-measured after the age-curve recalibration: the data-driven Cornerstone break
 * moved from 6,576 to 4,685, but no player in the league prices between 4,500 and
 * 4,685, so this literal still selects exactly the cornerstone-or-better set (23 of
 * 1,745 priced assets, down from 24 of 1,749). It survives the recalibration by luck of
 * where the gap fell, not by design, so it is worth re-running that check whenever the
 * distribution moves again.
 */
const STAR_THRESHOLD = 4500;
/**
 * WHAT COUNTS AS DEAD WEIGHT ON A ROSTER SPOT. Deliberately NOT the Fringe tier: the
 * tier system's last break sits an order of magnitude higher (around 900 in the current
 * distribution, because the cliff search is floored at a tenth of the top asset), and
 * calling 900-value players roster clogs would be advice to cut most of a bench. This
 * is a separate, much harsher claim - "this body is worth less than the roster spot" -
 * and the copy that renders it must not borrow the word "Fringe", which means something
 * else everywhere else in the app.
 */
const DEAD_THRESHOLD = 250;
function positionGaps(a) {
  const all = ["PG", "SG", "SF", "PF", "C"];
  const byPos = new Map(a.byPosition.map((p) => [p.pos, p.value]));
  const values = all.map((p) => byPos.get(p) ?? 0);
  const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  const weak = all.filter((p) => (byPos.get(p) ?? 0) < mean * 0.5);
  const strong = all.filter((p) => (byPos.get(p) ?? 0) > mean * 1.5);
  return { weak, strong };
}
export function diagnose(
  h,
  rosterId,
  // Not read here — diagnose has no buildDossier call of its own — but every caller
  // in this module now carries one index end to end so a future addition here (or
  // in buildGamePlan, which does call buildDossier) never has to thread a second one.
  _principals,
) {
  const ranking = leagueValueRanking(h);
  // The ranked entry, not a standalone analyzeRoster call, so `coreAgeBand` is banded
  // against the league's own core-age distribution rather than the absolute fallback -
  // otherwise the game plan could contradict what /league and /roster already say.
  const a = ranking.find((r) => r.rosterId === rosterId);
  const valueRank = ranking.findIndex((r) => r.rosterId === rosterId) + 1;
  const { weak, strong } = positionGaps(a);
  const stars = a.valued.filter((v) => v.value >= STAR_THRESHOLD).length;
  const dead = a.valued.filter((v) => v.value < DEAD_THRESHOLD).length;
  const because = [];
  /*
   * THE DIRECTION IS A PRESCRIPTION READ OFF THE TIMELINE, NOT A SECOND TIMELINE.
   *
   * It used to be derived from the CORE-AGE band while wearing the timing axis's verbs,
   * so /plan's own timeline check ("your value is dated like a X roster") fired on 8 of
   * 14 rosters on the live league for no better reason than that the two labels came
   * off different instruments. It now reads `posture`, and the standing override is the
   * only thing that can put the plan and the reading on different feet - which is a
   * fact worth printing rather than an artifact. `stanceOf` is shared with
   * lib/tradefinder so there is one implementation, not two kept in step by a test.
   */
  const timeline = cachedLeagueTimelines(h).find(
    (t) => t.rosterId === rosterId,
  );
  const posture = timeline?.posture ?? null;
  const {
    stance: direction,
    basis: directionBasis,
    note: directionNote,
  } = stanceOf({
    posture,
    coreAge: a.coreAge,
    stars,
    valueRank,
    teams: ranking.length,
  });
  because.push(
    `You rank ${valueRank} of ${ranking.length} in total asset value (${a.totalValue.toLocaleString()}, incl. ${a.picks.total.toLocaleString()} in picks).`,
  );
  if (a.coreAge != null)
    because.push(
      `Your core (top 8 by value) averages ${a.coreAge} years old - a ${a.coreAgeBand}, which is an age and not a plan.`,
    );
  if (timeline)
    because.push(
      `Your value is dated ${timeline.rosterDuration.toFixed(1)} seasons out with the assets ${timeline.posture === "straddling" ? "disagreeing about it" : "broadly agreed"} (TCI ${timeline.tci}), which reads ${timeline.posture} - the timing question, and a different one from the age above.`,
    );
  because.push(
    stars > 0
      ? `${stars} cornerstone-or-better asset${stars > 1 ? "s" : ""}, ${dead} ${dead === 1 ? "body" : "bodies"} worth less than the roster spot.`
      : `No cornerstone-tier player yet - that's the ceiling problem.`,
  );
  if (a.picks.extraFirsts !== 0)
    because.push(
      a.picks.extraFirsts > 0
        ? `You hold ${a.picks.extraFirsts} more first-rounder${a.picks.extraFirsts > 1 ? "s" : ""} than your own baseline - real ammunition.`
        : `You're ${Math.abs(a.picks.extraFirsts)} first-rounder${Math.abs(a.picks.extraFirsts) > 1 ? "s" : ""} below baseline - you've already mortgaged draft capital.`,
    );
  const headline =
    direction === "contend"
      ? "Your window is open. Consolidate and push."
      : direction === "ascend"
        ? "You're ahead of schedule. Don't spend it early."
        : direction === "rebuild"
          ? "You're not close. Accumulate youth and picks."
          : "You're in the awkward middle. Pick a direction.";
  return {
    direction,
    // What the direction was read off, so /plan can say whether the plan and the
    // timeline agree without re-deriving the mapping in the page.
    directionBasis,
    directionNote,
    posture,
    headline,
    because,
    strengthPositions: strong,
    weakPositions: weak,
    starCount: stars,
    deadWeight: dead,
    pickTotal: a.picks.total,
    extraFirsts: a.picks.extraFirsts,
    valueRank,
    teams: ranking.length,
  };
}
/*
 * `choosePartner` USED TO LIVE HERE. It is shelved - see SHELVED.md S11.
 *
 * It was a SECOND answer to "who should I call", scored from hand-tuned tag bonuses
 * (+8 for `overpaysForAge`, +4 for "Deadline buyer", -20 for a Ghost) with no
 * cross-check against whether either roster held an asset the other one wanted. It
 * could therefore name a partner the trade finder's actual search finds nothing with,
 * three taps away, on the same roster - the identical failure shape as `tierOf`
 * (SHELVED S6): two unpinned implementations of one question, drifting.
 *
 * Every move now links to /trade/finder, which answers the same question by SEARCHING
 * over real assets, and carries `moveAssetId` when the move names a specific player to
 * send so the finder can be told to only consider packages that include him.
 */
export function buildGamePlan(h, rosterId, principals) {
  const a = analyzeRoster(h, rosterId);
  const dx = diagnose(h, rosterId, principals);
  const report = getStrategyReport(h, principals);
  const moves = [];
  const caveats = [];
  const vets = a.valued.filter((v) => (v.age ?? 0) >= 29 && v.value >= 400);
  const deadWeight = a.valued.filter((v) => v.value < DEAD_THRESHOLD);
  const midTier = a.valued.filter(
    (v) => v.value >= 700 && v.value < STAR_THRESHOLD,
  );
  const topPicks = a.picks.picks.filter((p) => p.round === 1).slice(0, 3);
  // ---- CONTEND path ----
  if (dx.direction === "contend") {
    // 1) Consolidate depth + picks into a star.
    if (midTier.length >= 2) {
      const give = [
        midTier[0].name,
        midTier[1].name,
        ...topPicks.slice(0, 1).map((p) => p.label),
      ];
      moves.push({
        id: "consolidate",
        kind: "consolidate",
        title: "Consolidate depth into a difference-maker",
        detail: `You have starters but not enough stars (${dx.starCount} cornerstone-tier). Package ${midTier[0].name} + ${midTier[1].name}${topPicks.length ? ` and the ${topPicks[0].label}` : ""} for one clearly better player. You can't start your whole bench - concentrate the value.`,
        moveAssetId: null,
        give,
        get: ["one Cornerstone-or-better player"],
        cost: "You get thinner. If your starter gets hurt, the drop-off is real.",
      });
    }
    // 2) Convert future picks into now.
    if (a.picks.extraFirsts > 0 || topPicks.length >= 2) {
      const give = topPicks.slice(0, 2).map((p) => p.label);
      moves.push({
        id: "cash-picks",
        kind: "cash-picks",
        title: "Spend picks - they don't help you win this year",
        detail: `You're holding ${a.picks.picks.length} picks worth ~${a.picks.total.toLocaleString()}. A contending roster converts that into production now. Rookies rarely help a contender immediately.`,
        moveAssetId: null,
        give,
        get: ["a proven producer at a position of need"],
        cost: "If this season doesn't break your way, you've paid for a window that didn't open.",
      });
    }
  }
  // ---- ASCEND path ----
  // Young and already good. The mistake here is impatience: cashing picks to chase a
  // title a year early, or selling youth that hasn't peaked. Add a star, hold the rest.
  if (dx.direction === "ascend") {
    if (midTier.length >= 2) {
      const give = [midTier[0].name, midTier[1].name];
      moves.push({
        id: "add-a-star",
        kind: "consolidate",
        title: "Turn surplus depth into one real star",
        detail: `You have ${dx.starCount} cornerstone-tier asset${dx.starCount === 1 ? "" : "s"} and ${a.valued.length} bodies. Depth wins you weeks; stars win you titles. Package ${midTier[0].name} + ${midTier[1].name} for a difference-maker while keeping your picks.`,
        moveAssetId: null,
        give,
        get: ["one Cornerstone-or-better player"],
        cost: "Less depth to absorb injuries, and you may be paying a small premium for the consolidation.",
      });
    }
    if (a.picks.extraFirsts > 0) {
      moves.push({
        id: "hold-picks",
        kind: "streamline",
        title: `Hold the ${a.picks.firsts} first-rounders. Don't cash them yet.`,
        detail: `Your core averages ${a.coreAge} years old, so your best seasons are ahead of you, not this year. Those picks are worth more as ammunition in two years than as a marginal upgrade now. The classic error from this position is spending them a year early.`,
        moveAssetId: null,
        give: ["nothing"],
        get: ["optionality"],
        cost: "Patience is genuinely costly if a title window opens sooner than expected.",
      });
    }
  }
  // ---- REBUILD path ----
  if (dx.direction === "rebuild") {
    if (vets.length) {
      const give = vets.slice(0, 2).map((v) => v.name);
      moves.push({
        id: "sell-vets",
        kind: "sell-vets",
        title: "Sell the veterans while they still have value",
        detail: `${vets
          .slice(0, 2)
          .map((v) => `${v.name} (${v.age})`)
          .join(
            " and ",
          )} won't be worth this in two years. Convert them into picks and youth now - declining assets only get cheaper.`,
        // The one asset this move actually names, so the finder can be asked the
        // constrained question ("who would take HIM") rather than the general one.
        moveAssetId: vets[0].playerId,
        give,
        get: ["future firsts", "a young piece"],
        cost: "You get worse this season, and it'll feel bad in-week.",
      });
    }
    moves.push({
      id: "buy-youth",
      kind: "buy-youth",
      title: "Buy low on young talent from impatient teams",
      detail: `Target teams pressing to win now - they'll discount young players who aren't helping them this season. The finder reads every leaguemate's holes and behaviour and will name which of them actually has a young piece you can pry loose.`,
      moveAssetId: null,
      give: ["a productive veteran", "spare depth"],
      get: ["a young ascending player"],
      cost: "Youth is probabilistic - some of these won't hit.",
    });
  }
  // ---- RETOOL path ----
  if (dx.direction === "retool") {
    caveats.push(
      "You're mid-pack, which is the worst place to be in dynasty - too good to get top picks, not good enough to win. The honest advice is to commit to a direction rather than drift.",
    );
    if (vets.length) {
      const give = vets.slice(0, 1).map((v) => v.name);
      moves.push({
        id: "pick-a-lane",
        kind: "sell-vets",
        title: "Break the tie: sell your oldest real asset",
        detail: `Moving ${vets[0].name} (${vets[0].age}) turns an aging asset into future capital and commits you to a direction. Standing still is the only choice that guarantees nothing.`,
        moveAssetId: vets[0].playerId,
        give,
        get: ["future firsts"],
        cost: "You may fall out of the playoff race entirely this season.",
      });
    }
  }
  // ---- Universal: positional holes and roster hygiene ----
  if (dx.weakPositions.length && a.valued.length) {
    const surplus = dx.strengthPositions[0];
    const hole = dx.weakPositions[0];
    moves.push({
      id: "fill-hole",
      kind: "fill-hole",
      title: `Fix ${hole} - it's your thinnest spot`,
      detail: `Your ${hole} production is well below your roster average${surplus ? `, while ${surplus} is your surplus` : ""}. Trade from strength to cover the hole; a lineup only starts one player per slot.`,
      moveAssetId: null,
      give: surplus ? [`surplus ${surplus} depth`] : ["depth"],
      get: [`a starting-caliber ${hole}`],
      cost: "Thinning a strength can backfire if injuries hit there.",
    });
  }
  if (deadWeight.length >= 3) {
    moves.push({
      id: "streamline",
      kind: "streamline",
      title: `Cut the ${deadWeight.length} dead-weight bodies loose`,
      detail: `${deadWeight.length} players are worth under ${DEAD_THRESHOLD} and are occupying roster spots. Stream that space for upside or open a taxi/bench slot instead of holding dead weight.`,
      moveAssetId: null,
      give: deadWeight.slice(0, 3).map((f) => f.name),
      get: ["waiver upside / roster flexibility"],
      cost: "Low risk - but don't drop someone whose role is about to change.",
    });
  }
  // Honesty checks tied to the user's own record.
  if (report.contradictions.length) {
    caveats.push(
      `Your record already shows a stated-vs-revealed gap - ${report.contradictions[0].title.toLowerCase()} Before acting on this plan, decide whether the plan changed or you're just chasing.`,
    );
  }
  if (report.profile.trades < 2) {
    caveats.push(
      "Thin trade history, so the partner suggestions lean on limited behavioral evidence. Treat them as starting points, not reads.",
    );
  }
  if (!moves.length) {
    caveats.push(
      "No clear structural move stands out - your roster is balanced against your window. Sitting tight is a legitimate answer.",
    );
  }
  return { diagnosis: dx, moves, caveats };
}
export { STAR_THRESHOLD, DEAD_THRESHOLD };
