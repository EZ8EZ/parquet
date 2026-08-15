import { buildDraftIndex, madePicks, REASON_TEXT } from "../lineage";
import { startupSeasons } from "../metrics/skill";
import { getPrincipals } from "../principals";
import { buildAssetMoves, buildHoldings, pickKey } from "../tradegraph";
/**
 * One assembly, reused by every surface that draws a rail.
 *
 * `opts` lets a caller that already holds the principal index or the draft index
 * hand them in rather than resolving them twice - both are memoized, so this is
 * about not writing the same await in two places, not about cost.
 */
export async function loadProvenanceSource(h, opts = {}) {
  const principals = opts.principals ?? (await getPrincipals(h));
  let index;
  try {
    index = opts.index ?? (await buildDraftIndex(h));
  } catch {
    // A provider with no draft support must not take the whole rail down with it:
    // every trade hop, every waiver origin and every terminus still derive. The
    // chains simply stop at the pick instead of crossing into the player.
    index = { supported: false, bySeason: new Map() };
  }
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
