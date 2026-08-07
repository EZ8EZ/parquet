/**
 * Trade Finder. For one named partner, proposes 2-4 whole PACKAGES that both sides
 * have a reason to say yes to.
 *
 * The premise is that a trade happens when the same asset is genuinely worth more to
 * them than to you, not when one side gets fleeced. So a package is scored on the
 * SMALLER of the two sides' fit gain: if either side is only donating, the package is
 * not a suggestion, it is a wish. That is also why the value bands below are tight - an
 * "idea" that needs a 40% value gap to work is a lopsided offer the partner will never
 * accept, and shipping those would make the whole surface untrustworthy after the first
 * rejection.
 *
 * Pricing is delegated to `evaluateTrade`, the exact function /trade uses, so a package
 * this engine suggests and the same package priced by hand can never disagree. The
 * search itself runs on cached per-asset values because it examines a few thousand
 * combinations; only the handful of survivors are evaluated.
 *
 * Three signals compose into every suggestion, all of them already in the codebase:
 *   - valuation gaps      (lib/valuation, via lib/roster and lib/picks)
 *   - behavioral tells    (lib/dossier: pick hoarder, name chaser, youth builder)
 *   - positional need     (RosterAnalysis.byPosition, the same recipe /plan uses)
 */
import type { LeagueHistory } from "../history";
import { leagueValueRanking, type RosterAnalysis } from "../roster";
import { buildDossier, type Dossier } from "../dossier";
import { STAR_THRESHOLD, type Direction } from "../gameplan";
import type { PrincipalIndex } from "../principals";
import { evaluateTrade, type PickInput, type TradeEvaluation } from "../trade";
import {
  convictionIndex,
  convictionNotes,
  type ConvictionNote,
} from "./conviction";
import { packageFragilityNote, type FragilityNote } from "./fragility";
import { leagueReplacementValue } from "../metrics/fragility";

export {
  fragilityNoteFor,
  packageFragilityNote,
  rosterAfter,
  SPOF_SHIFT_MIN,
  type FragilityNote,
} from "./fragility";

export {
  convictionIndex,
  convictionNotes,
  convictionSummary,
  CONVICTION_MIN_GAP,
  MAX_CONVICTION_NOTES,
  type ConvictionNote,
  type ConvictionVerdict,
} from "./conviction";

// ------------------------------------------------------------------------ types

export interface FinderAsset {
  kind: "player" | "pick";
  id: string;
  label: string;
  value: number;
  age: number | null;
  position: string | null;
  /** Present on picks only: exactly what `evaluateTrade` needs to price it. */
  pick?: PickInput;
}

/**
 * What a side WANTS. Narrower than /plan's diagnosis on purpose: it answers only "what
 * kind of asset does this team want", and takes its `stance` from `stanceOf` below so
 * there is one definition of a direction in the app rather than two.
 */
export interface Appetite {
  rosterId: number;
  name: string;
  window: RosterAnalysis["window"];
  stance: Direction;
  /** True for the viewer, which is all the prose needs to pick its pronouns. */
  viewer: boolean;
  /** Wants proven production now. */
  wantsNow: boolean;
  /** Wants youth and time. */
  wantsFuture: boolean;
  /** Wants draft capital specifically. */
  wantsPicks: boolean;
  /** Would concentrate value into one better player rather than spread it. */
  wantsStars: boolean;
  /** Holds picks as ammunition, so they cost more to pry loose. */
  picksAreAmmo: boolean;
  weakPositions: string[];
  strongPositions: string[];
  paysForAge: boolean;
  hoardsPicks: boolean;
  buildsYouth: boolean;
  /** Trades so rarely that a suggestion needs a caveat rather than a filter. */
  reluctant: boolean;
  tags: string[];
}

export interface SuggestedPackage {
  id: string;
  /** Assets the viewer sends. */
  give: FinderAsset[];
  /** Assets the viewer receives. */
  get: FinderAsset[];
  /** Priced by the same function /trade uses. Never recomputed locally. */
  evaluation: TradeEvaluation;
  headline: string;
  /** Why this is good for the viewer. */
  yourCase: string[];
  /** Why the partner says yes, citing their own dossier tells. */
  theirCase: string[];
  /** What the partner will object to. Stated, not hidden. */
  pushback: string[];
  /** Fit gain in value-equivalent points, per side. */
  fit: { yours: number; theirs: number; mutual: number };
  /**
   * Where this package touches a player the viewer ranks well away from consensus.
   * Empty whenever the viewer has no ranking on record, which is the common case
   * and is deliberately indistinguishable from "no meaningful gaps" at the type
   * level - the surface decides how to say each of those, not the engine.
   */
  conviction: ConvictionNote[];
  /**
   * What this package does to the viewer's single point of failure, when it moves it
   * far enough to be worth saying. Null is the common case and means "this deal does
   * not change what your season is load-bearing on", which is not the same as "your
   * roster is fine" - the surface says neither.
   */
  fragility: FragilityNote | null;
  score: number;
}

