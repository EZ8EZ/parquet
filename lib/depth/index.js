/**
 * ONE NBA TEAM'S DEPTH CHART, derived from Sleeper's own two fields.
 *
 * WHAT THIS IS. `/players/nba` carries `depth_chart_position` ("PG") and
 * `depth_chart_order` (1) on every player Sleeper's own app shows a depth chart for.
 * Measured on the live payload (2026-08-20): 593 players are on an NBA team, 474 of
 * them carry BOTH fields, 119 carry NEITHER, and zero carry one without the other.
 * That is the entire raw material, and this module's whole job is to turn it into a
 * team's chart without adding anything that was not in it.
 *
 * WHAT IT REFUSES TO DO, and this is the important half. Sleeper's orders are not
 * ranks, and treating them as ranks is the one way this feature could lie. On the same
 * live payload, across the 149 (team, position) groups that exist:
 *
 *   - 117 groups are NON-CONTIGUOUS. LAL's centres come back 1, 2, 5. GSW's power
 *     forwards come back 1, 5, 6, 7, 8. The integer is not a position in a list.
 *   - 44 groups contain a DUPLICATE order. LAC lists two small forwards at 1. BOS
 *     lists two power forwards at 1. MEM lists five centres as 1, 2, 2, 5, 5, and
 *     CHA lists three power forwards all at 2.
 *   - 18 groups have NO order 1 AT ALL. MEM's power forwards come back 2, 2, 3.
 *
 * (2026-08-19 measured 116 and 43. The third figure has not moved; the first two drift
 * by a group or two as the provider edits, which is itself the argument against a
 * surface that only works on the shape it happened to be built against.)
 *
 * So: this module SORTS by the order and never INDEXES by it. It publishes who is
 * ahead of a player, who is level with him and who is behind him - three facts a sort
 * can support - and it never computes "3rd string", "the backup", or an ordinal of any
 * kind, because on 44 groups an ordinal would be a coin flip presented as a datum and
 * on 117 more it would be arithmetic on a number that was never a count. D19's rule
 * (refuse the inference, publish the gap) is the same rule here, one layer down.
 *
 * THE PARTIAL ORDER IS A FIELD, NOT AN INSTRUCTION TO THE SURFACE. This module used to
 * publish the sorted list and a `hasTies` flag and leave the drawing to the page, which
 * drew rows - and a row is an ordinal whatever the flag beside it says. `DepthGroup.layers`
 * is the fix: one array per distinct stated order, so the shape the surface receives
 * cannot express "kth" at all. See the note above `layersOf`.
 *
 * It also refuses the bigger inference, the tempting one: nothing in this file, and
 * nothing on the surface that reads it, says what a depth-chart slot means for a
 * player's minutes, role or value. "Sleeper lists two players ahead of him at PG" is a
 * fact about a data feed. "Therefore he is a bad asset" is a claim about basketball
 * that a feed cannot support, and D6 (theses, never grades) is why this app does not
 * make it.
 *
 * THE CHART POSITION IS THE TRUTH, not the listed position. 120 of the 474 charted
 * players - a quarter of them - are charted somewhere other than their `position`
 * field: Bronny James is listed SG and charted at PG, Anthony Davis is listed C and
 * charted at PF, Jrue Holiday is listed PG and charted at SG. For a depth chart the
 * chart's own position is the answer, so grouping is by `depthChartPosition` and the
 * listed position is carried alongside as a fact worth showing, never as an override.
 */
/** @typedef {import('../providers/types.js').Player} Player */
import { refusal } from "../refusal.js";
import { depthChartHref } from "./url.js";
/**
 * The five positions Sleeper's NBA chart actually uses (verified: the live payload's
 * `depth_chart_position` values are exactly these). Non-standard codes are still
 * rendered - see `depthChartFor` - they just sort after these five.
 */
