import { analyzeRoster, leagueValueRanking } from "../roster.js";
import { buildDossier } from "../dossier/index.js";
import { STAR_THRESHOLD } from "../gameplan/index.js";
import { evaluateTrade } from "../trade/index.js";
import { convictionIndex, convictionNotes } from "./conviction.js";
import { packageFragilityNote } from "./fragility.js";
import { packageLeverageShift } from "./leverage.js";
import { leagueReplacementValue } from "../metrics/fragility.js";
import { leaguePositionPools } from "../lab/leverage/index.js";
import { leagueWindows, windowShort, windowThesis } from "../metrics/window.js";
import { REFUSAL_CODES } from "../refusal.js";
import { cachedLeagueTimelines } from "../metrics/duration.js";
import { stanceOf } from "../metrics/axes.js";
import { tradeHref } from "../trade/url.js";
import { postTradeTimeline } from "./after.js";
/**
 * @typedef {import('../history.js').LeagueHistory} LeagueHistory
 * @typedef {import('../trade/index.js').TradeAsset} TradeAsset
 * @typedef {import('../trade/index.js').TradeInput} TradeInput
 */
/**
 * A leaguemate's read against the finder's shared appetite model — what a roster
 * wants, derived once per (roster, ranking) pair and reused across every package
 * evaluated for it.
 * @typedef {Object} Appetite
 * @property {number} rosterId
 * @property {string} name
 * @property {"contend"|"ascend"|"rebuild"|"retool"} stance
 * @property {boolean} viewer
 * @property {boolean} wantsNow
 * @property {boolean} wantsFuture
 * @property {boolean} wantsPicks
 * @property {boolean} wantsStars
 * @property {boolean} picksAreAmmo
 * @property {string[]} weakPositions
 * @property {string[]} strongPositions
 * @property {boolean} paysForAge
 * @property {boolean} hoardsPicks
 * @property {boolean} buildsYouth
 * @property {boolean} reluctant
 * @property {string[]} tags
 */
/**
 * @typedef {Object} PerceiveReason
 * @property {string} text
 * @property {1|-1} sign
 */
/**
 * @typedef {Object} Perceived
 * @property {number} value the asset's value as THIS side perceives it (fit-adjusted)
 * @property {PerceiveReason[]} reasons
 */
/**
 * A priced asset — one side's raw and perceived-by-both-parties view of it.
 * @typedef {Object} PricedAsset
 * @property {TradeAsset & { pick?: { round: number, season: string, originalRosterId: number } }} asset
 * @property {Perceived} holder how the CURRENT owner perceives it
 * @property {Perceived} taker how the OTHER side perceives it
 * @property {number} gap taker.value - holder.value
 */
/**
 * @typedef {Object} TradePackageCandidate
 * @property {PricedAsset[]} give
 * @property {PricedAsset[]} get
 * @property {number} giveTotal
 * @property {number} getTotal
 * @property {number} delta getTotal - giveTotal
 * @property {number} yourGain
 * @property {number} theirGain
 * @property {number} mutual
 * @property {number} score
 */
