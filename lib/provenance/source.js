import { buildDraftIndex, madePicks, REASON_TEXT } from "../lineage/index.js";
import { startupSeasons } from "../metrics/skill.js";
import { getPrincipals } from "../principals.js";
import {
  buildAssetMoves,
  buildHoldings,
  pickKey,
  tradeParties,
} from "../tradegraph/index.js";
import { refusal } from "../refusal.js";
const DAY = 86_400_000;
/**
 * Below this many days, a gap has no scene to tell. Three months is comfortably above
 * a normal in-season signing cadence and comfortably below the shortest gap this
 * feature's own "18 months unresolved" pitch (D51's blue-sky addendum) is about.
 *
 * No longer justified by `MIN_ROW`, which is gone: the rail's rows are content-sized
 * now and there is no px floor to point at. The threshold stands on its own terms -
 * "what is long enough to have contained anything" - which is what it was always
 * really measuring.
 */
const MIN_GAP_DAYS = 90;
/**
 * Which seat held the asset across the gap that FOLLOWS this node.
 *
 * A gap is the stretch between two events, and the thing that makes it a scene rather
 * than a blank is that somebody was holding the asset the whole time. Whoever the
 * previous node handed it to is that somebody.
 */
function holderAfter(node) {
  if (node.node === "hop") return { rosterId: node.to, name: node.toName };
  if (node.node === "resolution")
    return { rosterId: node.usedByRoster, name: node.usedByName };
  if (node.node === "origin") return { rosterId: node.rosterId, name: null };
  return { rosterId: null, name: null };
}
/** Did this transaction touch `rosterId` at all? */
function touchesRoster(t, rosterId) {
  if (rosterId == null) return false;
  if (t.type === "trade") return tradeParties(t).includes(rosterId);
  for (const r of Object.values(t.adds ?? {})) if (r === rosterId) return true;
  for (const r of Object.values(t.drops ?? {})) if (r === rosterId) return true;
  return false;
}
/**
 * ONE SCENE PER GAP, SCOPED TO THE HOLDER - what `chainGapActivity` should have been.
 *
 * THE BUG IT REPLACES. The old function reported LEAGUE-WIDE activity during the
 * chain's single longest gap, and league-wide is what made it useless: for a
 * never-traded player the only gap runs origin-to-today, so every never-traded player
 * whose origin is the same startup draft got the SAME window and therefore
 * byte-identical numbers - the same paragraph, on 149 different pages, saying nothing
 * about any of them. "The league recorded 402 waiver moves while this sat" is a fact
 * about the league; the reader is on this page asking about this asset.
 *
 * WHAT THIS ASKS INSTEAD. For each gap: what did THE HOLDER do during it? A manager
 * who sat on a player for two years while making eleven other trades was busy and
 * chose not to move him; a manager who made no move at all in the same two years was
 * doing something else entirely. Those are different stories about the same blank
 * stretch of rail, and both are readable off `h.transactions` scoped to one seat.
 *
 * THREE STATES, AND THE THIRD IS NOT AN ABSENCE.
 *   `active`   the holder moved elsewhere during the gap. Carries `marks`, one per
 *              move, each with the fraction of the gap it sits at, so the rail can
 *              draw a rug positioned in time.
 *   `idle`     the holder made no other move. This is REAL INFORMATION (D40), not a
 *              missing value, so it is a state with its own sentence and the league's
 *              own count beside it for scale - never an empty cell.
 *   `undated`  one of the gap's two boundaries has no true timestamp, so the WINDOW
 *              does not exist and nothing can be counted inside it. Carries a
 *              `SOURCE_GAP` refusal (D95) rather than a zero, because a zero here
 *              would be a measurement nobody made.
 *
 * Never counts the asset's own bounding hops as activity "elsewhere" (excluded by
 * `tradeId`), and never counts a seat's activity toward a gap it did not hold.
 *
 * ONE HONEST LIMIT, STATED. Activity is scoped to the SEAT (roster id), not the
 * principal, because that is what a transaction records. If a seat changed hands
 * mid-gap the count includes both managers' moves while the caption names the one the
 * node names. Rare enough to be worth the simpler derivation, wrong enough to write
 * down (D22 is the same distinction handled the other way where it mattered more).
 *
 * @returns {(object|null)[]} one entry per node, aligned by index: entry `i` describes
 *   the gap ABOVE node `i`, so index 0 is always null. `null` means "no scene" - a gap
 *   too short to have contained anything.
 */
