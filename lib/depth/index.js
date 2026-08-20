/**
 * ONE NBA TEAM'S DEPTH CHART, derived from Sleeper's own two fields.
 *
 * WHAT THIS IS. `/players/nba` carries `depth_chart_position` ("PG") and
 * `depth_chart_order` (1) on every player Sleeper's own app shows a depth chart for.
 * Measured on the live payload (2026-08-19): 593 players are on an NBA team, 474 of
 * them carry BOTH fields, 119 carry NEITHER, and zero carry one without the other.
 * That is the entire raw material, and this module's whole job is to turn it into a
 * team's chart without adding anything that was not in it.
 *
 * WHAT IT REFUSES TO DO, and this is the important half. Sleeper's orders are not
 * ranks, and treating them as ranks is the one way this feature could lie. On the same
 * live payload, across the 149 (team, position) groups that exist:
 *
 *   - 116 groups are NON-CONTIGUOUS. LAL's centres come back 1, 2, 5. GSW's power
 *     forwards come back 1, 5, 6, 7, 8. The integer is not a position in a list.
 *   - 43 groups contain a DUPLICATE order. LAL lists two small forwards at 2. BOS
 *     lists two power forwards at 1. MEM lists five centres as 1, 2, 2, 5, 5.
 *   - 18 groups have NO order 1 AT ALL. LAL's only listed power forward is a 2.
 *
 * So: this module SORTS by the order and never INDEXES by it. It publishes who is
 * ahead of a player, who is level with him and who is behind him - three facts a sort
 * can support - and it never computes "3rd string", "the backup", or an ordinal of any
 * kind, because on 43 groups an ordinal would be a coin flip presented as a datum and
 * on 116 more it would be arithmetic on a number that was never a count. D19's rule
 * (refuse the inference, publish the gap) is the same rule here, one layer down.
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
 * @property {DepthEntry[]} entries sorted by `order`, unordered players last
 * @property {boolean} hasTies at least two entries share an order
 * @property {boolean} contiguous the orders are exactly 1..n, with no gap and no repeat
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
 * THE TIE-BREAK IS DELIBERATELY UNINFORMATIVE. 43 groups in the live payload contain a
 * duplicate order, so a tie-break runs often and whatever it uses will read as a
 * ranking to anyone looking at the list. Alphabetical carries no such suggestion:
 * nobody mistakes "Matisse before Ziaire" for a judgement. Consensus rank was the
 * obvious alternative and was rejected for exactly that reason - it would have quietly
 * turned "these two are level" into "the better player is listed higher", which the
 * source does not say. The surface states the tie in words on top of this (see
 * `standingFor`); the sort only has to be stable.
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
    const orders = entries.map((e) => e.order);
    const stated = orders.filter((o) => o != null);
    const hasTies = new Set(stated).size !== stated.length;
    const contiguous =
      stated.length === entries.length &&
      !hasTies &&
      stated.every((o, i) => o === i + 1);
    return {
      position,
      standard: CHART_POSITIONS.includes(position),
      entries,
      hasTies,
      contiguous,
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
 * `level` is the whole reason this returns lists rather than an index. Two LAL small
 * forwards are both order 2 and there is no order 1; an ordinal would have to invent a
 * winner between them, so instead the pair is reported as level and the surface says
 * so in words. Same for `unplacedInOrder`: a player the chart places at a position but
 * gives no order to cannot be compared to anyone, and saying "last" would be the
 * invention.
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
