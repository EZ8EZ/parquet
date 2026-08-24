/**
 * ONE PLACE THAT KNOWS WHAT A ROSTER LOOKS LIKE AFTER A PACKAGE.
 *
 * Three separate partial reconstructions of the post-trade roster had grown up
 * independently, each one shaped to the single metric that needed it and none of them
 * aware of the others:
 *
 *   1. `rosterAfter(current, give, get)` in fragility.js - the STARTABLE PLAYER IDS,
 *      players only, picks dropped, used to re-solve the single point of failure.
 *   2. `applyPackageToByPosition` in leverage.js - the VALUE-BY-POSITION mix, positions
 *      only, `valued: []` passed alongside it because the caller had no asset list to
 *      put there and no reader for one.
 *   3. Nothing at all for the timeline, which is why `coherenceOf`, `windowOf` and
 *      `findTimelineBreak` - three already-tested pure functions that take exactly
 *      "a bag of dated assets" - had never once been run over a proposed trade.
 *
 * They now share this module and one partition of the package (`packageParts`), so a
 * fourth metric wanting a post-trade read has somewhere to ask rather than a fourth
 * private helper to write. The three projections stay SEPARATE FUNCTIONS on purpose:
 * they are honestly different sets. Fragility's base is the STARTABLE subset (picks
 * cannot fill a lineup slot tonight); the timeline's base is EVERY priced asset (a
 * pick is the longest-dated thing a roster owns and dropping it would be the whole
 * question begged). Collapsing them into one list would have quietly changed both
 * numbers to make one signature look tidier.
 *
 * WHAT NONE OF THEM DO is claim the trade happened. Every function here is a
 * hypothetical, and every caller prints it as one.
 */
import { POS_ORDER } from "../roster.js";
import { VALUATION_CONFIG } from "../valuation/index.js";
import {
  COHERENCE_FLOOR,
  coherenceOf,
  findTimelineBreak,
  getTimelineProfile,
  pickDuration,
  playerDuration,
} from "../metrics/duration.js";
import { windowOf } from "../metrics/window.js";
/**
 * @typedef {import('../history.js').LeagueHistory} LeagueHistory
 * @typedef {import('../trade/index.js').TradeAsset} TradeAsset
 * @typedef {import('../valuation/config.js').ValuationConfig} ValuationConfig
 */
/**
 * One dated asset, the shape `coherenceOf`/`findTimelineBreak`/`windowOf` all read.
 * @typedef {Object} DatedAsset
 * @property {string} id
 * @property {string|null} label
 * @property {"player"|"pick"|null} kind
 * @property {number} value
 * @property {number} duration seasons out, Macaulay-style
 * @property {"kept"|"leaving"|"arriving"} [role] only set by `rosterAfter`
 */
/** A package's two sides, as id sets plus the raw lists. Computed once per read. */
/**
 * @param {Pick<TradeAsset, 'kind'|'id'>[]} give
 * @param {Pick<TradeAsset, 'kind'|'id'>[]} get
 */
export function packageParts(give, get) {
  return {
    give,
    get,
    outIds: new Set(give.map((a) => String(a.id))),
    inIds: new Set(get.map((a) => String(a.id))),
  };
}
/**
 * Projection 1 - the player ids the viewer would be able to start after this package.
 *
 * Was `rosterAfter` in fragility.js; renamed because it is one of three post-trade
 * reads rather than the post-trade read, and the unqualified name now belongs to the
 * asset-list one below. Picks cannot fill a lineup slot tonight, so they are not
 * startable depth and are excluded here for exactly the reason the index excludes them
 * everywhere else.
 */
/**
 * @param {string[]} current
 * @param {Pick<TradeAsset, 'kind'|'id'>[]} give
 * @param {Pick<TradeAsset, 'kind'|'id'>[]} get
 * @returns {string[]}
 */
export function startableAfter(current, give, get) {
  const out = new Set(current);
  for (const a of give) if (a.kind === "player") out.delete(a.id);
  for (const a of get) if (a.kind === "player") out.add(a.id);
  return [...out];
}
/**
 * Projection 2 - the viewer's own `byPosition` mix, adjusted for one package.
 *
 * Was `applyPackageToByPosition` in leverage.js, unchanged in behaviour. Picks and
 * position-less assets touch neither side, matching how the Positional Leverage index
 * itself excludes both (D68's own "what this deliberately does not measure"). Floored
 * at 0 defensively; a package this finder proposes never sends more value at a position
 * than the viewer's own roster holds there, but a synthetic or malformed package should
 * read as "nothing left" rather than a negative position value.
 */
/**
 * @param {{ pos: string, value: number }[]} byPosition
 * @param {Pick<TradeAsset, 'kind'|'position'|'value'>[]} give
 * @param {Pick<TradeAsset, 'kind'|'position'|'value'>[]} get
 * @returns {{ byPosition: { pos: string, value: number }[], touched: Set<string> }}
 */
