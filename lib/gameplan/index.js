import { leagueValueRanking } from "../roster.js";
import { getStrategyReport } from "../strategy/index.js";
import { cachedLeagueTimelines } from "../metrics/duration.js";
import { stanceOf } from "../metrics/axes.js";
import { replacementLevel } from "../metrics/fragility.js";
import { leagueTierLabel } from "../rankings/leagueTiers.js";
import { cachedValuePlayers, valueAtRank } from "../valuation/index.js";
import { packageSearch } from "./packages.js";
/**
 * THE PLAN'S STAR LINE. A value line the direction rule reads (stanceOf's `stars`), shared
 * with the trade finder's appetite model so the two read a roster the same way.
 *
 * IT IS NOT A TIER, AND THE PLAN NO LONGER CALLS IT ONE. It used to be printed as
 * "cornerstone-or-better", but on the live ladder 1,569 sits inside /values' "Depth"
 * tier while "Cornerstone" starts near 4,900, so /plan and /values used one word for two
 * different sets. The plan now names this line by its number, and every tier word it
 * prints comes from `leagueTierLabel` - the one definition /values and /roster use.
 *
 * D116: stated as a RANK, not a literal (`valueAtRank(39)` on the base curve).
 */
const STAR_RANK = 39;
const STAR_THRESHOLD = valueAtRank(STAR_RANK);
/**
 * WHAT COUNTS AS DEAD WEIGHT ON A ROSTER SPOT. Deliberately NOT the Fringe tier: the
 * tier system's last break sits an order of magnitude higher (around 900 in the current
 * distribution, because the cliff search is floored at a tenth of the top asset), and
 * calling 900-value players roster clogs would be advice to cut most of a bench. This
 * is a separate, much harsher claim - "this body is worth less than the roster spot" -
 * and the copy that renders it must not borrow the word "Fringe", which means something
 * else everywhere else in the app.
 *
 * THE LEAGUE'S ROSTER-SPOT REPLACEMENT LEVEL, not a rank on the base curve. The old line
 * (`valueAtRank(177)`) selected about the 157th priced player in a league with 224 active
 * spots, so the plan told owners to cut 30-minute rotation players. The line is now the
 * value of the (teams x active spots)th-best priced player in the league pool - the same
 * `replacementLevel` recipe `leagueReplacementValue` uses, counted over roster spots
 * rather than lineup slots (that one is the STARTER line, ~98th here, and would cut more).
 */
const NON_ACTIVE_SLOTS = new Set(["IR", "TAXI"]);
let deadLineByCorpus = new WeakMap();
/**
 * @param {any} h
 * @returns {{ value: number, bodies: number, teams: number, spots: number }}
 */
export function deadLineOf(h) {
  const hit = deadLineByCorpus.get(h.players);
  if (hit) return hit;
  const teams = h.currentLeague?.totalRosters || h.rosters.length || 1;
  const listed = (h.currentLeague?.rosterPositions ?? []).filter(
    (s) => !NON_ACTIVE_SLOTS.has(s),
  ).length;
  // No roster_positions in the corpus: the largest active roster actually held.
  const spots =
    listed ||
    Math.max(
      1,
      ...h.rosters.map(
        (r) =>
          (r.players ?? []).length -
          (r.taxi ?? []).length -
          (r.reserve ?? []).length,
      ),
    );
  const bodies = teams * spots;
  const values = [...cachedValuePlayers(h).values()].map((v) => v.value);
  const line = { value: replacementLevel(values, bodies), bodies, teams, spots };
  deadLineByCorpus.set(h.players, line);
  return line;
}
/** D116: the 400 and 700 literals below, as ranks (154 and 128 on the same curve). */
const VET_FLOOR = valueAtRank(154);
const MID_TIER_FLOOR = valueAtRank(128);
/**
 * WHO IS NOT YET A FINISHED PRICE (D116). A player in his first or second NBA season
 * (yearsExp <= 1), or one 21 or younger, is priced mostly on projection, and his low
 * number is the start of a curve rather than a verdict. The plan used to treat that
 * number like any other: on a 5-15 rebuilding roster it told the owner to package the
 * #4 overall rookie pick (age 19) for a star and to cut the #7 overall pick two weeks
 * after drafting him. Both were the same mistake - reading a developmental asset's
 * current value as its worth.
 *
 * So a developmental player is never a cut, whatever the direction, and is never on
 * the "you send" side of a consolidation or sell move for an ascending or rebuilding
 * roster, whose whole premise is that the future is the asset. A contender keeps the
 * option: selling youth for wins now is the coherent version of that direction.
 *
 * yearsExp comes from the player record rather than the valued row (analyzeRoster does
 * not copy it), and a missing value falls through to the age test rather than counting
 * as a rookie.
 */