export interface FinderResult {
  you: Appetite;
  partner: Appetite;
  dossier: Dossier;
  packages: SuggestedPackage[];
  caveats: string[];
}

export interface PartnerBoardRow {
  rosterId: number;
  name: string;
  window: RosterAnalysis["window"];
  stance: Direction;
  tags: string[];
  /** Mutual fit gain of the single best package found, in value points. */
  mutual: number;
  /** One-line preview of that package. */
  bestIdea: string | null;
  trades: number;
  reluctant: boolean;
}

// -------------------------------------------------------------------- constants

/**
 * Fit weights. Every number that moves a suggestion lives here rather than inline, so
 * the surface can be retuned (and argued with) without reading the search.
 */
export const FIT = {
  POS_NEED: 0.12,
  POS_SURPLUS: -0.1,
  NOW_VET: 0.1,
  NOW_YOUTH: -0.12,
  NOW_PICK: -0.18,
  FUTURE_YOUTH: 0.12,
  FUTURE_VET: -0.14,
  LATE_VET: -0.08,
  FUTURE_PICK: 0.15,
  AMMO_PICK: 0.1,
  NAME_CHASER_VET: 0.18,
  YOUTH_BUILDER: 0.12,
  STAR_PREMIUM: 0.08,
} as const;

/** No appetite may move an asset's perceived worth more than this. */
export const FIT_CLAMP = 0.4;

/**
 * The headline-asset threshold, aligned with the trade evaluator's own consolidation
 * note so both surfaces call the same player a star. Distinct from /plan's
 * `STAR_THRESHOLD` (cornerstone-or-better), which counts a roster's difference-makers
 * and is imported rather than restated.
 */
export const STAR_VALUE = 3000;

/** Ordinary trades must land inside this relative value band. */
export const FAIR_BAND = 0.12;
/** Concentrating value into one better player may pay up to this. */
export const CONSOLIDATION_PREMIUM = 0.2;

/**
 * A contender pays a premium for production in a player's prime, not for anyone old.
 * The upper bound matters: without it the finder recommended a 36-year-old as "what
 * your window needs", which is how a tool loses a user's trust in one screen.
 */
const VET_AGE = 27;
const VET_AGE_MAX = 34;
const OLD_AGE = 30;
const YOUNG_AGE = 23;

const MAX_GIVE_POOL = 10;
const MAX_GIVE_PIECES = 3;
const MAX_TARGETS = 6;

// --------------------------------------------------------------------- appetite

/**
 * Mirrors the mean-relative recipe /plan uses on the same `byPosition` array. A local
 * copy rather than a shared export because the two surfaces must agree on the
 * DEFINITION of a hole; `tradefinder.test.ts` pins them together so a change to one
 * without the other fails the suite.
 */
function positionSplit(a: RosterAnalysis): { weak: string[]; strong: string[] } {
  const all = ["PG", "SG", "SF", "PF", "C"];
  const byPos = new Map(a.byPosition.map((p) => [p.pos, p.value]));
  const values = all.map((p) => byPos.get(p) ?? 0);
  const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  return {
    weak: all.filter((p) => (byPos.get(p) ?? 0) < mean * 0.5),
    strong: all.filter((p) => (byPos.get(p) ?? 0) > mean * 1.5),
  };
}

/**
 * The same four-way read /plan's `diagnose` produces, on the same inputs. Duplicated
 * here because `diagnose` re-runs the whole league ranking internally and this engine
 * rates every leaguemate against one already-computed ranking; the test suite asserts
 * the two agree on every roster in the league, which is the guard against drift.
 */
