/**
 * The Game Plan — answers "how do I improve my team?" with concrete, actionable moves.
 *
 * Everything else in Parquet is diagnostic (here's what you did, here's who they are).
 * This is the prescriptive surface: it reads your window, finds your structural
 * problems, and proposes specific trades with specific managers — matched to their
 * dossier behavior.
 *
 * It stays honest: it names the cost of each move and refuses to invent a plan when
 * the roster doesn't support one (no filler advice).
 */
import type { LeagueHistory } from "./../history";
import { analyzeRoster, leagueValueRanking, type RosterAnalysis } from "../roster";
import { buildDossier, type Dossier } from "../dossier";
import type { PrincipalIndex } from "../principals";
import { getStrategyReport } from "../strategy";
import { tierOf } from "../valuation";

export type Direction = "contend" | "ascend" | "retool" | "rebuild";

export interface Diagnosis {
  direction: Direction;
  /** One-line framing of the situation. */
  headline: string;
  /** Why — grounded in numbers. */
  because: string[];
  strengthPositions: string[];
  weakPositions: string[];
  starCount: number;
  deadWeight: number;
  pickTotal: number;
  extraFirsts: number;
  valueRank: number;
  teams: number;
}

export interface Move {
  id: string;
  kind: "consolidate" | "cash-picks" | "sell-vets" | "buy-youth" | "fill-hole" | "streamline";
  title: string;
  /** What to actually do, in plain language. */
  detail: string;
  /** The specific counterparty, chosen from dossiers. */
  partnerRosterId: number | null;
  partnerName: string | null;
  /** Why this partner — from their behavioral profile. */
  partnerRationale: string | null;
  /** Assets to offer / target, by name. */
  give: string[];
  get: string[];
  /** The honest cost/risk. */
  cost: string;
}

export interface GamePlan {
  diagnosis: Diagnosis;
  moves: Move[];
  /** Notes when the plan is thin, rather than padding it with filler. */
  caveats: string[];
}

const STAR_THRESHOLD = 4500; // "Cornerstone" and up
const DEAD_THRESHOLD = 250; // "Fringe"

function positionGaps(a: RosterAnalysis) {
  const all = ["PG", "SG", "SF", "PF", "C"];
  const byPos = new Map(a.byPosition.map((p) => [p.pos, p.value]));
  const values = all.map((p) => byPos.get(p) ?? 0);
  const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  const weak = all.filter((p) => (byPos.get(p) ?? 0) < mean * 0.5);
  const strong = all.filter((p) => (byPos.get(p) ?? 0) > mean * 1.5);
  return { weak, strong };
}