const DEVELOPMENTAL_MAX_YEARS_EXP = 1;
const DEVELOPMENTAL_MAX_AGE = 21;
export function isDevelopmental(v, h) {
  const yearsExp = h?.players?.get(v.playerId)?.yearsExp;
  if (yearsExp != null && yearsExp <= DEVELOPMENTAL_MAX_YEARS_EXP) return true;
  return v.age != null && v.age <= DEVELOPMENTAL_MAX_AGE;
}
/**
 * The bodies a roster could drop (D116): sub-threshold, never developmental. The
 * value-DESC order of `a.valued` is reversed so the cut list leads with the WORST
 * body, not the best of the bad ones - the old `slice(0, 3)` named the three
 * highest-valued sub-250 players, which is the opposite of who you cut first.
 */
export function deadWeightOf(valued, h, line = deadLineOf(h).value) {
  return valued
    .filter((v) => v.value < line && !isDevelopmental(v, h))
    .sort((x, y) => x.value - y.value);
}
/**
 * Who goes out in a depth-for-a-star consolidation (D116). A contender sends its best
 * mid-tier pieces, youth included, because the star has to be paid for and the window
 * is now. An ascending roster sends its most EXPENDABLE ones instead: developmental
 * players are removed, and the rest are ordered oldest first (their value only falls
 * from here), then cheapest first, so the package is the depth it can best spare.
 * Unknown ages sort after known ones rather than being guessed at.
 */