export function byPositionAfter(byPosition, give, get) {
  /** @type {Map<string, number>} */
  const map = new Map(POS_ORDER.map((p) => [p, 0]));
  for (const row of byPosition) if (map.has(row.pos)) map.set(row.pos, row.value);
  const touched = new Set();
  for (const a of give) {
    if (a.kind === "player" && a.position && map.has(a.position)) {
      touched.add(a.position);
      map.set(a.position, map.get(a.position) - a.value);
    }
  }
  for (const a of get) {
    if (a.kind === "player" && a.position && map.has(a.position)) {
      touched.add(a.position);
      map.set(a.position, map.get(a.position) + a.value);
    }
  }
  return {
    byPosition: POS_ORDER.map((pos) => ({
      pos,
      value: Math.max(0, map.get(pos) ?? 0),
    })),
    touched,
  };
}
/**
 * An incoming asset's duration, on the SAME two formulas `getTimelineProfile` uses for
 * the roster it is joining - `playerDuration` off the age, `pickDuration` off how many
 * seasons out the pick converts. Never a third estimate: an arriving asset priced on
 * its own curve would make the before/after comparison meaningless.
 *
 * @param {TradeAsset & { pick?: { season: string } }} a
 * @param {number} currentSeasonYear
 * @param {ValuationConfig} cfg
 * @returns {number|null} null when the asset carries nothing to date it by
 */
function durationOfIncoming(a, currentSeasonYear, cfg) {
  if (a.kind === "pick") {
    const season = a.pick?.season ?? String(a.id).split("-")[0];
    const seasonsOut = parseInt(season, 10) - currentSeasonYear;
    return Number.isFinite(seasonsOut) ? pickDuration(seasonsOut, cfg) : null;
  }
  return playerDuration(a.age, cfg);
}
/**
 * Projection 3 - THE SYNTHETIC POST-TRADE ASSET LIST, dated the same way the real one
 * is, so every pure function that reads a roster's timeline can read a proposed one.
 *
 * Departing assets are KEPT IN THE LIST with `role: "leaving"` rather than dropped,
 * because the strip that draws this has to show where they were in order for the reader
 * to see what left. Callers doing arithmetic filter them out; `coherenceAfter` below is
 * the one that does.
 *
 * @param {LeagueHistory} h
 * @param {number} rosterId
 * @param {TradeAsset[]} give
 * @param {TradeAsset[]} get
 * @param {{ before?: { assets: DatedAsset[] }, cfg?: ValuationConfig }} [opts]
 * @returns {DatedAsset[]}
 */
export function rosterAfter(h, rosterId, give, get, opts = {}) {
  const cfg = opts.cfg ?? VALUATION_CONFIG;
  const before = opts.before ?? getTimelineProfile(h, rosterId, { cfg });
  const { outIds } = packageParts(give, get);
  const out = before.assets.map((a) => ({
    ...a,
    role: outIds.has(String(a.id)) ? "leaving" : "kept",
  }));
  for (const a of get) {
    if (a.value <= 0) continue;
    const duration = durationOfIncoming(a, h.currentSeasonYear, cfg);
    if (duration == null) continue;
    out.push({
      id: String(a.id),
      label: a.label,
      kind: a.kind,
      value: a.value,
      duration,
      role: "arriving",
    });
  }
  return out;
}
/** The assets that would actually be on the roster - everything but the departures. */
const held = (assets) => assets.filter((a) => a.role !== "leaving");
/**
 * A window read over a HYPOTHETICAL asset list.
 *
 * `windowOf` takes posture rather than deriving it, because posture is relative to the
 * league's own duration distribution (lib/metrics/duration.js) and a hypothetical
 * roster has no place in that distribution. So the after-window inherits TODAY's
 * posture, with one correction that can be made honestly without league context: the
 * `tci < COHERENCE_FLOOR` test is ABSOLUTE, reads only the roster's own assets, and is
 * the single condition `classify` uses to call a roster straddling - which is also the
 * only posture `windowOf` refuses on. So a package that drops the viewer below the
 * floor is re-read as straddling and its window refuses, exactly as the real page would
 * read it afterwards.
 *
 * The error this leaves is one-directional and deliberate: a package that lifts a
 * straddling roster back over the floor still inherits "straddling" and still refuses,
 * because whether it would then read contending, ascending or rebuilding depends on the
 * other thirteen rosters. It under-claims and never over-claims (D19).
 */