export const CHART_POSITIONS = ["PG", "SG", "SF", "PF", "C"];
/**
 * @typedef {Object} DepthEntry
 * @property {string} playerId
 * @property {string} name
 * @property {string} chartPosition where Sleeper's chart places him
 * @property {number|null} order Sleeper's raw `depth_chart_order`. Sortable, NOT a rank
 * @property {string|null} listedPosition his `position` field
 * @property {boolean} offPosition true when the chart places him away from his listed position
 * @property {string|null} injuryStatus
 * @property {number|null} age
 * @property {number|null} searchRank
 * @property {number|null} newsUpdated ms epoch, the age of the RECORD (see Player)
 */
/**
 * @typedef {Object} DepthGroup
 * @property {string} position
 * @property {boolean} standard one of the five, rather than a code we did not expect
 * @property {DepthEntry[]} entries every player in the group, sorted by `order`, unordered last
 * @property {DepthEntry[][]} layers ONE ARRAY PER DISTINCT STATED ORDER, ascending. See below
 * @property {DepthEntry[]} unordered same position, no order stated. A SIBLING of `layers`, never its last element
 */
/**
 * WHY `layers` IS THE FIELD THE SURFACE DRAWS, AND `entries` IS NOT.
 *
 * `entries` is a flat list in sorted order, which is the correct shape for counting a
 * group and for finding one player in it, and the wrong shape for drawing it. Anything
 * that renders a flat list renders a LADDER OF ROWS, and a ladder of rows makes three
 * claims this data cannot support: that row 1 is first, that row k is kth, and that two
 * players printed one above the other stand in some relation to each other. On the live
 * payload all three are false somewhere - 44 of 149 groups put two or more players on
 * one order, and 18 groups have no order 1 at all, so their top row is nobody's first.
 *
 * `layers` is the partial order the source actually published. One array per DISTINCT
 * stated order, ascending; players sharing an order share an array, and are therefore
 * drawn on one rung with nothing between them. `layers.length < entries.length` is
 * exactly the tie case, which is why `hasTies` is gone as a field: it was a second name
 * for a fact the geometry now carries, and a boolean that has to agree with a shape is a
 * boolean that can disagree with it.
 *
 * THE RUNGS ARE EVENLY SPACED AND THE INTEGERS ARE NEVER DRAWN. Orders 1, 2, 5 produce
 * three rungs, not five slots with two empty. The integer is a sort key and not a count
 * (117 of 149 groups are non-contiguous), so spacing rungs proportionally to it would
 * invent a precision the feed does not have and draw two empty rungs that no player is
 * missing from.
 *
 * `unordered` is a SIBLING rather than the tail of `layers` for the same reason. A player
 * the chart places at a position but gives no order to is not behind the lowest rung; he
 * is off the axis entirely, incomparable to everyone on it. Appending him made the
 * geometry say "last", which is the one word this feature exists to refuse. NOTE that on
 * the live payload this array is always empty - see `PROVIDER_PAIRS_POSITION_AND_ORDER`.
 */
/**
 * @typedef {Object} DepthChart
 * @property {string} team
 * @property {DepthGroup[]} groups
 * @property {DepthEntry[]} unplaced on-team players Sleeper's chart does not place at all
 * @property {number} chartedCount
 * @property {number} rosterCount every player the payload puts on this team
 * @property {number|null} newestRecord ms epoch, freshest `newsUpdated` among charted players
 * @property {number|null} oldestRecord ms epoch, stalest of the same
 */
/**
 * @param {Iterable<Player>|Map<string, Player>} players
 * @returns {Player[]}
 */
function toList(players) {
  if (players instanceof Map) return [...players.values()];
  return players ? [...players] : [];
}
/** @param {string|null|undefined} t */
export function normalizeTeam(t) {
  return t ? String(t).trim().toUpperCase() : "";
}
/** @param {string|null|undefined} p */
function normalizePosition(p) {
  const s = p ? String(p).trim().toUpperCase() : "";
  return s || null;
}
/**
 * ONE RECORD PER PLAYER, and the freshest one wins.
 *
 * A player is on exactly one NBA team tonight, but a list assembled from more than one
 * read - a cached corpus stitched to a newer one, a mid-season trade caught between
 * snapshots - can carry him twice, on two different teams. Left alone that renders him
 * on two charts at once, which is the one thing the source itself can never say.
 *
 * `newsUpdated` decides it, because it is a fact rather than a guess: the record
 * Sleeper touched most recently is the one describing where he plays now. When neither
 * record carries a timestamp, or they tie, the first occurrence wins - arbitrary, but
 * stable, and it still leaves him on exactly one chart.
 *
 * @param {Player[]} list
 * @returns {Map<string, Player>}
 */