export {
  fragilityNoteFor,
  packageFragilityNote,
  SPOF_SHIFT_MIN,
} from "./fragility.js";
export {
  byPositionAfter,
  packageParts,
  postTradeTimeline,
  rosterAfter,
  startableAfter,
} from "./after.js";
export { leverageShiftFor, packageLeverageShift, LEVERAGE_SHIFT_MIN } from "./leverage.js";
export {
  convictionIndex,
  convictionNotes,
  convictionSummary,
  CONVICTION_MIN_GAP,
  MAX_CONVICTION_NOTES,
} from "./conviction.js";
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
};
/** No appetite may move an asset's perceived worth more than this. */
export const FIT_CLAMP = 0.4;
/**
 * The headline-asset threshold: what this module treats as the piece a package is
 * really about, used to decide whether a package is a consolidation and whether a
 * "wants stars" appetite is being served.
 *
 * DELIBERATELY NOT A TIER BOUNDARY, and this docstring used to claim the opposite. It
 * said the threshold was "aligned with the trade evaluator's own consolidation note so
 * both surfaces call the same player a star" - which stopped being true when the
 * evaluator moved to `leagueTierLabel` (lib/trade/index.ts) and started reading tier
 * names off the live distribution instead of a shared literal. There is no shared 3000
 * anywhere any more, and 3,000 does not even land inside a tier on the current
 * distribution: it falls in the gap between High-End Rotation and Starter. A docstring
 * asserting an alignment that no longer exists is worse than no docstring, because the
 * next person tunes the wrong end.
 *
 * WHY IT STAYS AN ABSOLUTE ANYWAY. A tier boundary moves every time the model is
 * recalibrated, and this constant is not naming a rank - it is naming "big enough that
 * a package is about this asset", which is a property of the package's shape. Tying it
 * to a boundary would make the finder's notion of a headline asset lurch whenever the
 * distribution shifted, for no gain. What it IS is a literal on a rescalable scale
 * (see SHELVED S5, `tierOf`), so it carries the same expiry risk and the same duty:
 * RE-CHECK IT AT EVERY RECALIBRATION by counting how many assets clear it. On the
 * current distribution 40 do, which is roughly the top 2% of the priced pool and the
 * band this was tuned for. If a recalibration leaves single digits or several hundred
 * clearing it, this number is wrong and the finder is quietly mis-shaping packages.
 *
 * Distinct from /plan's `STAR_THRESHOLD` (cornerstone-or-better), which counts a
 * roster's difference-makers and is imported rather than restated.
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
function positionSplit(a) {
  const all = ["PG", "SG", "SF", "PF", "C"];
  const byPos = new Map(a.byPosition.map((p) => [p.pos, p.value]));
  const values = all.map((p) => byPos.get(p) ?? 0);
  const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  return {
    weak: all.filter((p) => (byPos.get(p) ?? 0) < mean * 0.5),
    strong: all.filter((p) => (byPos.get(p) ?? 0) > mean * 1.5),
  };
}
/*
 * `stanceOf` USED TO BE DEFINED HERE, a second copy of the four-way read /plan's
 * `diagnose` produces, with a suite test asserting the two agreed on every roster. Two
 * implementations kept in step by a test is the `tierOf` shape (SHELVED S6) with a
 * tripwire attached, and the fix for two implementations is one implementation. It now
 * lives in lib/metrics/axes.js, takes the roster's POSTURE rather than its core-age
 * band, and both engines call it. The cross-check test stays, because a shared function
 * called with different arguments can still disagree - it just cannot drift.
 */
/**
 * @param {{ rosterId: number, teamName?: string|null, ownerName?: string|null, byPosition: { pos: string, value: number }[], valued: { value: number }[], coreAge?: number|null }} a a `leagueValueRanking` row
 * @param {number} valueRank
 * @param {number} teams
 * @param {{ dossier?: { profile: { picks: { net: number }, overpaysForAge?: boolean, acquisitions: { avgAge: number|null } }, tags: string[] }, viewer?: boolean, posture?: string|null }} [opts]
 * @returns {Appetite}
 */