export function stanceOf(
  a: RosterAnalysis,
  valueRank: number,
  teams: number,
): Direction {
  const stars = a.valued.filter((v) => v.value >= STAR_THRESHOLD).length;
  const topHalf = valueRank > 0 && valueRank <= Math.ceil(teams / 2);
  if (a.window === "win-now" || (topHalf && stars >= 2 && (a.coreAge ?? 26) >= 26.5))
    return "contend";
  if (a.window === "rebuilding" && topHalf) return "ascend";
  if (a.window === "rebuilding") return "rebuild";
  return "retool";
}

export function appetiteFor(
  a: RosterAnalysis,
  valueRank: number,
  teams: number,
  opts: { dossier?: Dossier; viewer?: boolean } = {},
): Appetite {
  const { weak, strong } = positionSplit(a);
  const stance = stanceOf(a, valueRank, teams);
  const p = opts.dossier?.profile;
  const hoardsPicks = p ? p.picks.net >= 3 : false;
  return {
    rosterId: a.rosterId,
    name: a.teamName ?? a.ownerName,
    window: a.window,
    stance,
    viewer: opts.viewer ?? false,
    wantsNow: stance === "contend",
    wantsFuture: stance === "rebuild",
    wantsPicks: stance === "rebuild" || hoardsPicks,
    // A retooling roster is the one place this app tells you to be willing to move
    // your best player, because the mid-pack drift is the actual problem (/plan says
    // the same thing). Everyone else is trying to concentrate value, not spread it.
    wantsStars: stance === "contend" || stance === "ascend",
    // Ahead of schedule: the classic error is spending the picks a year early, so they
    // cost more to pry loose than their raw value suggests.
    picksAreAmmo: stance === "ascend",
    weakPositions: weak,
    strongPositions: strong,
    paysForAge: p?.overpaysForAge ?? false,
    hoardsPicks,
    buildsYouth: p?.acquisitions.avgAge != null && p.acquisitions.avgAge <= 24,
    reluctant: opts.dossier
      ? opts.dossier.tags.includes("Never trades") ||
        opts.dossier.tags.includes("Ghost") ||
        opts.dossier.tags.includes("Rarely trades")
      : false,
    tags: opts.dossier?.tags ?? [],
  };
}

// ------------------------------------------------------------------- perception

export interface Reason {
  text: string;
  /** +1 = a reason this side wants the asset, -1 = a reason they discount it. */
  sign: 1 | -1;
}

export interface Perception {
  /** The asset's worth THROUGH THIS SIDE'S EYES, in the same value units. */
  value: number;
  reasons: Reason[];
}

/**
 * How much a side actually wants one asset, expressed as a premium or discount on its
 * league value. This is where a trade comes from: parity in league value plus a gap in
 * perceived value is a deal, and parity in both is just paperwork.
 */
export function perceive(asset: FinderAsset, ap: Appetite): Perception {
  let bonus = 0;
  const reasons: Reason[] = [];
  const age = asset.age;
  // Pronouns, so one set of phrases serves both sides without reading as if the app
  // is describing the wrong team.
  const their = ap.viewer ? "your" : "their";
  const they = ap.viewer ? "you" : "they";
  const add = (delta: number, text: string) => {
    bonus += delta;
    reasons.push({ text, sign: delta >= 0 ? 1 : -1 });
  };

  if (asset.kind === "pick") {
    if (ap.wantsPicks)
      add(
        FIT.FUTURE_PICK,
        ap.hoardsPicks
          ? `draft capital, which ${they} collect`
          : `draft capital, which a rebuild runs on`,
      );
    // Worded to read correctly in both directions, since the same phrase has to serve
    // "this is why they want it" and "this is why it costs you to send it".
    if (ap.picksAreAmmo)
      add(FIT.AMMO_PICK, `ammunition for a window that is still opening`);
    if (ap.wantsNow)
      add(FIT.NOW_PICK, `a future pick does not help ${they} win this season`);
  } else {
    if (asset.position && ap.weakPositions.includes(asset.position))
      add(FIT.POS_NEED, `fills ${their} thinnest spot at ${asset.position}`);
    else if (asset.position && ap.strongPositions.includes(asset.position))
      add(FIT.POS_SURPLUS, `${asset.position} is already ${their} surplus`);

    if (ap.wantsNow) {
      if (age != null && age >= VET_AGE && age <= VET_AGE_MAX)
        add(FIT.NOW_VET, `${age} and in his prime, which is what ${their} window needs`);
      if (age != null && age <= YOUNG_AGE)
        add(FIT.NOW_YOUTH, `at ${age} he is upside ${they} cannot wait on`);
    }
    if (ap.wantsFuture) {
      if (age != null && age <= YOUNG_AGE)
        add(FIT.FUTURE_YOUTH, `${age} years old, on ${their} timeline`);
      if (age != null && age >= OLD_AGE)
        add(FIT.FUTURE_VET, `${age} is past the window ${they} are building toward`);
    }
    // Neither contending nor rebuilding, so its window is still opening: a player who
    // will be finished by the time it does is worth less here than his league value.
    if (!ap.wantsNow && !ap.wantsFuture && age != null && age >= 33)
      add(FIT.LATE_VET, `${age}, and ${their} window is still opening`);
    if (ap.wantsStars && asset.value >= STAR_VALUE)
      add(FIT.STAR_PREMIUM, `a starter of this quality is worth more than its parts`);
    if (ap.paysForAge && age != null && age >= OLD_AGE)
      add(
        FIT.NAME_CHASER_VET,
        `${age}, and ${their} record shows a habit of paying up for 30+ veterans`,
      );
    if (ap.buildsYouth && age != null && age <= 24)
      add(FIT.YOUTH_BUILDER, `${age}, and ${they} consistently buy young`);
  }

  const clamped = Math.max(-FIT_CLAMP, Math.min(FIT_CLAMP, bonus));
  return { value: Math.round(asset.value * (1 + clamped)), reasons };
}