/**
 * The subset of a timeline break's named assets (one, or a correlated pair since D113)
 * that a given id set actually touches - null when it touches none of them.
 *
 * Deliberately a SUBSET, not an all-or-nothing match: a two-asset break names both
 * because together they explain more of the roster's incoherence than either alone, but
 * a real trade can still send (or bring) only one of the two. Requiring both to be
 * touched before saying anything would silently drop the finding for exactly the
 * packages a manager is most likely to actually offer - one piece of a pair at a time -
 * and reporting the untouched second name as if it moved too would be a claim this
 * function has no basis for. `delta` is deliberately NOT carried onto the result: it is
 * the improvement from removing every named asset TOGETHER, and printing it beside a
 * partial touch would attribute a two-asset finding's number to one asset's move.
 */
function breakOverlap(timelineBreak, idSet) {
  if (!timelineBreak?.assets?.length) return null;
  const touched = timelineBreak.assets.filter((a) => idSet.has(String(a.id)));
  return touched.length ? { assets: touched } : null;
}
function windowFrom(profile, assets, currentSeasonYear, tci) {
  return windowOf(
    {
      ...profile,
      tci,
      posture: tci < COHERENCE_FLOOR ? "straddling" : profile.posture,
    },
    assets,
    currentSeasonYear,
    true,
  );
}
/**
 * THE POST-TRADE TIMELINE READ - the whole point of this module.
 *
 * Runs the three pure functions that already existed over the synthetic roster above:
 * `coherenceOf` for the TCI either side of the deal, `findTimelineBreak` for the one or
 * two assets each version of the roster is least able to explain, and `windowOf` for
 * the seasons the value is heaviest in.
 *
 * THE TWO FINDINGS IT EXISTS FOR, and both are readings rather than recommendations:
 *
 *   `departingBreak` - the package sends some or all of the assets this roster's OWN
 *   timeline already names as its odd one out (one asset, or a correlated pair since
 *   D113). That is a thesis about what the deal is, not a claim that it fixes anything.
 *   `findTimelineBreak`'s own docstring is explicit that a named asset is very often
 *   the roster's best player and that holding one on purpose is a real strategy; copy
 *   built on this field must not contradict it.
 *
 *   `arrivingBreak` - the mirror: the package IMPORTS some or all of the assets the
 *   post-trade roster cannot explain. Same neutral register, same absence of a verdict.
 *   A deal can be worth making and still do this.
 *
 * Neither requires the WHOLE named break to move. A trade can send one half of a named
 * pair and keep the other - `breakOverlap` above reports exactly the assets this
 * package actually touches, never the untouched other name, so a package that sends
 * only one of two correlated assets is not credited with clearing both.
 *
 * @param {LeagueHistory} h
 * @param {number} rosterId
 * @param {TradeAsset[]} give
 * @param {TradeAsset[]} get
 * @param {{ before?: object, cfg?: ValuationConfig }} [opts]
 */
export function postTradeTimeline(h, rosterId, give, get, opts = {}) {
  const cfg = opts.cfg ?? VALUATION_CONFIG;
  const before = opts.before ?? getTimelineProfile(h, rosterId, { cfg });
  if (!before || before.totalValue === 0) return null;
  const assets = rosterAfter(h, rosterId, give, get, { ...opts, before, cfg });
  const afterAssets = held(assets);
  const after = coherenceOf(afterAssets);
  if (after.totalValue === 0) return null;
  const { outIds, inIds } = packageParts(give, get);
  const afterBreak = findTimelineBreak(afterAssets, after.tci);
  const departingBreak = breakOverlap(before.timelineBreak, outIds);
  const arrivingBreak = breakOverlap(afterBreak, inIds);
  /*
   * "AGAINST A CORE AT 4.7" - the rest of the roster's own weighted duration, with the
   * touched break asset(s) taken out. Not `rosterDuration`, which INCLUDES the outlier
   * and is therefore dragged toward it: quoting that as the core would be comparing the
   * asset against a mean it is itself moving.
   */
  const coreWithout = (list, breakLike) =>
    breakLike
      ? coherenceOf(
          list.filter(
            (a) => !breakLike.assets.some((b) => String(b.id) === String(a.id)),
          ),
        ).rosterDuration
      : null;
  return {
    before: {
      tci: before.tci,
      rosterDuration: before.rosterDuration,
      dispersion: before.dispersion,
      window: windowFrom(before, before.assets, h.currentSeasonYear, before.tci),
    },
    after: {
      tci: after.tci,
      rosterDuration: after.rosterDuration,
      dispersion: after.dispersion,
      window: windowFrom(before, afterAssets, h.currentSeasonYear, after.tci),
    },
    // Every asset, departures included and tagged, for the strip to draw.
    assets,
    departingBreak,
    arrivingBreak,
    coreDurationWithoutDeparting: coreWithout(before.assets, departingBreak),
    coreDurationWithoutArriving: coreWithout(afterAssets, arrivingBreak),
  };
}