function dedupeByPlayer(list) {
  /** @type {Map<string, Player>} */
  const out = new Map();
  for (const p of list) {
    if (!p || !p.playerId) continue;
    const prev = out.get(p.playerId);
    if (!prev) {
      out.set(p.playerId, p);
      continue;
    }
    const a = prev.newsUpdated ?? -Infinity;
    const b = p.newsUpdated ?? -Infinity;
    if (b > a) out.set(p.playerId, p);
  }
  return out;
}
/**
 * @param {Player} p
 * @param {string} chartPosition
 * @returns {DepthEntry}
 */
function toEntry(p, chartPosition) {
  const listed = normalizePosition(p.position);
  return {
    playerId: p.playerId,
    name: p.fullName,
    chartPosition,
    order: typeof p.depthChartOrder === "number" ? p.depthChartOrder : null,
    listedPosition: listed,
    offPosition: !!listed && !!chartPosition && listed !== chartPosition,
    injuryStatus: p.injuryStatus ?? null,
    age: p.age ?? null,
    searchRank: p.searchRank ?? null,
    newsUpdated: p.newsUpdated ?? null,
  };
}
/**
 * The order two entries appear in within a position group.
 *
 * Sleeper's order first, nulls last (a player the chart places but does not order is
 * still on the chart - he just cannot be placed against anyone).
 *
 * THE TIE-BREAK IS DELIBERATELY UNINFORMATIVE. 44 groups in the live payload contain a
 * duplicate order, so a tie-break runs often and whatever it uses will read as a
 * ranking to anyone looking at the list. Alphabetical carries no such suggestion:
 * nobody mistakes "Matisse before Ziaire" for a judgement. Consensus rank was the
 * obvious alternative and was rejected for exactly that reason - it would have quietly
 * turned "these two are level" into "the better player is listed higher", which the
 * source does not say.
 *
 * The surface no longer has to state the tie in words, because `layers` puts tied
 * entries on ONE rung side by side and the order within that rung is not a vertical
 * one - which is a stronger guarantee than a sentence under a list, since a sentence
 * can be skipped and a shared rung cannot. This sort only has to be stable.
 *
 * @param {DepthEntry} a
 * @param {DepthEntry} b
 */
function byDepth(a, b) {
  if (a.order !== b.order) {
    if (a.order == null) return 1;
    if (b.order == null) return -1;
    return a.order - b.order;
  }
  const byName = a.name.localeCompare(b.name, "en");
  return byName !== 0 ? byName : a.playerId.localeCompare(b.playerId);
}
/**
 * THE PROVIDER'S ONE INVARIANT, and the reason a whole branch below is unreachable.
 *
 * `depth_chart_position` and `depth_chart_order` arrive TOGETHER or not at all. Measured
 * on the live payload (2026-08-20): of 593 on-team players, 474 carry both fields, 119
 * carry neither, and ZERO carry one without the other - so across all 149 (team,
 * position) groups there is not one entry with a position and no order.
 *
 * That makes `DepthGroup.unordered` and `DepthStanding.unplacedInOrder` permanently empty
 * and permanently false on real data. Both are kept, and neither is a refusal site: a
 * refusal names a condition the data actually reaches, and this one is a shape the
 * provider has never emitted. They exist so that the day Sleeper does emit it, the entry
 * lands OFF the axis in a sibling array rather than on the bottom rung of a ladder, which
 * is the failure this partition was built to make impossible. The alternative - assuming
 * the invariant and reading `order` as always-a-number - would put such a player at the
 * top of every group the day it broke, since `null` sorts as less than 1.
 *
 * @type {true}
 */