// ------------------------------------------------------------------------ pools

export function assetsOf(a: RosterAnalysis): FinderAsset[] {
  const players: FinderAsset[] = a.valued.map((v) => ({
    kind: "player" as const,
    id: v.playerId,
    label: v.name,
    value: v.value,
    age: v.age,
    position: v.position,
  }));
  const picks: FinderAsset[] = a.picks.picks.map((p) => ({
    kind: "pick" as const,
    id: `${p.season}-${p.round}-${p.originalRoster}`,
    label: p.label,
    value: p.value,
    age: null,
    position: null,
    pick: { round: p.round, season: p.season, originalRosterId: p.originalRoster },
  }));
  return [...players, ...picks];
}

export interface Priced {
  asset: FinderAsset;
  /** Perceived by the side that currently holds it. */
  holder: Perception;
  /** Perceived by the side that would receive it. */
  taker: Perception;
  /** How much more the taker wants it than the holder does. */
  gap: number;
}

export function price(
  assets: FinderAsset[],
  holder: Appetite,
  taker: Appetite,
): Priced[] {
  return assets
    .map((asset) => {
      const h = perceive(asset, holder);
      const t = perceive(asset, taker);
      return { asset, holder: h, taker: t, gap: t.value - h.value };
    })
    .sort((a, b) => b.gap - a.gap);
}

// ----------------------------------------------------------------------- search

export interface RawPackage {
  give: Priced[];
  get: Priced[];
  giveTotal: number;
  getTotal: number;
  delta: number;
  yourGain: number;
  theirGain: number;
  mutual: number;
  score: number;
}

const topValue = (list: Priced[]) => Math.max(0, ...list.map((p) => p.asset.value));

/**
 * The premium is for CONCENTRATING value upward - many pieces into one better player,
 * which is worth paying for because you cannot start four of them. Trading a superstar
 * for two lesser stars is the opposite move and gets no such licence, which is why the
 * incoming headline asset has to actually be the bigger one.
 */
function withinBand(pkg: {
  giveTotal: number;
  getTotal: number;
  give: Priced[];
  get: Priced[];
}): boolean {
  const scale = Math.max(pkg.giveTotal, pkg.getTotal) || 1;
  const rel = (pkg.getTotal - pkg.giveTotal) / scale;
  const topGet = topValue(pkg.get);
  const topGive = topValue(pkg.give);
  if (rel < 0) {
    const youConsolidate =
      pkg.get.length < pkg.give.length && topGet >= STAR_VALUE && topGet > topGive;
    return -rel <= (youConsolidate ? CONSOLIDATION_PREMIUM : FAIR_BAND);
  }
  const theyConsolidate =
    pkg.give.length < pkg.get.length && topGive >= STAR_VALUE && topGive > topGet;
  return rel <= (theyConsolidate ? CONSOLIDATION_PREMIUM : FAIR_BAND);
}