export function chainGapScenes(h, chain, ctx) {
  const nodes = [...chain.events, chain.today];
  const out = nodes.map(() => null);
  if (nodes.length < 2) return out;
  const ownTradeIds = new Set(
    chain.events.filter((e) => e.node === "hop").map((e) => e.tradeId),
  );
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const node = nodes[i];
    const holder = holderAfter(prev);
    const name =
      holder.name ??
      (holder.rosterId != null ? ctx?.names?.[holder.rosterId] : null) ??
      null;
    // THE WINDOW HAS TO EXIST BEFORE ANYTHING CAN BE COUNTED IN IT. An undated
    // boundary is not a short gap and not an empty one - it is an unmeasurable one.
    if (!prev.dated || !node.dated) {
      out[i] = {
        state: "undated",
        holderRosterId: holder.rosterId,
        holderName: name,
        refusal: refusal(
          "SOURCE_GAP",
          `one end of this stretch carries no recorded date (${
            !prev.dated && !node.dated
              ? "neither boundary is dated"
              : !prev.dated
                ? "the earlier boundary is undated"
                : "the later boundary is undated"
          }), so there is no window to count moves inside`,
        ),
      };
      continue;
    }
    const from = prev.at;
    const to = node.at;
    const span = to - from;
    if (span < MIN_GAP_DAYS * DAY) continue;
    let trades = 0;
    let waivers = 0;
    let freeAgents = 0;
    let leagueTotal = 0;
    const marks = [];
    for (const t of h.transactions) {
      if (t.created <= from || t.created >= to) continue;
      if (t.type === "trade" && ownTradeIds.has(t.transactionId)) continue;
      leagueTotal++;
      if (!touchesRoster(t, holder.rosterId)) continue;
      let kind = null;
      if (t.type === "trade") {
        trades++;
        kind = "trade";
      } else if (t.type === "waiver") {
        waivers++;
        kind = "waiver";
      } else if (t.type === "free_agent") {
        freeAgents++;
        kind = "free_agent";
      }
      if (kind) marks.push({ at: t.created, frac: (t.created - from) / span, kind });
    }
    const total = trades + waivers + freeAgents;
    marks.sort((a, b) => a.at - b.at);
    out[i] = {
      state: total > 0 ? "active" : "idle",
      // THE LAST GAP HAS NOT ENDED. It runs to `today`, so its length is elapsed time
      // with an unknown end rather than a completed duration - which is why the rail
      // gates the hold comparison on it (see `HoldComparison`).
      open: i === nodes.length - 1,
      holderRosterId: holder.rosterId,
      holderName: name,
      fromAt: from,
      toAt: to,
      days: Math.round(span / DAY),
      trades,
      waivers,
      freeAgents,
      total,
      leagueTotal,
      marks,
    };
  }
  return out;
}
/**
 * Every real draft date, for the rail's SOLID hairlines.
 *
 * The rail marks two kinds of horizontal line inside a gap and the distinction is the
 * one WindowMap already draws: dashed is a SCALE, solid is a FACT. A calendar-year
 * boundary is a scale the reader brings with them; a draft actually happened on a
 * recorded day, and a chain that sat across one sat across a real event. Only drafts
 * with a `startTime` are returned - an unscheduled future draft has no date to draw
 * (`UNSCHEDULED`'s own condition), and inventing one would be the exact inference D19
 * forbids.
 */
export function draftDatesFrom(index) {
  const out = [];
  for (const [season, sd] of index?.bySeason ?? new Map()) {
    const at = sd?.draft?.startTime;
    if (typeof at === "number" && Number.isFinite(at)) out.push({ season, at });
  }
  return out.sort((a, b) => a.at - b.at);
}
/**
 * Every COMPLETED hold, by seat, in days - the population a single hold is read against.
 *
 * A hold is one recorded trade in to the next recorded trade out of the same seat, and
 * that definition is the honest limit of what `moves` can support: it is built from
 * trades only, so a player dropped to waivers mid-hold and re-signed by the same
 * manager reads as one continuous hold. The rail therefore calls these
 * "trade-to-trade" holds in the copy rather than implying continuous possession.
 *
 * The final hold of any asset is deliberately EXCLUDED: it has not ended, so its
 * duration is not a duration yet - it is elapsed time with an unknown end. Mixing open
 * holds into the population would drag the median toward "however long ago the last
 * trade was", which is a fact about today's date and not about anybody's behaviour.
 */