export const PROVIDER_PAIRS_POSITION_AND_ORDER = true;
/**
 * The group's rungs: one array per DISTINCT stated order, ascending, players sharing an
 * order sharing an array. Entries with no order are not represented here at all - they
 * are neither a rung nor part of one, and `DepthGroup.unordered` carries them instead.
 *
 * `entries` arrives already sorted by `byDepth`, so a single pass that starts a new rung
 * whenever the order changes produces the layers in ascending order without re-sorting.
 *
 * @param {DepthEntry[]} entries sorted by `byDepth`
 * @returns {DepthEntry[][]}
 */
function layersOf(entries) {
  /** @type {DepthEntry[][]} */
  const layers = [];
  for (const e of entries) {
    if (e.order == null) continue;
    const last = layers[layers.length - 1];
    if (last && last[0].order === e.order) last.push(e);
    else layers.push([e]);
  }
  return layers;
}
/** Consensus order, for the players the chart does not place. Nulls last. */
function byConsensus(a, b) {
  const ar = a.searchRank ?? Infinity;
  const br = b.searchRank ?? Infinity;
  if (ar !== br) return ar - br;
  return a.name.localeCompare(b.name, "en");
}
/**
 * Every NBA team the payload has players on, sorted. The route validator: a team is
 * real if the data says somebody plays there, never because a lookup table knows it.
 * @param {Iterable<Player>|Map<string, Player>} players
 * @returns {string[]}
 */
export function teamsPresent(players) {
  /** @type {Set<string>} */
  const set = new Set();
  for (const p of toList(players)) {
    const t = normalizeTeam(p?.team);
    if (t) set.add(t);
  }
  return [...set].sort();
}
/**
 * One team's chart. Never throws, never returns null: an unknown team, an empty
 * league, a payload with no depth data at all each produce a well-formed chart with
 * empty groups, which is what lets the surface show an honest empty state instead of
 * branching on three kinds of nothing.
 *
 * @param {Iterable<Player>|Map<string, Player>} players every player the app knows, not just this team's
 * @param {string|null|undefined} team
 * @returns {DepthChart}
 */
export function depthChartFor(players, team) {
  const abbr = normalizeTeam(team);
  const roster =
    abbr === ""
      ? []
      : [...dedupeByPlayer(toList(players)).values()].filter(
          (p) => normalizeTeam(p.team) === abbr,
        );
  return buildChart(roster, abbr);
}
/**
 * The chart itself, over a list already filtered to one team and already deduped.
 * Split out so `depthChartsByTeam` can group the payload ONCE instead of walking all
 * 2,108 players thirty times over.
 *
 * @param {Player[]} roster
 * @param {string} abbr
 * @returns {DepthChart}
 */
function buildChart(roster, abbr) {
  /** @type {Map<string, DepthEntry[]>} */
  const byPosition = new Map();
  /** @type {DepthEntry[]} */
  const unplaced = [];
  for (const p of roster) {
    const chartPosition = normalizePosition(p.depthChartPosition);
    if (!chartPosition) {
      // No entry at all: 119 of 593 on-team players, every night. Counted and named,
      // never filled in - a guess here would be indistinguishable from data.
      unplaced.push(toEntry(p, ""));
      continue;
    }
    const bucket = byPosition.get(chartPosition);
    if (bucket) bucket.push(toEntry(p, chartPosition));
    else byPosition.set(chartPosition, [toEntry(p, chartPosition)]);
  }
  const known = CHART_POSITIONS.filter((pos) => byPosition.has(pos));
  const unknown = [...byPosition.keys()]
    .filter((pos) => !CHART_POSITIONS.includes(pos))
    .sort();
  /** @type {DepthGroup[]} */
  const groups = [...known, ...unknown].map((position) => {
    const entries = (byPosition.get(position) ?? []).slice().sort(byDepth);
    return {
      position,
      standard: CHART_POSITIONS.includes(position),
      entries,
      layers: layersOf(entries),
      unordered: entries.filter((e) => e.order == null),
    };
  });
  const charted = groups.flatMap((g) => g.entries);
  const stamps = charted
    .map((e) => e.newsUpdated)
    .filter((n) => typeof n === "number");
  return {
    team: abbr,
    groups,
    unplaced: unplaced.sort(byConsensus),
    chartedCount: charted.length,
    rosterCount: roster.length,
    newestRecord: stamps.length ? Math.max(...stamps) : null,
    oldestRecord: stamps.length ? Math.min(...stamps) : null,
  };
}
/**
 * @typedef {Object} DepthStanding
 * @property {DepthEntry} entry
 * @property {string} position where the chart places him
 * @property {DepthEntry[]} ahead stated order strictly lower than his
 * @property {DepthEntry[]} level stated order EQUAL to his - the duplicate case, named rather than broken
 * @property {DepthEntry[]} behind stated order strictly higher than his
 * @property {DepthEntry[]} unordered same position, no order stated, so neither ahead nor behind
 * @property {number} groupSize
 * @property {boolean} unplacedInOrder true when HE has no order, so nothing can be said about who is ahead
 */