/**
 * Nobody trying to win downgrades their best asset: a contending or ascending team has
 * to come out of a star trade with a BIGGER single piece, or it is just spreading value
 * thinner. A rebuilding or retooling team is exempt on purpose, because selling the
 * star for a bundle of youth and picks is the correct move from there, and refusing to
 * model it would hide the only genuinely available star in most leagues. Their guard is
 * the value band, which is what stops a bundle from being scraps.
 */
function sideRespectsStars(sent: Priced[], received: Priced[], side: Appetite): boolean {
  if (!side.wantsStars) return true;
  const topSent = topValue(sent);
  if (topSent < STAR_VALUE) return true;
  return topValue(received) > topSent;
}

function sum(list: Priced[], pick: (p: Priced) => number): number {
  return list.reduce((s, p) => s + pick(p), 0);
}

/** Combinations of up to `max` items, as index lists. */
function combos(n: number, max: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, acc: number[]) => {
    if (acc.length) out.push([...acc]);
    if (acc.length === max) return;
    for (let i = start; i < n; i++) {
      acc.push(i);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

/**
 * The search. Bounded on purpose: the give pool is the ten assets the partner wants
 * most relative to you, packages run to three pieces, and targets to six. That is a
 * few thousand sums, which is cheap, and the cap is what keeps this from becoming a
 * knapsack solver whose output nobody can explain.
 */
export function searchPackages(
  mine: Priced[],
  theirs: Priced[],
  you: Appetite,
  partner: Appetite,
  max: number,
): RawPackage[] {
  const givePool = mine.slice(0, MAX_GIVE_POOL);
  const targetPool = theirs.slice(0, MAX_TARGETS);
  const giveSets = combos(givePool.length, MAX_GIVE_PIECES);

  // Get side: any single target, plus pairs among the top four. A three-for-two is
  // already reachable; a five-piece swap is not something anyone sends on a Tuesday.
  const getSets: number[][] = [];
  for (let i = 0; i < targetPool.length; i++) getSets.push([i]);
  for (let i = 0; i < Math.min(4, targetPool.length); i++) {
    for (let j = i + 1; j < Math.min(4, targetPool.length); j++) getSets.push([i, j]);
  }

  const found: RawPackage[] = [];
  for (const gi of getSets) {
    const get = gi.map((i) => targetPool[i]);
    const getTotal = sum(get, (p) => p.asset.value);
    let best: RawPackage | null = null;
    for (const si of giveSets) {
      const give = si.map((i) => givePool[i]);
      const giveTotal = sum(give, (p) => p.asset.value);
      if (!withinBand({ give, get, giveTotal, getTotal })) continue;
      if (!sideRespectsStars(give, get, you)) continue;
      if (!sideRespectsStars(get, give, partner)) continue;
      // Fit gain per side: what you receive through your eyes minus what you send
      // through your eyes, and the mirror for them.
      const yourGain = sum(get, (p) => p.taker.value) - sum(give, (p) => p.holder.value);
      const theirGain = sum(give, (p) => p.taker.value) - sum(get, (p) => p.holder.value);
      if (yourGain <= 0 || theirGain <= 0) continue;
      const mutual = Math.min(yourGain, theirGain);
      // Tie-break toward parity so two equally mutual ideas surface the fairer one.
      const imbalance =
        Math.abs(getTotal - giveTotal) / (Math.max(getTotal, giveTotal) || 1);
      const candidate: RawPackage = {
        give,
        get,
        giveTotal,
        getTotal,
        delta: getTotal - giveTotal,
        yourGain,
        theirGain,
        mutual,
        score: Math.round(mutual * (1 - imbalance)),
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
    if (best) found.push(best);
  }

  found.sort((a, b) => b.score - a.score);

  // One package per headline target, so the list reads as genuinely different ideas
  // rather than four spellings of the same offer.
  const seen = new Set<string>();
  const out: RawPackage[] = [];
  for (const pkg of found) {
    const key = pkg.get[0].asset.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pkg);
    if (out.length >= max) break;
  }
  return out;
}

// ------------------------------------------------------------------------ prose

function listOf(assets: FinderAsset[]): string {
  return assets.map((a) => a.label).join(" + ");
}

function dedupe(lines: string[]): string[] {
  return [...new Set(lines.filter(Boolean))];
}

/** Only the reasons a side WANTS something argue for a trade; the rest are pushback. */
function pros(p: Priced): string[] {
  return p.taker.reasons.filter((r) => r.sign > 0).map((r) => `${p.asset.label}: ${r.text}.`);
}
function cons(p: Priced): string[] {
  return p.taker.reasons.filter((r) => r.sign < 0).map((r) => `${p.asset.label}: ${r.text}.`);
}

function buildCases(
  pkg: RawPackage,
  you: Appetite,
  partner: Appetite,
): { yourCase: string[]; theirCase: string[]; pushback: string[] } {
  const theirCase = pkg.give.flatMap(pros);
  const yourCase = pkg.get.flatMap(pros);
  const pushback = pkg.give.flatMap(cons);

  // Only state the aggregate positional read when no individual asset already did, so
  // the same fact is not made twice in four lines.
  if (!theirCase.some((l) => l.includes("thinnest spot")) && partner.weakPositions.length)
    theirCase.push(`Their thinnest positions are ${partner.weakPositions.join(", ")}.`);
  if (partner.wantsNow)
    theirCase.push(
      `They read as win-now, so production in a player's prime is worth a premium to them.`,
    );
  else if (partner.wantsFuture)
    theirCase.push(`They read as rebuilding, so youth and picks are worth more to them than to you.`);
  else if (partner.stance === "ascend")
    theirCase.push(`They are ahead of schedule, so they want talent without spending their picks.`);
  else
    theirCase.push(`They are stuck mid-pack, which is the position that most needs a direction.`);

  const shedding = pkg.give
    .map((p) => p.asset.position)
    .filter((pos): pos is string => pos != null && you.strongPositions.includes(pos));
  if (shedding.length)
    yourCase.push(
      `You are paying out of surplus at ${[...new Set(shedding)].join(", ")}, where a lineup only starts one.`,
    );
  if (pkg.get.length < pkg.give.length && topValue(pkg.get) >= STAR_VALUE)
    yourCase.push(
      `Concentrates ${pkg.give.length} pieces into ${pkg.get.length}. You cannot start your whole bench.`,
    );
  if (pkg.delta < 0)
    yourCase.push(
      `You pay ${Math.abs(pkg.delta).toLocaleString()} over the raw value, which is the cost of the upgrade.`,
    );

  if (pkg.delta > 0)
    pushback.push(
      `They give up ${pkg.delta.toLocaleString()} more in raw value than they get back, so the fit has to carry the ask.`,
    );
  if (partner.reluctant) pushback.push(`They rarely trade at all, so expect a slow answer or none.`);

  return {
    yourCase: dedupe(yourCase),
    theirCase: dedupe(theirCase),
    pushback: dedupe(pushback),
  };
}

// ------------------------------------------------------------------- entrypoint

function toTradeInput(pkg: RawPackage) {
  const side = (list: Priced[]) => ({
    playerIds: list.filter((p) => p.asset.kind === "player").map((p) => p.asset.id),
    picks: list.map((p) => p.asset.pick).filter((pk): pk is PickInput => pk != null),
  });
  return { give: side(pkg.give), get: side(pkg.get) };
}

interface Board {
  ranking: RosterAnalysis[];
  rankOf: Map<number, number>;
  teams: number;
}

function board(h: LeagueHistory): Board {
  const ranking = leagueValueRanking(h);
  const rankOf = new Map(ranking.map((r, i) => [r.rosterId, i + 1]));
  return { ranking, rankOf, teams: ranking.length };
}

/**
 * The viewer's own appetite is read from their ROSTER, never from their dossier. What
 * their habits say about them is the subject of /managers and the strategy engine; the
 * question here is what this roster needs, and a manager's tendency to overpay for age
 * is not a reason to recommend that they do it again.
 */
function appetiteOf(
  b: Board,
  rosterId: number,
  opts: { dossier?: Dossier; viewer?: boolean } = {},
): Appetite | null {
  const a = b.ranking.find((r) => r.rosterId === rosterId);
  if (!a) return null;
  return appetiteFor(a, b.rankOf.get(rosterId) ?? 0, b.teams, opts);
}

export function findTrades(
  h: LeagueHistory,
  principals: PrincipalIndex,
  opts: {
    rosterId: number;
    partnerRosterId: number;
    max?: number;
    /**
     * The viewer's own ranking, best first, as /rank saved it. Optional so every
     * existing caller keeps working unchanged; absent or empty means the viewer has
     * no opinion on record and no package carries a conviction note.
     */
    customOrder?: string[];
  },
): FinderResult | null {
  const { rosterId, partnerRosterId } = opts;
  if (rosterId === partnerRosterId) return null;
  const b = board(h);
  const dossier = buildDossier(h, partnerRosterId, principals);
  const you = appetiteOf(b, rosterId, { viewer: true });
  const partner = appetiteOf(b, partnerRosterId, { dossier });
  if (!you || !partner) return null;

  const mineA = b.ranking.find((r) => r.rosterId === rosterId)!;
  const theirsA = b.ranking.find((r) => r.rosterId === partnerRosterId)!;
  const mine = price(assetsOf(mineA), you, partner);
  const theirs = price(assetsOf(theirsA), partner, you);

  const raw = searchPackages(mine, theirs, you, partner, opts.max ?? 3);
  // Built once for the whole result rather than per package: the index is a scan of
  // the viewer's ranking, and three packages asking for it separately would pay for
  // the same scan three times.
  const conviction = convictionIndex(opts.customOrder ?? [], h.players);
  // Same reasoning as the conviction index above: the replacement line is a scan of the
  // whole league, and it is identical for every package, so it is computed once here
  // rather than three times inside the loop.
  const replacementValue = leagueReplacementValue(h);
  const packages: SuggestedPackage[] = raw.map((pkg, i) => {
    const give = pkg.give.map((p) => p.asset);
    const get = pkg.get.map((p) => p.asset);
    const cases = buildCases(pkg, you, partner);
    return {
      id: `p${i + 1}`,
      give,
      get,
      // The single source of truth for what this trade is worth.
      evaluation: evaluateTrade(h, toTradeInput(pkg)),
      headline: `${listOf(give)} for ${listOf(get)}`,
      ...cases,
      fit: { yours: pkg.yourGain, theirs: pkg.theirGain, mutual: pkg.mutual },
      conviction: convictionNotes({ give, get }, conviction),
      fragility: packageFragilityNote(h, rosterId, give, get, { replacementValue }),
      score: pkg.score,
    };
  });

  const caveats: string[] = [];
  if (!packages.length)
    caveats.push(
      `No package clears the bar with ${partner.name}. Either both rosters want the same things or the value does not line up, and a forced offer here is a wasted ask.`,
    );
  if (partner.reluctant)
    caveats.push(
      `${partner.name} trades rarely (${dossier.profile.trades} completed). Lead with your best version of this, because you may only get one bite.`,
    );
  if (dossier.profile.trades === 0)
    caveats.push(
      `No completed trade in the recorded history, so there are no behavioral tells here at all. Everything above is roster fit only.`,
    );
  caveats.push(
    "Values are this app's own model, not theirs. They will price their own players higher than you do, so expect to negotiate up from here.",
  );

  return { you, partner, dossier, packages, caveats };
}

/**
 * Who to call, ranked by how much mutual room actually exists. Deliberately skips
 * `evaluateTrade` - this is a prefilter over every leaguemate, and the authoritative
 * pricing happens once you pick one.
 */
export function partnerBoard(
  h: LeagueHistory,
  principals: PrincipalIndex,
  rosterId: number,
): PartnerBoardRow[] {
  const b = board(h);
  const you = appetiteOf(b, rosterId, { viewer: true });
  if (!you) return [];
  const myAssets = assetsOf(b.ranking.find((r) => r.rosterId === rosterId)!);

  const rows: PartnerBoardRow[] = [];
  for (const a of b.ranking) {
    if (a.rosterId === rosterId) continue;
    const dossier = buildDossier(h, a.rosterId, principals);
    const partner = appetiteFor(a, b.rankOf.get(a.rosterId) ?? 0, b.teams, { dossier });
    const mine = price(myAssets, you, partner);
    const theirs = price(assetsOf(a), partner, you);
    const best = searchPackages(mine, theirs, you, partner, 1)[0] ?? null;
    rows.push({
      rosterId: a.rosterId,
      name: partner.name,
      window: a.window,
      stance: partner.stance,
      tags: dossier.tags.slice(0, 3),
      mutual: best?.mutual ?? 0,
      bestIdea: best
        ? `${listOf(best.give.map((p) => p.asset))} for ${listOf(best.get.map((p) => p.asset))}`
        : null,
      trades: dossier.profile.trades,
      reluctant: partner.reluctant,
    });
  }
  return rows.sort((x, y) => y.mutual - x.mutual);
}