export function diagnose(
  h: LeagueHistory,
  rosterId: number,
  // Not read here — diagnose has no buildDossier call of its own — but every caller
  // in this module now carries one index end to end so a future addition here (or
  // in buildGamePlan, which does call buildDossier) never has to thread a second one.
  _principals: PrincipalIndex,
): Diagnosis {
  const ranking = leagueValueRanking(h);
  // The ranked entry, not a standalone analyzeRoster call, so `window` is classified
  // against the league's own core-age distribution rather than the absolute fallback -
  // otherwise the game plan could contradict what /league and /roster already say.
  const a = ranking.find((r) => r.rosterId === rosterId)!;
  const valueRank = ranking.findIndex((r) => r.rosterId === rosterId) + 1;
  const { weak, strong } = positionGaps(a);
  const stars = a.valued.filter((v) => v.value >= STAR_THRESHOLD).length;
  const dead = a.valued.filter((v) => v.value < DEAD_THRESHOLD).length;
  const because: string[] = [];

  // Window: blend age, standing, and pick capital.
  const topHalf = valueRank > 0 && valueRank <= Math.ceil(ranking.length / 2);
  let direction: Direction;
  if (a.window === "win-now" || (topHalf && stars >= 2 && (a.coreAge ?? 26) >= 26.5)) {
    // Aging or star-heavy and already good: the window is genuinely now.
    direction = "contend";
  } else if (a.window === "rebuilding" && topHalf) {
    // Young AND asset-rich. This is the best place to be, but it is NOT the same as
    // contending: telling a 23-year-old core to cash picks and "push" would burn the
    // very assets that make it good. Hold, add a star, let it mature.
    direction = "ascend";
  } else if (a.window === "rebuilding") {
    direction = "rebuild";
  } else {
    direction = "retool";
  }

  because.push(
    `You rank ${valueRank} of ${ranking.length} in total asset value (${a.totalValue.toLocaleString()}, incl. ${a.picks.total.toLocaleString()} in picks).`,
  );
  if (a.coreAge != null)
    because.push(`Your core (top 8 by value) averages ${a.coreAge} years old.`);
  because.push(
    stars > 0
      ? `${stars} cornerstone-or-better asset${stars > 1 ? "s" : ""}, ${dead} fringe piece${dead === 1 ? "" : "s"}.`
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

/** Pick the best partner for an intent, using dossier behavior. */
function choosePartner(
  dossiers: Dossier[],
  intent: "sell-vets" | "buy-youth" | "cash-picks" | "buy-star",
): { d: Dossier; why: string } | null {
  const active = dossiers.filter((d) => d.profile.trades > 0);
  if (!active.length) return null;
  const score = (d: Dossier): number => {
    const p = d.profile;
    let s = p.trades * 0.5; // engagement baseline
    if (intent === "sell-vets") {
      if (p.overpaysForAge) s += 8;
      if (d.tags.includes("Deadline buyer")) s += 4;
      if (p.picks.net > 0) s += 2;
    }
    if (intent === "buy-youth" || intent === "cash-picks") {
      if (d.tags.includes("Deadline seller")) s += 5;
      if (p.picks.net < 0) s += 4; // spends picks -> will take players for picks
      if (d.tags.includes("Reactive after losses")) s += 3;
    }
    if (intent === "buy-star") {
      if (p.picks.net > 0) s += 5; // hoards picks -> wants your picks for their star
      if (d.tags.includes("High-volume trader")) s += 3;
    }
    if (d.tags.includes("Ghost") || d.tags.includes("Never trades")) s -= 20;
    return s;
  };
  const best = [...active].sort((a, b) => score(b) - score(a))[0];
  if (!best) return null;
  const why =
    best.approachTips[0] ??
    `${best.profile.displayName} is among the most active traders in the league.`;
  return { d: best, why };
}

export function buildGamePlan(
  h: LeagueHistory,
  rosterId: number,
  principals: PrincipalIndex,
): GamePlan {
  const a = analyzeRoster(h, rosterId);
  const dx = diagnose(h, rosterId, principals);
  const dossiers = h.rosters
    .filter((r) => r.rosterId !== rosterId)
    .map((r) => buildDossier(h, r.rosterId, principals));
  const report = getStrategyReport(h, principals);
  const moves: Move[] = [];
  const caveats: string[] = [];

  const vets = a.valued.filter((v) => (v.age ?? 0) >= 29 && v.value >= 400);
  const fringe = a.valued.filter((v) => v.value < DEAD_THRESHOLD);
  const midTier = a.valued.filter((v) => v.value >= 700 && v.value < STAR_THRESHOLD);
  const topPicks = a.picks.picks.filter((p) => p.round === 1).slice(0, 3);

  // ---- CONTEND path ----
  if (dx.direction === "contend") {
    // 1) Consolidate depth + picks into a star.
    if (midTier.length >= 2) {
      const partner = choosePartner(dossiers, "buy-star");
      const give = [midTier[0].name, midTier[1].name, ...topPicks.slice(0, 1).map((p) => p.label)];
      moves.push({
        id: "consolidate",
        kind: "consolidate",
        title: "Consolidate depth into a difference-maker",
        detail: `You have starters but not enough stars (${dx.starCount} cornerstone-tier). Package ${midTier[0].name} + ${midTier[1].name}${topPicks.length ? ` and the ${topPicks[0].label}` : ""} for one clearly better player. You can't start your whole bench - concentrate the value.`,
        partnerRosterId: partner?.d.profile.rosterId ?? null,
        partnerName: partner?.d.profile.teamName ?? partner?.d.profile.displayName ?? null,
        partnerRationale: partner?.why ?? null,
        give,
        get: ["one Cornerstone-or-better player"],
        cost: "You get thinner. If your starter gets hurt, the drop-off is real.",
      });
    }
    // 2) Convert future picks into now.
    if (a.picks.extraFirsts > 0 || topPicks.length >= 2) {
      const partner = choosePartner(dossiers, "buy-star");
      const give = topPicks.slice(0, 2).map((p) => p.label);
      moves.push({
        id: "cash-picks",
        kind: "cash-picks",
        title: "Spend picks - they don't help you win this year",
        detail: `You're holding ${a.picks.picks.length} picks worth ~${a.picks.total.toLocaleString()}. A contending roster converts that into production now. Rookies rarely help a contender immediately.`,
        partnerRosterId: partner?.d.profile.rosterId ?? null,
        partnerName: partner?.d.profile.teamName ?? partner?.d.profile.displayName ?? null,
        partnerRationale: partner?.why ?? null,
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
      const partner = choosePartner(dossiers, "buy-star");
      const give = [midTier[0].name, midTier[1].name];
      moves.push({
        id: "add-a-star",
        kind: "consolidate",
        title: "Turn surplus depth into one real star",
        detail: `You have ${dx.starCount} cornerstone-tier asset${dx.starCount === 1 ? "" : "s"} and ${a.valued.length} bodies. Depth wins you weeks; stars win you titles. Package ${midTier[0].name} + ${midTier[1].name} for a difference-maker while keeping your picks.`,
        partnerRosterId: partner?.d.profile.rosterId ?? null,
        partnerName: partner?.d.profile.teamName ?? partner?.d.profile.displayName ?? null,
        partnerRationale: partner?.why ?? null,
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
        partnerRosterId: null,
        partnerName: null,
        partnerRationale: null,
        give: ["nothing"],
        get: ["optionality"],
        cost: "Patience is genuinely costly if a title window opens sooner than expected.",
      });
    }
  }

  // ---- REBUILD path ----
  if (dx.direction === "rebuild") {
    if (vets.length) {
      const partner = choosePartner(dossiers, "sell-vets");
      const give = vets.slice(0, 2).map((v) => v.name);
      moves.push({
        id: "sell-vets",
        kind: "sell-vets",
        title: "Sell the veterans while they still have value",
        detail: `${vets.slice(0, 2).map((v) => `${v.name} (${v.age})`).join(" and ")} won't be worth this in two years. Convert them into picks and youth now - declining assets only get cheaper.`,
        partnerRosterId: partner?.d.profile.rosterId ?? null,
        partnerName: partner?.d.profile.teamName ?? partner?.d.profile.displayName ?? null,
        partnerRationale: partner?.why ?? null,
        give,
        get: ["future firsts", "a young piece"],
        cost: "You get worse this season, and it'll feel bad in-week.",
      });
    }
    const partner2 = choosePartner(dossiers, "cash-picks");
    moves.push({
      id: "buy-youth",
      kind: "buy-youth",
      title: "Buy low on young talent from impatient teams",
      detail: `Target teams pressing to win now - they'll discount young players who aren't helping them this season. ${partner2 ? `${partner2.d.profile.displayName} fits the profile.` : ""}`,
      partnerRosterId: partner2?.d.profile.rosterId ?? null,
      partnerName: partner2?.d.profile.teamName ?? partner2?.d.profile.displayName ?? null,
      partnerRationale: partner2?.why ?? null,
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
      const partner = choosePartner(dossiers, "sell-vets");
      const give = vets.slice(0, 1).map((v) => v.name);
      moves.push({
        id: "pick-a-lane",
        kind: "sell-vets",
        title: "Break the tie: sell your oldest real asset",
        detail: `Moving ${vets[0].name} (${vets[0].age}) turns an aging asset into future capital and commits you to a direction. Standing still is the only choice that guarantees nothing.`,
        partnerRosterId: partner?.d.profile.rosterId ?? null,
        partnerName: partner?.d.profile.teamName ?? partner?.d.profile.displayName ?? null,
        partnerRationale: partner?.why ?? null,
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
      partnerRosterId: null,
      partnerName: null,
      partnerRationale: null,
      give: surplus ? [`surplus ${surplus} depth`] : ["depth"],
      get: [`a starting-caliber ${hole}`],
      cost: "Thinning a strength can backfire if injuries hit there.",
    });
  }
  if (fringe.length >= 3) {
    moves.push({
      id: "streamline",
      kind: "streamline",
      title: `Cut the ${fringe.length} fringe pieces loose`,
      detail: `${fringe.length} players are Fringe-tier (under ${DEAD_THRESHOLD} value) and are occupying roster spots. Stream that space for upside or open a taxi/bench slot instead of holding dead weight.`,
      partnerRosterId: null,
      partnerName: null,
      partnerRationale: null,
      give: fringe.slice(0, 3).map((f) => f.name),
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
export { tierOf };