/**
 * Where one player sits, as three lists and never as a number.
 *
 * `level` is the whole reason this returns lists rather than an index. Two MEM power
 * forwards are both order 2 and there is no order 1; an ordinal would have to invent a
 * winner between them, so instead the pair is reported as level and the surface draws
 * them on one rung. Same for `unplacedInOrder`: a player the chart places at a position
 * but gives no order to cannot be compared to anyone, and saying "last" would be the
 * invention - though see `PROVIDER_PAIRS_POSITION_AND_ORDER`, which is why that flag is
 * false on every player the live payload contains.
 *
 * These four lists are the whole published relation: ahead, level, behind, and
 * incomparable. There is deliberately no fifth thing to ask, and in particular no
 * "position in the group" to ask for.
 *
 * @param {DepthChart} chart
 * @param {string|null|undefined} playerId
 * @returns {DepthStanding|null} null when this chart does not place him - the honest empty state
 */
export function standingFor(chart, playerId) {
  if (!chart || !playerId) return null;
  for (const group of chart.groups) {
    const entry = group.entries.find((e) => e.playerId === playerId);
    if (!entry) continue;
    const others = group.entries.filter((e) => e.playerId !== playerId);
    const mine = entry.order;
    return {
      entry,
      position: group.position,
      ahead:
        mine == null
          ? []
          : others.filter((e) => e.order != null && e.order < mine),
      level: mine == null ? [] : others.filter((e) => e.order === mine),
      behind:
        mine == null
          ? []
          : others.filter((e) => e.order != null && e.order > mine),
      unordered: others.filter((e) => e.order == null),
      groupSize: group.entries.length,
      unplacedInOrder: mine == null,
    };
  }
  return null;
}
/**
 * The refusal for a player this chart does not place, as a code rather than a sentence.
 *
 * `standingFor` returning null is the honest empty state, but a null is not a reading:
 * the surface that met it wrote its own sentence about a gap in the source, and a null
 * survives neither an export, a count, nor a screen reader (lib/refusal.js).
 *
 * TWO DIFFERENT NOTHINGS, AND THEY USED TO BE ONE. Until this pass every non-placement
 * returned the same `SOURCE_GAP` carrying this team's counts - including for a player who
 * is not on this team at all, which produced a sentence claiming Sleeper's LAL chart
 * "does not place" a Celtic. That was wrong and it was only ever hidden by the ORDER of
 * two branches on the page: the surface tested `anchorOnTeam` first and never let the
 * refusal be seen. A distinction that survives only because a caller happens to ask in
 * the right sequence is not a distinction, so it is in the data now:
 *
 *   on this team, absent from the chart -> `SOURCE_GAP`. The provider publishes a chart
 *   for this team and has no row for him. A fact about the payload, and D6's line: it
 *   says nothing whatever about the player. Roughly one on-team player in five is here,
 *   which is why the withheld figure is the share the chart DOES place - a reader who
 *   does not know the base rate reads an absence as meaningful.
 *
 *   not on this team -> `NO_RECORD`. Nothing was computed at all, because this chart's
 *   input never contained him. It is not a gap in the source: the source knows exactly
 *   where he plays and it is somewhere else. No figure is withheld, because there is no
 *   figure about him to withhold - this team's placement rate is not a fact about him.
 *
 * `chart.unplaced` is the discriminator and needs no new field: a chart's roster is
 * exactly its charted entries plus its unplaced ones, so a player in neither was never
 * on it.
 *
 * @param {DepthChart} chart
 * @param {string|null|undefined} playerId
 * @returns {import('../refusal.js').Refusal|null} null when the chart DOES place him
 */
