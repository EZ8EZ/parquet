import { buildDraftIndex, madePicks, REASON_TEXT } from "../lineage";
import { startupSeasons } from "../metrics/skill";
import { getPrincipals } from "../principals";
import { buildAssetMoves, buildHoldings, pickKey } from "../tradegraph";
const DAY = 86_400_000;
/**
 * Below this many days, a gap has no scene to tell - see `MIN_ROW` in
 * ProvenanceRail.tsx, which already floors a ROW at 92px regardless of elapsed time
 * for exactly the same reason. Three months is comfortably above a normal in-season
 * signing cadence and comfortably below the shortest gap this feature's own
 * "18 months unresolved" pitch (D51's blue-sky addendum) is actually about.
 */
const MIN_GAP_DAYS = 90;
/**
 * OPT-IN TEXTURE FOR THE RAIL'S LONGEST GAP - the shelved idea D51's addendum
 * recorded and blocked on D58's density mandate, reconsidered.
 *
 * The blocked version filled EVERY gap on EVERY rail with drawn texture, unconditionally -
 * which is exactly the density D58 fought to remove, on every roster row whether
 * anyone asked for it or not. This version computes the read but never forces it onto
 * the page: it returns a plain data object, the caller decides whether to compute it
 * at all (the standalone /lineage page does; the inline rail on /roster, rendering a
 * rail per rostered player, does not - see the prop wiring in ProvenanceRail.tsx), and
 * the rail itself only ever draws it inside a closed `<details>` (components/ui.tsx's
 * `Disclosure`, the same pattern Awards/Methodology/the mega-pages already use for
 * "available but not forced on every reader"). Default density is untouched; the scene
 * is one tap away for whoever wants it.
 *
 * Scoped to the chain's SINGLE LONGEST gap, not every gap - the docstring on
 * `PER_GAP_PX` already argues this: "the long gap IS the story for that player." A
 * three-node chain with one four-year gap gets one disclosure, not a chart.
 *
 * Reports LEAGUE-WIDE activity elsewhere during that window - other trades, waiver
 * claims and free-agent signings - and never this asset's OWN moves (excluded by
 * `tradeId`, so a hop that happens to bound the gap is never counted as "elsewhere").
 * Returns null rather than a hollow "nothing happened" sentence when the gap is short
 * or the league was genuinely quiet, because a fabricated scene is worse than none.
 */
export function chainGapActivity(h, chain) {
  const nodes = [...chain.events, chain.today];
  if (nodes.length < 2) return null;
  const ownTradeIds = new Set(
    chain.events.filter((e) => e.node === "hop").map((e) => e.tradeId),
  );
  let best = null;
  for (let i = 1; i < nodes.length; i++) {
    const span = nodes[i].at - nodes[i - 1].at;
    if (!best || span > best.span) {
      best = { from: nodes[i - 1].at, to: nodes[i].at, span };
    }
  }
  if (!best || best.span < MIN_GAP_DAYS * DAY) return null;
  let trades = 0;
  let waivers = 0;
  let freeAgents = 0;
  for (const t of h.transactions) {
    if (t.created <= best.from || t.created >= best.to) continue;
    if (t.type === "trade") {
      if (ownTradeIds.has(t.transactionId)) continue;
      trades++;
    } else if (t.type === "waiver") waivers++;
    else if (t.type === "free_agent") freeAgents++;
  }
  const total = trades + waivers + freeAgents;
  if (total === 0) return null;
  return {
    fromAt: best.from,
    toAt: best.to,
    days: Math.round(best.span / DAY),
    trades,
    waivers,
    freeAgents,
    total,
  };
}
/**
 * One assembly, reused by every surface that draws a rail.
 *
 * `opts` lets a caller that already holds the principal index or the draft index
 * hand them in rather than resolving them twice - both are memoized, so this is
 * about not writing the same await in two places, not about cost.
 */
export async function loadProvenanceSource(h, opts = {}) {
  // Neither await depends on the other's result, so they run together rather than
  // one after the other - both `getPrincipals` and `buildDraftIndex` are
  // single-flight + TTL memoized on their own (lib/principals.js, lib/lineage/
  // index.js), so a concurrent caller elsewhere can never duplicate either fetch;
  // this just stops that page from paying their latencies back to back for no
  // reason.
  const [principals, indexResult] = await Promise.all([
    opts.principals ? Promise.resolve(opts.principals) : getPrincipals(h),
    opts.index
      ? Promise.resolve(opts.index)
      : buildDraftIndex(h).catch(() => null),
  ]);
  // A provider with no draft support must not take the whole rail down with it:
  // every trade hop, every waiver origin and every terminus still derive. The
  // chains simply stop at the pick instead of crossing into the player.
  const index = indexResult ?? { supported: false, bySeason: new Map() };
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