export function consolidationSends(midTier, direction, h) {
  if (direction !== "ascend") return midTier;
  return midTier
    .filter((v) => !isDevelopmental(v, h))
    .sort(
      (x, y) =>
        (y.age ?? -Infinity) - (x.age ?? -Infinity) || x.value - y.value,
    );
}
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
  // `buildGamePlan` passes the ranking it already computed so one plan is one walk.
  opts = {},
) {
  const ranking = opts.ranking ?? leagueValueRanking(h);
  const tierFor = opts.tierFor ?? leagueTierLabel(h);
  const deadLine = deadLineOf(h);
  // The ranked entry, not a standalone analyzeRoster call, so `coreAgeBand` is banded
  // against the league's own core-age distribution rather than the absolute fallback -
  // otherwise the game plan could contradict what /league and /roster already say.
  const a = ranking.find((r) => r.rosterId === rosterId);
  const valueRank = ranking.findIndex((r) => r.rosterId === rosterId) + 1;
  const { weak, strong } = positionGaps(a);
  const stars = a.valued.filter((v) => v.value >= STAR_THRESHOLD).length;
  // Same definition the streamline move uses (D116), so the count printed here and
  // the "Cut the N" title on the plan can never disagree.
  const dead = deadWeightOf(a.valued, h).length;
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
    starsLabel: `player${stars === 1 ? "" : "s"} valued ${STAR_THRESHOLD.toLocaleString()} or more`,
  });
  // Tier words come from the ladder /values and /roster print, never from this module.
  const starTier = tierFor(STAR_THRESHOLD);
  const best = a.valued[0] ?? null;
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
    `${stars === 0 ? "No" : stars} player${stars === 1 ? "" : "s"} valued ${STAR_THRESHOLD.toLocaleString()} or more (that line sits in the ${starTier} tier on /values)${best ? `; your best is ${best.name}, ${best.value.toLocaleString()}, ${tierFor(best.value)}` : ""}.`,
  );
  because.push(
    `${dead} ${dead === 1 ? "body" : "bodies"} below the replacement line (${deadLine.value.toLocaleString()}, the ${deadLine.bodies}th-best priced player: ${deadLine.teams} rosters x ${deadLine.spots} active spots).`,
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
    starLine: { value: STAR_THRESHOLD, tier: starTier },
    bestTier: best ? tierFor(best.value) : null,
    deadWeight: dead,
    deadLine,
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
 * Every trade move now carries the finder's own answer: the best package its search
 * returns under the move's constraints (./packages.js), with the counterparty named
 * because the search found a deal with them, not because a tag scored well. A move with
 * no such package is dropped. `moveAssetId` is the asset the search was forced to include.
 */
/** Names joined for a sentence: "A", "A and B", "A, B and C". */
function joinNames(list) {
  const names = list.map((x) => x.name);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
const youthOk = (asset) =>
  asset.kind === "pick" ||
  (asset.kind === "player" && asset.age != null && asset.age <= 24);
const topOf = (list) => Math.max(0, ...list.map((p) => p.asset.value));
/** Oldest incoming player a positional fix may bring, by direction (contend: any). */
const FILL_MAX_AGE = { ascend: 29, retool: 27, rebuild: 25 };
/** One incoming player, worth more than anything sent, for two or more pieces. */
const consolidates = (pkg) =>
  pkg.get.length === 1 &&
  pkg.give.length >= 2 &&
  topOf(pkg.get) > topOf(pkg.give);
export function buildGamePlan(h, rosterId, principals) {
  const ranking = leagueValueRanking(h);
  const tierFor = leagueTierLabel(h);
  const a = ranking.find((r) => r.rosterId === rosterId);
  const dx = diagnose(h, rosterId, principals, { ranking, tierFor });
  const report = getStrategyReport(h, principals);
  const moves = [];
  const caveats = [];
  const vets = a.valued.filter((v) => (v.age ?? 0) >= 29 && v.value >= VET_FLOOR);
  // Ascending by value, developmental players removed (D116).
  const deadWeight = deadWeightOf(a.valued, h);
  // Bodies under the replacement line are cut candidates, never trade filler, so the
  // "Cut the N" move and a package can never name the same player.
  const deadIds = new Set(deadWeight.map((v) => String(v.playerId)));
  const midTier = a.valued.filter(
    (v) => v.value >= MID_TIER_FLOOR && v.value < STAR_THRESHOLD,
  );
  const topPicks = a.picks.picks.filter((p) => p.round === 1).slice(0, 3);
  const pickId = (p) => `${p.season}-${p.round}-${p.originalRoster}`;
  const dev = (asset) =>
    asset.kind === "player" &&
    isDevelopmental({ playerId: asset.id, age: asset.age }, h);
  // Youth stays home unless the roster is contending (D116).
  const sendable = (asset) =>
    !deadIds.has(String(asset.id)) && (dx.direction === "contend" || !dev(asset));
  const search = packageSearch(h, principals, rosterId, ranking, tierFor);
  // Every asset a move has already spent, on either side. No asset is in two moves.
  const used = new Set();
  let dropped = 0;
  /**
   * Propose one trade move: the best finder package for `spec`, or nothing at all.
   * @param {import("./packages.js").PackageSpec} spec
   * @param {(pkg: import("./packages.js").PlanPackage) => Object} build
   */
  const propose = (spec, build) => {
    const pkg = search(spec, used);
    if (!pkg) {
      dropped++;
      return;
    }
    for (const x of [...pkg.give, ...pkg.get]) used.add(x.id);
    const m = build(pkg);
    // A name ending in "Jr." before a sentence break must not print "Jr..".
    m.detail = m.detail.replace(/\.\./g, ".");
    moves.push({
      moveAssetId: spec.force ?? null,
      ...m,
      give: pkg.give.map((x) => x.name),
      get: pkg.get.map((x) => x.name),
      package: pkg,
    });
  };
  const withCp = (pkg) => pkg.counterparty.name;
  // ---- CONTEND path ----
  if (dx.direction === "contend") {
    // 1) Consolidate depth (and the best 1st) into one better player.
    if (midTier.length >= 2) {
      const midIds = new Set(midTier.map((v) => String(v.playerId)));
      const firstPick = topPicks[0] ? pickId(topPicks[0]) : null;
      propose(
        {
          give: (x) =>
            sendable(x) &&
            ((x.kind === "player" && midIds.has(String(x.id))) ||
              (x.kind === "pick" && x.id === firstPick)),
          get: (x) => x.kind === "player" && x.value >= STAR_THRESHOLD,
          accept: consolidates,
        },
        (pkg) => ({
          id: "consolidate",
          kind: "consolidate",
          title: "Consolidate depth into a difference-maker",
          detail: `${joinNames(pkg.give)} to ${withCp(pkg)} for ${pkg.get[0].name} (${pkg.get[0].tier}). You can't start your whole bench - this concentrates the value in one lineup spot.`,
          cost: "You get thinner. If your starter gets hurt, the drop-off is real.",
        }),
      );
    }
    // 2) Convert future picks into production now.
    if (a.picks.extraFirsts > 0 || topPicks.length >= 2) {
      propose(
        {
          give: (x) => x.kind === "pick" && sendable(x),
          get: (x) =>
            x.kind === "player" && x.value >= MID_TIER_FLOOR && !dev(x),
        },
        (pkg) => ({
          id: "cash-picks",
          kind: "cash-picks",
          title: "Spend picks on production now",
          detail: `${joinNames(pkg.give)} to ${withCp(pkg)} for ${joinNames(pkg.get)}. You hold ${a.picks.picks.length} picks worth ~${a.picks.total.toLocaleString()}; rookies rarely help a contender immediately.`,
          cost: "If this season doesn't break your way, you've paid for a window that didn't open.",
        }),
      );
    }
  }
  // ---- ASCEND path ----
  // Young and already good. The mistake here is impatience: cashing picks to chase a
  // title a year early, or selling youth that hasn't peaked. Add a star, hold the rest.
  if (dx.direction === "ascend") {
    // Expendable depth only (D116): developmental players removed, picks kept.
    const sends = consolidationSends(midTier, dx.direction, h);
    if (sends.length >= 2) {
      const sendIds = new Set(sends.map((v) => String(v.playerId)));
      propose(
        {
          give: (x) =>
            x.kind === "player" && sendIds.has(String(x.id)) && sendable(x),
          get: (x) => x.kind === "player" && x.value >= STAR_THRESHOLD,
          accept: consolidates,
        },
        (pkg) => ({
          id: "add-a-star",
          kind: "consolidate",
          title: "Turn surplus depth into one better player",
          detail: `${joinNames(pkg.give)} to ${withCp(pkg)} for ${pkg.get[0].name} (${pkg.get[0].tier}), keeping your picks. Depth wins you weeks; top-end players win titles.`,
          cost: "Less depth to absorb injuries, and you may be paying a small premium for the consolidation.",
        }),
      );
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
        package: null,
        cost: "Patience is genuinely costly if a title window opens sooner than expected.",
      });
    }
  }
  // ---- REBUILD path ----
  if (dx.direction === "rebuild") {
    // A rebuild never sells a developmental player (D116). An age-29 vet can still
    // be one on the yearsExp test - a late-arriving overseas signing - and selling
    // him as "declining" would be wrong on its own terms.
    const sellable = vets.filter((v) => !isDevelopmental(v, h));
    if (sellable.length) {
      const vetIds = new Set(sellable.map((v) => String(v.playerId)));
      const lead = sellable[0];
      propose(
        {
          force: String(lead.playerId),
          give: (x) => x.kind === "player" && vetIds.has(String(x.id)) && sendable(x),
          get: youthOk,
        },
        (pkg) => ({
          id: "sell-vets",
          kind: "sell-vets",
          title: "Sell a veteran while he still has value",
          detail: `${joinNames(pkg.give)} to ${withCp(pkg)} for ${joinNames(pkg.get)}. ${lead.name} (${lead.age}) won't be worth this in two years - declining assets only get cheaper.`,
          cost: "You get worse this season, and it'll feel bad in-week.",
        }),
      );
    }
    propose(
      {
        give: (x) =>
          x.kind === "player" && (x.age ?? 0) >= 26 && sendable(x),
        get: (x) => x.kind === "player" && x.age != null && x.age <= 23,
      },
      (pkg) => ({
        id: "buy-youth",
        kind: "buy-youth",
        title: "Buy young talent from a team pressing to win",
        detail: `${joinNames(pkg.give)} to ${withCp(pkg)} for ${joinNames(pkg.get)}. A roster pressing to win discounts young players who aren't helping it this season.`,
        cost: "Youth is probabilistic - some of these won't hit.",
      }),
    );
  }
  // ---- RETOOL path ----
  if (dx.direction === "retool") {
    caveats.push(
      "You're mid-pack, which is the worst place to be in dynasty - too good to get top picks, not good enough to win. The honest advice is to commit to a direction rather than drift.",
    );
    const sellableVets = vets.filter((v) => !isDevelopmental(v, h));
    if (sellableVets.length) {
      const vetIds = new Set(sellableVets.map((v) => String(v.playerId)));
      const lead = sellableVets[0];
      propose(
        {
          force: String(lead.playerId),
          give: (x) => x.kind === "player" && vetIds.has(String(x.id)) && sendable(x),
          get: youthOk,
        },
        (pkg) => ({
          id: "pick-a-lane",
          kind: "sell-vets",
          title: "Break the tie: sell a veteran for younger value",
          detail: `${joinNames(pkg.give)} to ${withCp(pkg)} for ${joinNames(pkg.get)} turns ${lead.name} (${lead.age}) into younger value and commits you to a direction.`,
          cost: "You may fall out of the playoff race entirely this season.",
        }),
      );
    }
  }
  // ---- Universal: positional holes and roster hygiene ----
  if (dx.weakPositions.length && a.valued.length) {
    const hole = dx.weakPositions[0];
    // The incoming player has to suit the direction: a rebuild does not fill a hole
    // with a veteran, and only a contender takes on a finished-product 30-plus.
    const fitsDirection = (x) =>
      dx.direction === "contend"
        ? !dev(x)
        : x.age != null && x.age <= FILL_MAX_AGE[dx.direction];
    propose(
      {
        give: (x) => x.kind === "player" && x.position !== hole && sendable(x),
        get: (x) =>
          x.kind === "player" &&
          x.position === hole &&
          x.value >= MID_TIER_FLOOR &&
          fitsDirection(x),
      },
      (pkg) => ({
        id: "fill-hole",
        kind: "fill-hole",
        title: `Fix ${hole} - it's your thinnest spot`,
        detail: `${joinNames(pkg.give)} to ${withCp(pkg)} for ${joinNames(pkg.get)}. Your ${hole} value is well below your roster average; a lineup only starts one player per slot.`,
        cost: "Thinning a strength can backfire if injuries hit there.",
      }),
    );
  }
  if (deadWeight.length >= 3) {
    const line = dx.deadLine;
    moves.push({
      id: "streamline",
      kind: "streamline",
      title: `Cut the ${deadWeight.length} dead-weight bodies loose`,
      detail: `${deadWeight.length} players are worth under ${line.value.toLocaleString()}, the value of the ${line.bodies}th-best priced player in the league (${line.teams} rosters x ${line.spots} active spots), so the pool holds spares at their level. Stream that space for upside or open a taxi/bench slot instead.`,
      moveAssetId: null,
      // The three worst bodies, not the three best of the bad ones (D116).
      give: deadWeight.slice(0, 3).map((f) => f.name),
      cutIds: deadWeight.slice(0, 3).map((f) => String(f.playerId)),
      get: ["waiver upside / roster flexibility"],
      package: null,
      cost: "Low risk - but don't drop someone whose role is about to change.",
    });
  }
  // D19: a trade idea with no package behind it is dropped, and the drop is stated.
  if (dropped > 0) {
    caveats.push(
      `${dropped} trade idea${dropped === 1 ? "" : "s"} for this direction had no package that clears the trade finder's value band with any leaguemate (without reusing an asset from another move), so ${dropped === 1 ? "it is" : "they are"} not shown.`,
    );
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
  if (!moves.length && dropped === 0) {
    caveats.push(
      "No clear structural move stands out - your roster is balanced against your window. Sitting tight is a legitimate answer.",
    );
  }
  return { diagnosis: dx, moves, caveats };
}
export { STAR_THRESHOLD };