export function standingRefusal(chart, playerId) {
  if (standingFor(chart, playerId)) return null;
  const onTeam = chart.unplaced.some((e) => e.playerId === playerId);
  if (!onTeam) {
    return refusal(
      "NO_RECORD",
      `Sleeper does not have this player on this team, so this chart never had a record of him to read and ` +
        `nothing here was computed about him. That is not a gap in the depth data - the chart below is ` +
        `unaffected by it, and where he does play is a question for his own team's chart.`,
      null,
    );
  }
  const missing = Math.max(0, chart.rosterCount - chart.chartedCount);
  return refusal(
    "SOURCE_GAP",
    `Sleeper's chart for this team places ${chart.chartedCount} of its ${chart.rosterCount} players and he ` +
      `is one of the ${missing} it does not, so there is nothing here about where he sits. A missing entry ` +
      `is a gap in the source, not a statement about the player - roughly one on-team player in five has none.`,
    chart.rosterCount > 0
      ? {
          label: "Players the source places",
          value: `${chart.chartedCount} of ${chart.rosterCount}`,
        }
      : null,
  );
}
/**
 * The refusal for a whole TEAM the provider publishes no chart for, and for a chart that
 * exists but places nobody at the position a reader asked about.
 *
 * Both were hand-written paragraphs on the surface - one saying "Sleeper has no depth
 * chart for X right now", one implied by an empty section - and neither survived leaving
 * the screen, which is the whole argument of lib/refusal.js. Both are `SOURCE_GAP` for
 * the same reason the single-player case is: the provider publishes this surface and has
 * no entry here. The subject is a team rather than a player, and the code is a fact about
 * the payload either way.
 *
 * NO WITHHELD FIGURE, for the reason spelled out above `unplacedRefusal`: the count this
 * would have carried ("0 of 17") is printed in the page header, so calling it withheld
 * would be the register asserting something untrue. The count stays in `because`.
 *
 * @param {DepthChart} chart
 * @returns {import('../refusal.js').Refusal|null} null when the chart places anybody
 */
export function chartRefusal(chart) {
  if (!chart || chart.groups.length > 0) return null;
  return refusal(
    "SOURCE_GAP",
    chart.rosterCount > 0
      ? `Sleeper publishes depth charts for the league but places none of this team's ${chart.rosterCount} ` +
          `players right now, so there is no chart to draw and all ${chart.rosterCount} are listed below, ` +
          `unplaced. The absence belongs to the source and says nothing about the team.`
      : `Sleeper has no depth chart for this team and no players on it in this payload either, so there is ` +
          `nothing to place and nothing to list.`,
    null,
  );
}
/**
 * The refusal for the players this team's chart does not place at all - the section, not
 * the single player.
 *
 * Same code as the single-player case, because it is the same condition counted once
 * instead of per player: the provider publishes a chart for this team and these names are
 * not on it. It replaces a hand-written paragraph that carried the base rate in prose
 * ("roughly one on-team player in five"), which is the right fact and was the wrong
 * channel - a reader who copied this section out of the page took the names and left the
 * reason behind.
 *
 * NO WITHHELD FIGURE, and this is a correction to what the section was first built with.
 * The obvious candidate was the one `standingRefusal` carries - the share of the team the
 * chart places - and attaching it made `refusalSentence` print "Players the source places
 * would read 8 of 10, AND IS NOT PUBLISHED" about 300px below a page header reading "8 of
 * 10 players placed". The figure is not withheld here; it is one of the first things the
 * page says. `withheld` means the module computed a number and declined to state it, so
 * naming an already-published figure there is a false claim in the one register built to
 * stop the app making them. The rate stays in `because`, where it is context rather than
 * a refusal, and nothing numeric is refused by this section at all - it is a list of
 * names, and the names are all present.
 *
 * @param {DepthChart} chart
 * @returns {import('../refusal.js').Refusal|null} null when the chart places everybody
 */