export function holdDurationsByRoster(moves) {
  const byAsset = new Map();
  for (const m of moves) {
    const list = byAsset.get(m.assetKey);
    if (list) list.push(m);
    else byAsset.set(m.assetKey, [m]);
  }
  const out = new Map();
  for (const list of byAsset.values()) {
    // `buildAssetMoves` already sorts chronologically, so consecutive entries are
    // consecutive holds of the same asset.
    for (let i = 0; i < list.length - 1; i++) {
      const seat = list[i].to;
      if (seat == null) continue;
      const days = Math.round((list[i + 1].created - list[i].created) / DAY);
      if (days < 0) continue;
      const arr = out.get(seat);
      if (arr) arr.push(days);
      else out.set(seat, [days]);
    }
  }
  for (const arr of out.values()) arr.sort((a, b) => a - b);
  return out;
}
/**
 * One assembly, reused by every surface that draws a rail.
 *
 * `opts` lets a caller that already holds the principal index or the draft index
 * hand them in rather than resolving them twice - both are memoized, so this is
 * about not writing the same await in two places, not about cost.
 */
export async function loadProvenanceSource(h, opts = {}) {
  // Neither depends on the other's result, and both are already single-flight +
  // TTL memoized on their own (lib/principals.js, lib/lineage/index.js), so running
  // them in series only added their two costs together for no reason. `Promise.all`
  // preserves the exact same catch-and-degrade-to-`{supported:false}` fallback for a
  // provider with no draft support - only the ORDERING changed.
  const [principals, index] = await Promise.all([
    opts.principals ?? getPrincipals(h),
    opts.index ??
      buildDraftIndex(h).catch(() => {
        // A provider with no draft support must not take the whole rail down with
        // it: every trade hop, every waiver origin and every terminus still derive.
        // The chains simply stop at the pick instead of crossing into the player.
        return { supported: false, bySeason: new Map() };
      }),
  ]);
  const made = madePicks(index);
  const startups = startupSeasons(
    [...index.bySeason.entries()].map(([season, sd]) => ({
      season,
      rounds: sd.draft.rounds,
    })),
  );
  const draftedFrom = {};
  const pickPlayers = {};
  const playerOfPick = {};
  for (const p of made) {
    if (!p.playerId || p.originalRoster == null) continue;
    playerOfPick[pickKey(p.season, p.round, p.originalRoster)] = p.playerId;
    draftedFrom[p.playerId] = {
      playerId: p.playerId,
      season: p.season,
      round: p.round,
      pickNo: p.pickNo,
      originalRoster: p.originalRoster,
      usedByRoster: p.usedByRoster,
      at: p.at,
      isStartup: startups.has(p.season),
    };
    const name = h.players.get(p.playerId)?.fullName;
    if (name) pickPlayers[pickKey(p.season, p.round, p.originalRoster)] = name;
  }
  const signings = {};
  let recordStart = Number.MAX_SAFE_INTEGER;
  for (const t of h.transactions) {
    if (t.created < recordStart) recordStart = t.created;
    if (t.type !== "waiver" && t.type !== "free_agent") continue;
    for (const [pid, rosterId] of Object.entries(t.adds)) {
      (signings[pid] ??= []).push({
        playerId: pid,
        rosterId,
        at: t.created,
        type: t.type === "waiver" ? "waiver" : "free_agent",
        transactionId: t.transactionId,
      });
    }
  }
  for (const list of Object.values(signings)) list.sort((a, b) => a.at - b.at);
  if (recordStart === Number.MAX_SAFE_INTEGER) recordStart = Date.now();
  // CURRENT holders only. A departed principal's last roster id belongs to whoever
  // replaced them, so letting them into this map would print their name for someone
  // else's seat (D22).
  const names = {};
  const ownerNames = {};
  for (const pr of principals.principals) {
    const label = pr.teamName || pr.displayName;
    ownerNames[pr.ownerId] = label;
    if (!pr.isFormer && pr.currentRosterId != null)
      names[pr.currentRosterId] = label;
  }
  for (const r of h.rosters) {
    if (names[r.rosterId]) continue;
    const u = r.ownerId ? h.usersById.get(r.ownerId) : undefined;
    names[r.rosterId] = u?.teamName || u?.displayName || `Roster ${r.rosterId}`;
  }
  const playerNames = {};
  for (const p of h.players.values()) playerNames[p.playerId] = p.fullName;
  const moves = buildAssetMoves(h, principals, pickPlayers);
  return {
    ctx: {
      moves,
      holdings: buildHoldings(h),
      draftedFrom,
      playerOfPick,
      signings,
      names,
      ownerNames,
      playerNames,
      recordStart,
      // Verbatim from lib/lineage, so /drafts and the rail cannot drift (see the
      // comment on REASON_TEXT). "no-draft" is the reason that applies to a pick
      // still sitting in a future season, which is every pending pick this app can
      // show a rail for.
      pendingPickText: REASON_TEXT["no-draft"],
    },
    moves,
    principals,
    index,
    pickPlayers,
  };
}