export function appetiteFor(a, valueRank, teams, opts = {}) {
  const { weak, strong } = positionSplit(a);
  const { stance } = stanceOf({
    posture: opts.posture ?? null,
    coreAge: a.coreAge,
    stars: a.valued.filter((v) => v.value >= STAR_THRESHOLD).length,
    valueRank,
    teams,
  });
  const p = opts.dossier?.profile;
  const hoardsPicks = p ? p.picks.net >= 3 : false;
  return {
    rosterId: a.rosterId,
    name: a.teamName ?? a.ownerName,
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
/**
 * How much a side actually wants one asset, expressed as a premium or discount on its
 * league value. This is where a trade comes from: parity in league value plus a gap in
 * perceived value is a deal, and parity in both is just paperwork.
 */
/**
 * @param {TradeAsset} asset
 * @param {Appetite} ap
 * @returns {Perceived}
 */
export function perceive(asset, ap) {
  let bonus = 0;
  const reasons = [];
  const age = asset.age;
  // Pronouns, so one set of phrases serves both sides without reading as if the app
  // is describing the wrong team.
  const their = ap.viewer ? "your" : "their";
  const they = ap.viewer ? "you" : "they";
  const add = (delta, text) => {
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
        add(
          FIT.NOW_VET,
          `${age} and in his prime, which is what ${their} window needs`,
        );
      if (age != null && age <= YOUNG_AGE)
        add(FIT.NOW_YOUTH, `at ${age} he is upside ${they} cannot wait on`);
    }
    if (ap.wantsFuture) {
      if (age != null && age <= YOUNG_AGE)
        add(FIT.FUTURE_YOUTH, `${age} years old, on ${their} timeline`);
      if (age != null && age >= OLD_AGE)
        add(
          FIT.FUTURE_VET,
          `${age} is past the window ${they} are building toward`,
        );
    }
    // Neither contending nor rebuilding, so its window is still opening: a player who
    // will be finished by the time it does is worth less here than his league value.
    if (!ap.wantsNow && !ap.wantsFuture && age != null && age >= 33)
      add(FIT.LATE_VET, `${age}, and ${their} window is still opening`);
    if (ap.wantsStars && asset.value >= STAR_VALUE)
      add(
        FIT.STAR_PREMIUM,
        `a starter of this quality is worth more than its parts`,
      );
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
/**
 * @param {{ valued: { playerId: string, name: string, value: number, age: number|null, position: string|null }[], picks: { picks: { season: string, round: number, originalRoster: number, label: string, value: number }[] } }} a a `leagueValueRanking` row
 * @returns {TradeAsset[]}
 */
export function assetsOf(a) {
  /** @type {TradeAsset[]} */
  const players = a.valued.map((v) => ({
    kind: "player",
    id: v.playerId,
    label: v.name,
    value: v.value,
    age: v.age,
    position: v.position,
  }));
  /** @type {TradeAsset[]} */
  const picks = a.picks.picks.map((p) => ({
    kind: "pick",
    id: `${p.season}-${p.round}-${p.originalRoster}`,
    label: p.label,
    value: p.value,
    age: null,
    position: null,
    pick: {
      round: p.round,
      season: p.season,
      originalRosterId: p.originalRoster,
    },
  }));
  return [...players, ...picks];
}
/**
 * @param {TradeAsset[]} assets
 * @param {Appetite} holder
 * @param {Appetite} taker
 * @returns {PricedAsset[]} sorted by `gap` descending
 */
export function price(assets, holder, taker) {
  return assets
    .map((asset) => {
      const h = perceive(asset, holder);
      const t = perceive(asset, taker);
      return { asset, holder: h, taker: t, gap: t.value - h.value };
    })
    .sort((a, b) => b.gap - a.gap);
}
const topValue = (list) => Math.max(0, ...list.map((p) => p.asset.value));
/**
 * The premium is for CONCENTRATING value upward - many pieces into one better player,
 * which is worth paying for because you cannot start four of them. Trading a superstar
 * for two lesser stars is the opposite move and gets no such licence, which is why the
 * incoming headline asset has to actually be the bigger one.
 */
function withinBand(pkg) {
  const scale = Math.max(pkg.giveTotal, pkg.getTotal) || 1;
  const rel = (pkg.getTotal - pkg.giveTotal) / scale;
  const topGet = topValue(pkg.get);
  const topGive = topValue(pkg.give);
  if (rel < 0) {
    const youConsolidate =
      pkg.get.length < pkg.give.length &&
      topGet >= STAR_VALUE &&
      topGet > topGive;
    return -rel <= (youConsolidate ? CONSOLIDATION_PREMIUM : FAIR_BAND);
  }
  const theyConsolidate =
    pkg.give.length < pkg.get.length &&
    topGive >= STAR_VALUE &&
    topGive > topGet;
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
function sideRespectsStars(sent, received, side) {
  if (!side.wantsStars) return true;
  const topSent = topValue(sent);
  if (topSent < STAR_VALUE) return true;
  return topValue(received) > topSent;
}
function sum(list, pick) {
  return list.reduce((s, p) => s + pick(p), 0);
}
/** Combinations of up to `max` items, as index lists. */
function combos(n, max) {
  const out = [];
  const walk = (start, acc) => {
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
 *
 * `forceGiveId` IS THE ONE WAY IN FOR AN ASSET THE POOL WOULD NEVER PICK.
 *
 * The give pool is entirely PARTNER-DRIVEN - `price` sorts by gap, so it is the ten
 * assets this partner wants most relative to what you would take for them. That is the
 * right default and it has a structural blind spot: the asset the VIEWER most wants to
 * move is not necessarily an asset anybody is asking for, and /plan's own timeline
 * break (the roster's diagnosed odd one out) can therefore be invisible to every
 * suggestion this function will ever make. Forcing an id pins it into the pool and
 * requires it in every package, which turns "here is what they want" into "here is what
 * they would take FOR THIS," a different and sometimes more useful question.
 *
 * It never invents availability: an id that is not in `mine` at all returns no
 * packages rather than a package built around an asset the roster does not own.
 */
/**
 * @param {PricedAsset[]} mine
 * @param {PricedAsset[]} theirs
 * @param {Appetite} you
 * @param {Appetite} partner
 * @param {number} max
 * @param {{ forceGiveId?: string|null }} [opts]
 * @returns {TradePackageCandidate[]}
 */
export function searchPackages(mine, theirs, you, partner, max, opts = {}) {
  const forceId = opts.forceGiveId ?? null;
  let givePool = mine.slice(0, MAX_GIVE_POOL);
  let forcedIndex = -1;
  if (forceId != null) {
    forcedIndex = givePool.findIndex((p) => String(p.asset.id) === String(forceId));
    if (forcedIndex < 0) {
      const forced = mine.find((p) => String(p.asset.id) === String(forceId));
      if (!forced) return [];
      // Displaces the pool's last entry rather than widening the pool, so the
      // combinatorial cost of a forced search is identical to an ordinary one.
      givePool = [forced, ...givePool.slice(0, MAX_GIVE_POOL - 1)];
      forcedIndex = 0;
    }
  }
  const targetPool = theirs.slice(0, MAX_TARGETS);
  const giveSets = combos(givePool.length, MAX_GIVE_PIECES).filter(
    (si) => forcedIndex < 0 || si.includes(forcedIndex),
  );
  // Get side: any single target, plus pairs among the top four. A three-for-two is
  // already reachable; a five-piece swap is not something anyone sends on a Tuesday.
  const getSets = [];
  for (let i = 0; i < targetPool.length; i++) getSets.push([i]);
  for (let i = 0; i < Math.min(4, targetPool.length); i++) {
    for (let j = i + 1; j < Math.min(4, targetPool.length); j++)
      getSets.push([i, j]);
  }
  const found = [];
  for (const gi of getSets) {
    const get = gi.map((i) => targetPool[i]);
    const getTotal = sum(get, (p) => p.asset.value);
    let best = null;
    for (const si of giveSets) {
      const give = si.map((i) => givePool[i]);
      const giveTotal = sum(give, (p) => p.asset.value);
      if (!withinBand({ give, get, giveTotal, getTotal })) continue;
      if (!sideRespectsStars(give, get, you)) continue;
      if (!sideRespectsStars(get, give, partner)) continue;
      // Fit gain per side: what you receive through your eyes minus what you send
      // through your eyes, and the mirror for them.
      const yourGain =
        sum(get, (p) => p.taker.value) - sum(give, (p) => p.holder.value);
      const theirGain =
        sum(give, (p) => p.taker.value) - sum(get, (p) => p.holder.value);
      if (yourGain <= 0 || theirGain <= 0) continue;
      const mutual = Math.min(yourGain, theirGain);
      // Tie-break toward parity so two equally mutual ideas surface the fairer one.
      const imbalance =
        Math.abs(getTotal - giveTotal) / (Math.max(getTotal, giveTotal) || 1);
      const candidate = {
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
  const seen = new Set();
  const out = [];
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
function listOf(assets) {
  return assets.map((a) => a.label).join(" + ");
}
function dedupe(lines) {
  return [...new Set(lines.filter(Boolean))];
}
/** Only the reasons a side WANTS something argue for a trade; the rest are pushback. */
function pros(p) {
  return p.taker.reasons
    .filter((r) => r.sign > 0)
    .map((r) => `${p.asset.label}: ${r.text}.`);
}
function cons(p) {
  return p.taker.reasons
    .filter((r) => r.sign < 0)
    .map((r) => `${p.asset.label}: ${r.text}.`);
}
function buildCases(pkg, you, partner) {
  const theirCase = pkg.give.flatMap(pros);
  const yourCase = pkg.get.flatMap(pros);
  const pushback = pkg.give.flatMap(cons);
  // Only state the aggregate positional read when no individual asset already did, so
  // the same fact is not made twice in four lines.
  if (
    !theirCase.some((l) => l.includes("thinnest spot")) &&
    partner.weakPositions.length
  )
    theirCase.push(
      `Their thinnest positions are ${partner.weakPositions.join(", ")}.`,
    );
  /*
   * THE STANCE SENTENCE USED TO BE APPENDED HERE, TO EVERY PACKAGE, UNCONDITIONALLY.
   *
   * Four canned lines - one per stance - pushed onto `theirCase` for every package the
   * search returned. It is a fact about the PARTNER, not about the package, so it read
   * identically on all three cards, and by then the same fact had already been stated
   * three other ways on the same screen: as the stance Tag beside their name, as the
   * `posture` in the TCI row, and at length in the paragraph under it. Four statements
   * of one fact inside one scroll.
   *
   * It now lives in `stanceNote`, printed once per partner in "How to approach them"
   * (app/trade/finder/page.jsx), which is the card whose subject actually IS the
   * partner. Nothing was lost; one thing stopped being said four times.
   */
  const shedding = pkg.give
    .map((p) => p.asset.position)
    .filter((pos) => pos != null && you.strongPositions.includes(pos));
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
  if (partner.reluctant)
    pushback.push(`They rarely trade at all, so expect a slow answer or none.`);
  return {
    yourCase: dedupe(yourCase),
    theirCase: dedupe(theirCase),
    pushback: dedupe(pushback),
  };
}
/**
 * The one sentence about how this partner's stance prices assets - said ONCE per
 * partner, where the four canned per-package versions used to be said once per package.
 * A pure function of the appetite so the page never re-derives the mapping.
 * @param {Appetite} partner
 * @returns {string}
 */
export function stanceNoteFor(partner) {
  if (partner.wantsNow)
    return `They read as win-now, so production in a player's prime is worth a premium to them.`;
  if (partner.wantsFuture)
    return `They read as rebuilding, so youth and picks are worth more to them than to you.`;
  if (partner.stance === "ascend")
    return `They are ahead of schedule, so they want talent without spending their picks.`;
  return `They are stuck mid-pack, which is the position that most needs a direction.`;
}
// ------------------------------------------------------------------- entrypoint
function toTradeInput(pkg) {
  const side = (list) => ({
    playerIds: list
      .filter((p) => p.asset.kind === "player")
      .map((p) => p.asset.id),
    picks: list.map((p) => p.asset.pick).filter((pk) => pk != null),
  });
  return { give: side(pkg.give), get: side(pkg.get) };
}
/**
 * THE LINK THAT WAS BUILT, TESTED, AND NEVER CALLED.
 *
 * `tradeHref` (lib/trade/url.js) has existed with a test suite and zero production
 * callers: every suggested package pointed at a bare `/trade`, so "adjust this by hand"
 * meant re-picking six assets from scratch, and the module that solved exactly that
 * problem sat one import away. The id formats already agreed - `assetsOf` builds pick
 * ids as `<season>-<round>-<originalRoster>` and /trade's own pick pool builds them the
 * same way - so this is a wiring fix rather than a feature.
 *
 * @param {TradeAsset[]} give
 * @param {TradeAsset[]} get
 * @returns {string} a `/trade?...` link that opens this exact package, pre-filled
 */
export function packageBuilderHref(give, get) {
  const ids = (list, kind) =>
    list.filter((a) => a.kind === kind).map((a) => String(a.id));
  return tradeHref({
    give: ids(give, "player"),
    get: ids(get, "player"),
    givePicks: ids(give, "pick"),
    getPicks: ids(get, "pick"),
  });
}
/**
 * THE ROOM BANDS - three coarse bands over the `mutual` values actually on one board.
 *
 * `mutual` is not a value. It is the smaller of two FIT GAINS, each of which is a sum of
 * league values scaled by a clamped appetite multiplier (`FIT_CLAMP`), so its units are
 * "value, after two hypothetical parties' preferences were applied twice." Printing it
 * through `fmtValue` - the formatter for real value-in-model-units figures - invited
 * exactly the reading it cannot support: that 1,400 of room is worth 1,400 of anything.
 *
 * Terciles OF THIS BOARD rather than fixed cutoffs, because the quantity has no
 * absolute scale to cut. That makes every band honestly relative - "wide for this
 * league, today" - which is the only claim available.
 *
 * Null below three positive values: two rosters cannot be split into three bands, and a
 * band computed from one number would be a label pretending to be a comparison.
 *
 * @param {number[]} values every `mutual` on the board, zeros included
 * @returns {{ lo: number, hi: number, n: number }|null}
 */
export function roomBands(values) {
  const live = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (live.length < 3) return null;
  const at = (f) => live[Math.min(live.length - 1, Math.floor(f * live.length))];
  return { lo: at(1 / 3), hi: at(2 / 3), n: live.length };
}
/**
 * One value's band. Null for no room at all, so a caller cannot print "narrow" over a
 * board row that has nothing on it.
 * @param {number} mutual
 * @param {{ lo: number, hi: number }|null} bands
 * @returns {"narrow"|"real"|"wide"|null}
 */
export function roomBand(mutual, bands) {
  if (!(mutual > 0) || !bands) return null;
  if (mutual < bands.lo) return "narrow";
  if (mutual < bands.hi) return "real";
  return "wide";
}
/**
 * One of the viewer's own assets by id, for the `move=` entry point: the finder has to
 * be able to name the asset a URL param is forcing before it knows whether any package
 * includes it. Deliberately a single-roster read (`analyzeRoster`) rather than a league
 * ranking pass - it answers "do you own this, and what is it called".
 *
 * @param {LeagueHistory} h
 * @param {number} rosterId
 * @param {string|null|undefined} assetId
 * @returns {TradeAsset|null}
 */
export function viewerAsset(h, rosterId, assetId) {
  if (!assetId) return null;
  const a = analyzeRoster(h, rosterId);
  if (!a) return null;
  return (
    assetsOf(a).find((asset) => String(asset.id) === String(assetId)) ?? null
  );
}
/**
 * The league's value windows, keyed by roster, plus the viewer's own.
 *
 * A thin wrapper so `findTrades` and `partnerBoard` cannot drift into two different
 * ways of asking the same question - the failure this codebase keeps catching itself
 * on, and the reason `stanceOf` is pinned against /plan's `diagnose` in the suite.
 */
function windowsFor(h, rosterId) {
  const byRoster = new Map(leagueWindows(h).rows.map((r) => [r.rosterId, r]));
  // Keyed off the roster the CALLER is acting for, not off `h.me`. The finder is
  // reachable while viewing the app as another manager, and "your window" has to mean
  // the roster the packages are being built for.
  return { me: byRoster.get(rosterId) ?? null, byRoster };
}
function board(h) {
  const ranking = leagueValueRanking(h);
  const rankOf = new Map(ranking.map((r, i) => [r.rosterId, i + 1]));
  // Postures off the same memoized league pass /league and /plan read, so a partner's
  // stance here is derived from the timeline the rest of the app prints for them and
  // not from a second reading of the same question.
  const postureOf = new Map(
    cachedLeagueTimelines(h).map((t) => [t.rosterId, t.posture]),
  );
  return { ranking, rankOf, teams: ranking.length, postureOf };
}
/**
 * The viewer's own appetite is read from their ROSTER, never from their dossier. What
 * their habits say about them is the subject of /managers and the strategy engine; the
 * question here is what this roster needs, and a manager's tendency to overpay for age
 * is not a reason to recommend that they do it again.
 */
function appetiteOf(b, rosterId, opts = {}) {
  const a = b.ranking.find((r) => r.rosterId === rosterId);
  if (!a) return null;
  return appetiteFor(a, b.rankOf.get(rosterId) ?? 0, b.teams, {
    ...opts,
    posture: b.postureOf.get(rosterId) ?? null,
  });
}
/**
 * @param {LeagueHistory} h
 * @param {unknown} principals
 * @param {{ rosterId: number, partnerRosterId: number, max?: number, customOrder?: string[], move?: string|null }} opts
 */
export function findTrades(h, principals, opts) {
  const { rosterId, partnerRosterId } = opts;
  if (rosterId === partnerRosterId) return null;
  const b = board(h);
  const dossier = buildDossier(h, partnerRosterId, principals);
  const you = appetiteOf(b, rosterId, { viewer: true });
  const partner = appetiteOf(b, partnerRosterId, { dossier });
  if (!you || !partner) return null;
  const mineA = b.ranking.find((r) => r.rosterId === rosterId);
  const theirsA = b.ranking.find((r) => r.rosterId === partnerRosterId);
  const mine = price(assetsOf(mineA), you, partner);
  const theirs = price(assetsOf(theirsA), partner, you);
  // The forced asset, resolved against the viewer's own priced pool rather than trusted
  // from the URL: a `move=` param naming something this roster does not own has to read
  // as "not yours" rather than silently searching without the constraint.
  const moveRequested = opts.move != null && opts.move !== "";
  const forced = moveRequested
    ? (mine.find((p) => String(p.asset.id) === String(opts.move))?.asset ?? null)
    : null;
  // An unowned id searches for NOTHING rather than falling back to an unconstrained
  // search: a board that quietly ignored the constraint would print packages under a
  // chip claiming every one of them includes an asset none of them do.
  const raw =
    moveRequested && !forced
      ? []
      : searchPackages(mine, theirs, you, partner, opts.max ?? 3, {
          forceGiveId: forced ? forced.id : null,
        });
  // Built once for the whole result rather than per package: the index is a scan of
  // the viewer's ranking, and three packages asking for it separately would pay for
  // the same scan three times.
  const conviction = convictionIndex(opts.customOrder ?? [], h.players);
  // Same reasoning as the conviction index above: the replacement line is a scan of the
  // whole league, and it is identical for every package, so it is computed once here
  // rather than three times inside the loop.
  const replacementValue = leagueReplacementValue(h);
  // The league's position pools, for the Leverage delta below. `b.ranking` is handed
  // in rather than recomputed - `leaguePositionPools` would otherwise re-run the exact
  // same `leagueValueRanking` pass `board(h)` already paid for two lines above this
  // one. `mineA` is the viewer's own row from that SAME ranking, so "before" reads the
  // identical roster the pools already account for.
  const leveragePools = leaguePositionPools(h, b.ranking);
  // One walk for the pair's timing. The same derivation /league's window map draws and
  // /plan's synthesis counts, so a package cannot claim a partner peaks opposite you
  // while the map shows them sitting in your seasons.
  const wins = windowsFor(h, rosterId);
  const thesis =
    wins.me && wins.byRoster.get(partnerRosterId)
      ? windowThesis(wins.me, wins.byRoster.get(partnerRosterId))
      : null;
  // The viewer's own timeline, off the memoized league pass `board(h)` already paid for,
  // so the post-trade read below starts from the identical profile /league and /plan
  // print for this roster rather than a second reading of it.
  const myTimeline =
    cachedLeagueTimelines(h).find((t) => t.rosterId === rosterId) ?? null;
  const packages = raw.map((pkg, i) => {
    const give = pkg.give.map((p) => p.asset);
    const get = pkg.get.map((p) => p.asset);
    const cases = buildCases(pkg, you, partner);
    return {
      id: `p${i + 1}`,
      give,
      get,
      // The real link into the hand builder, pre-filled with these exact assets.
      builderHref: packageBuilderHref(give, get),
      // Before/after TCI, the window either side, and whether this package moves the
      // asset the roster's own timeline already names as its odd one out.
      postTrade: myTimeline
        ? postTradeTimeline(h, rosterId, give, get, { before: myTimeline })
        : null,
      // The single source of truth for what this trade is worth.
      evaluation: evaluateTrade(h, toTradeInput(pkg)),
      headline: `${listOf(give)} for ${listOf(get)}`,
      ...cases,
      fit: { yours: pkg.yourGain, theirs: pkg.theirGain, mutual: pkg.mutual },
      conviction: convictionNotes({ give, get }, conviction),
      fragility: packageFragilityNote(h, rosterId, give, get, {
        replacementValue,
      }),
      leverageShift: packageLeverageShift(leveragePools, mineA, give, get),
      windowThesis: thesis,
      score: pkg.score,
    };
  });
  const caveats = [];
  /*
   * A STATED REFUSAL, NOT AN EMPTY LIST (D19).
   *
   * The forced case gets its own sentence because it is a different fact: "nothing works
   * with this partner" and "nothing works with this partner THAT INCLUDES THIS ASSET" are
   * separate answers, and the second one is the answer to the question the user actually
   * asked by arriving here with `move=` set. An empty list under a chip saying "only
   * packages that include X" reads as a bug; a sentence naming both the partner and the
   * asset reads as the finding it is.
   */
  if (!packages.length && moveRequested)
    caveats.push(
      forced
        ? `Nothing clears the bar with ${partner.name} that includes ${forced.label}. That is a real answer: they would have to want ${forced.label} enough to pay for him, and on this reading they do not. Try another partner rather than a worse package.`
        : `That asset is not on your roster, so no package can include it. Nothing here was filtered - there was nothing to filter.`,
    );
  else if (!packages.length)
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
  return {
    you,
    partner,
    dossier,
    packages,
    caveats,
    // Said once per partner, where four canned copies used to be said once per package.
    stanceNote: stanceNoteFor(partner),
    /*
     * THE TWO PRICED LISTS THE SEARCH ALREADY BUILT AND USED TO THROW AWAY.
     *
     * `mine` and `theirs` are every asset on both rosters, priced through BOTH sides'
     * appetites and sorted by `gap` - how much more the other side would pay for it than
     * its owner would. The search took `.slice(0, 10)` and `.slice(0, 6)` off the front
     * of them and returned neither, so the most directly useful output of the whole pass
     * ("here is what they want from you, in order") was computed on every request and
     * discarded on every request.
     *
     * RANKING THESE IS HONEST, where ranking the packages was not. A package ranking is a
     * verdict on a whole hypothetical deal, which is what D6 refuses. A gap is a
     * subtraction of two numbers this app already publishes, per asset, with the reasons
     * for both attached - it says nothing about whether to trade the thing.
     */
    mine,
    theirs,
    // What the `move=` param resolved to, so a surface can name it in a chip and can
    // tell "you do not own that" apart from "no package includes it".
    move: moveRequested ? { requested: String(opts.move), asset: forced } : null,
  };
}
/**
 * Who to call, ranked by how much mutual room actually exists. Deliberately skips
 * `evaluateTrade` - this is a prefilter over every leaguemate, and the authoritative
 * pricing happens once you pick one.
 */
/**
 * @param {LeagueHistory} h
 * @param {unknown} principals
 * @param {number} rosterId
 * @param {{ move?: string|null }} [opts] `move` forces every partner's best idea to
 *   include one of the viewer's own assets - see `searchPackages`. A partner for whom
 *   no such package exists comes back with `mutual: 0`, which is the honest answer to
 *   the constrained question rather than the unconstrained one.
 */
export function partnerBoard(h, principals, rosterId, opts = {}) {
  const b = board(h);
  const you = appetiteOf(b, rosterId, { viewer: true });
  if (!you) return [];
  const myAssets = assetsOf(b.ranking.find((r) => r.rosterId === rosterId));
  const moveRequested = opts.move != null && opts.move !== "";
  const owned = moveRequested
    ? myAssets.some((a) => String(a.id) === String(opts.move))
    : false;
  const wins = windowsFor(h, rosterId);
  const rows = [];
  for (const a of b.ranking) {
    if (a.rosterId === rosterId) continue;
    const dossier = buildDossier(h, a.rosterId, principals);
    const partner = appetiteFor(a, b.rankOf.get(a.rosterId) ?? 0, b.teams, {
      dossier,
      posture: b.postureOf.get(a.rosterId) ?? null,
    });
    const mine = price(myAssets, you, partner);
    const theirs = price(assetsOf(a), partner, you);
    const best =
      moveRequested && !owned
        ? null
        : (searchPackages(mine, theirs, you, partner, 1, {
            forceGiveId: moveRequested ? String(opts.move) : null,
          })[0] ?? null);
    const theirWindow = wins.byRoster.get(a.rosterId) ?? null;
    rows.push({
      rosterId: a.rosterId,
      name: partner.name,
      stance: partner.stance,
      tags: dossier.tags.slice(0, 3),
      mutual: best?.mutual ?? 0,
      bestIdea: best
        ? `${listOf(best.give.map((p) => p.asset))} for ${listOf(best.get.map((p) => p.asset))}`
        : null,
      trades: dossier.profile.trades,
      reluctant: partner.reluctant,
      // A roster with no window ROW at all - not in the map, which the board's own
      // arithmetic should make impossible - still names a code rather than printing a
      // dash. A dash in this column is indistinguishable from every other "no value
      // here" dash on the card; see lib/refusal.js on why a refusal that renders as an
      // absence gets read as a zero.
      valueWindow: theirWindow
        ? windowShort(theirWindow)
        : REFUSAL_CODES.NO_RECORD.code,
      // Null rather than false when either side has no single window: "they do not
      // share your window" and "nobody can say when they win" are different facts and
      // the surface has to be able to tell them apart.
      sharesYourWindow:
        wins.me?.state === "window" && theirWindow?.state === "window"
          ? theirWindow.open <= wins.me.close &&
            wins.me.open <= theirWindow.close
          : null,
    });
  }
  return rows.sort((x, y) => y.mutual - x.mutual);
}