export function unplacedRefusal(chart) {
  if (!chart || chart.unplaced.length === 0) return null;
  const n = chart.unplaced.length;
  return refusal(
    "SOURCE_GAP",
    `${n === 1 ? "This player is" : `These ${n} are`} on the roster and absent from Sleeper's depth chart, ` +
      `which places ${chart.chartedCount} of the team's ${chart.rosterCount}. Roughly one on-team player in ` +
      `five has no entry on any night, so an absence here is a gap in the source and says nothing about ` +
      `${n === 1 ? "him" : "any of them"}.`,
    null,
  );
}
/**
 * EVERY team's chart, built in one pass over the payload, keyed by abbreviation.
 *
 * The dense surfaces need many players' standings at once - /values renders 260 rows,
 * /roster seventeen - and calling `depthChartFor` per row would walk all 2,108 players
 * per row. One grouping pass, thirty charts, then O(1) per row.
 *
 * @param {Iterable<Player>|Map<string, Player>} players
 * @returns {Map<string, DepthChart>}
 */
export function depthChartsByTeam(players) {
  /** @type {Map<string, Player[]>} */
  const byTeam = new Map();
  for (const p of dedupeByPlayer(toList(players)).values()) {
    const t = normalizeTeam(p.team);
    if (!t) continue;
    const bucket = byTeam.get(t);
    if (bucket) bucket.push(p);
    else byTeam.set(t, [p]);
  }
  /** @type {Map<string, DepthChart>} */
  const out = new Map();
  for (const team of [...byTeam.keys()].sort()) {
    out.set(team, buildChart(byTeam.get(team) ?? [], team));
  }
  return out;
}
/**
 * @typedef {Object} DepthLine
 * @property {string} team
 * @property {string} position
 * @property {number} ahead
 * @property {number} level
 * @property {number} behind
 * @property {number} unordered
 * @property {boolean} unplacedInOrder
 * @property {boolean} offPosition
 * @property {string|null} listedPosition
 */
/**
 * One player's standing as four counts - the shape the dense rows on /values and
 * /roster need: enough to be worth a tap, and structurally incapable of carrying a
 * rank, because counts are all it can express.
 *
 * Returns null when there is nothing to say (no team, no chart entry), so a list
 * renders nothing rather than sixty copies of an empty state.
 *
 * @param {Map<string, DepthChart>} charts from `depthChartsByTeam`
 * @param {Player|null|undefined} player
 * @returns {DepthLine|null}
 */
export function depthLineFor(charts, player) {
  if (!charts || !player || !player.team || !player.depthChartPosition)
    return null;
  const chart = charts.get(normalizeTeam(player.team));
  if (!chart) return null;
  const standing = standingFor(chart, player.playerId);
  if (!standing) return null;
  return {
    team: chart.team,
    position: standing.position,
    ahead: standing.ahead.length,
    level: standing.level.length,
    behind: standing.behind.length,
    unordered: standing.unordered.length,
    unplacedInOrder: standing.unplacedInOrder,
    offPosition: standing.entry.offPosition,
    listedPosition: standing.entry.listedPosition,
  };
}
/**
 * The whole prop a dense player row needs: the counts, plus the address of the chart
 * they came from. One function so /values and /roster cannot build the link two ways.
 *
 * @param {Map<string, DepthChart>} charts
 * @param {Player|null|undefined} player
 * @returns {(DepthLine & {href: string})|null}
 */
export function depthRowFor(charts, player) {
  const line = depthLineFor(charts, player);
  if (!line) return null;
  const href = depthChartHref(line.team, player?.playerId);
  return href ? { ...line, href } : null;
}
