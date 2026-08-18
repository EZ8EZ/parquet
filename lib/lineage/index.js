import { getLeagueProvider } from "../providers/index.js";
import { ordinal, rosterName } from "../derive/describe.js";
import { timed } from "../timing.js";
const EMPTY_INDEX = { supported: false, bySeason: new Map() };
let indexSlot = null;
const INDEX_TTL_MS = 5 * 60_000;
async function assembleDraftIndex(h) {
  const provider = getLeagueProvider();
  if (!provider.getDrafts || !provider.getDraftPicks) {
    return EMPTY_INDEX;
  }
  const getDrafts = provider.getDrafts.bind(provider);
  const getDraftPicks = provider.getDraftPicks.bind(provider);
  const bySeason = new Map();
  for (const league of h.chain) {
    let drafts;
    try {
      drafts = await getDrafts(league.leagueId);
    } catch {
      continue; // one bad season must not sink the whole feature
    }
    for (const draft of drafts) {
      let picks = [];
      try {
        picks = await getDraftPicks(draft.draftId);
      } catch {
        picks = [];
      }
      const slotOf = new Map();
      for (const [slot, rosterId] of Object.entries(draft.slotToRosterId)) {
        slotOf.set(rosterId, Number(slot));
      }
      const byRoundSlot = new Map();
      for (const p of picks) byRoundSlot.set(`${p.round}|${p.draftSlot}`, p);
      bySeason.set(draft.season || league.season, {
        draft,
        // Trust the API's pick_no for ordering — the round/slot formula is wrong
        // for snake drafts (verified, see API_NOTES).
        picks: [...picks].sort((a, b) => a.pickNo - b.pickNo),
        slotOf,
        byRoundSlot,
      });
    }
  }
  return { supported: true, bySeason };
}
/**
 * Load every draft in the league chain and index it for lineage lookups.
 *
 * Never throws: a provider without draft support, or a season whose draft fails to
 * load, simply produces a smaller index and the callers report "unresolved".
 */
export async function buildDraftIndex(h, opts = {}) {
  const key = `${h.provider}|${h.currentLeague.leagueId}`;
  if (!opts.fresh && indexSlot && indexSlot.key === key) {
    if (indexSlot.resolvedAt === undefined) return indexSlot.promise;
    if (Date.now() - indexSlot.resolvedAt < INDEX_TTL_MS)
      return indexSlot.promise;
  }
  const slot = { key };
  slot.promise = timed("buildDraftIndex", () => assembleDraftIndex(h))
    .then((value) => {
      slot.resolvedAt = Date.now();
      return value;
    })
    .catch((err) => {
      // Clear the slot on rejection so a transient failure doesn't pin a rejected
      // promise for the rest of the TTL window (mirrors `ensureIngested`).
      if (indexSlot === slot) indexSlot = null;
      throw err;
    });
  indexSlot = slot;
  return slot.promise;
}
/** Drop the memoized draft index (mirrors `invalidateHistory`). */
export function invalidateDraftIndex() {
  indexSlot = null;
}
// ---------------------------------------------------------------- helpers
/**
 * The reasons a pick has no player yet, in the app's own words.
 *
 * EXPORTED because the provenance rail (lib/provenance) ends an undrafted pick's
 * chain on one of these sentences and prints it verbatim. Two surfaces describing
 * the same unresolved pick in two different ways is exactly the drift this feature
 * was rebuilt to remove: /drafts owns the pick's story, provenance owns the player's,
 * and they must speak the same language about the one thing they share.
 */
export const REASON_TEXT = {
  "no-draft-support": "This data source doesn't expose drafts.",
  "no-draft": "Not drafted yet - this pick is still in the future.",
  "not-yet-drafted": "The draft hasn't reached this pick yet.",
  "slot-unknown": "No draft slot for that team this season.",
  "no-player": "The pick was made but no player was recorded.",
};
/**
 * Most recent owner of a tradeable pick, from the chain-wide history.
 *
 * `collectTradedPicks` preserves each hop in chain order (oldest league first), so
 * the LAST match is the current owner. Absent entirely = never traded.
 */
function currentOwner(h, season, round, originalRoster) {
  let owner = originalRoster;
  let wasTraded = false;
  for (const tp of h.tradedPicksHistory) {
    if (tp.season !== season || tp.round !== round) continue;
    if (tp.rosterId !== originalRoster) continue;
    owner = tp.ownerId;
    wasTraded = true;
  }
  return { owner, wasTraded };
}
function unresolved(h, season, round, originalRoster, reason, partial = {}) {
  const { owner, wasTraded } = currentOwner(h, season, round, originalRoster);
  return {
    season,
    round,
    originalRoster,
    originalRosterName: rosterName(h, originalRoster),
    label: pickLabelFor(h, season, round, originalRoster),
    resolved: false,
    reason,
    reasonText: REASON_TEXT[reason],
    draftId: null,
    draftSlot: null,
    pickNo: null,
    currentOwnerRoster: owner,
    currentOwnerName: rosterName(h, owner),
    wasTraded,
    usedByRoster: null,
    usedByName: null,
    playerId: null,
    playerName: null,
    position: null,
    team: null,
    age: null,
    ...partial,
  };
}
/** e.g. `2024 1st (orig. Wire Warriors)` - the "(orig. ...)" only when traded. */
export function pickLabelFor(h, season, round, originalRoster) {
  const { wasTraded } = currentOwner(h, season, round, originalRoster);
  const base = `${season} ${ordinal(round)}`;
  return wasTraded ? `${base} (orig. ${rosterName(h, originalRoster)})` : base;
}
/** Player display fields, preferring the live player universe over pick metadata. */
function playerFields(h, pick) {
  const p = pick.playerId ? h.players.get(pick.playerId) : undefined;
  return {
    playerId: pick.playerId,
    playerName: p?.fullName ?? pick.playerName,
    position: p?.position ?? pick.position,
    team: p?.team ?? pick.team,
    age: p?.age ?? null,
  };
}
/**
 * Trace a traded pick to the player it actually became.
 *
 * Resolution path: original roster → draft slot (reverse `slotToRosterId`) → the
 * made pick at that `(round, slot)` → its player. Returns an unresolved lineage
 * (never throws) when the draft hasn't happened or the data isn't there.
 */
export async function resolvePickLineage(h, opts) {
  const { season, round, originalRoster } = opts;
  const index = opts.index ?? (await buildDraftIndex(h));
  if (!index.supported) {
    return unresolved(h, season, round, originalRoster, "no-draft-support");
  }
  const sd = index.bySeason.get(season);
  if (!sd) return unresolved(h, season, round, originalRoster, "no-draft");
  const slot = sd.slotOf.get(originalRoster);
  if (slot == null) {
    return unresolved(h, season, round, originalRoster, "slot-unknown", {
      draftId: sd.draft.draftId,
    });
  }
  const pick = sd.byRoundSlot.get(`${round}|${slot}`);
  if (!pick) {
    return unresolved(h, season, round, originalRoster, "not-yet-drafted", {
      draftId: sd.draft.draftId,
      draftSlot: slot,
    });
  }
  if (!pick.playerId) {
    return unresolved(h, season, round, originalRoster, "no-player", {
      draftId: sd.draft.draftId,
      draftSlot: slot,
      pickNo: pick.pickNo,
    });
  }
  const { owner, wasTraded } = currentOwner(h, season, round, originalRoster);
  // The made pick's own rosterId is ground truth for who used it — better than
  // reconstructing from traded_picks, which can miss commissioner-era hops.
  const usedBy = pick.rosterId ?? owner;
  return {
    season,
    round,
    originalRoster,
    originalRosterName: rosterName(h, originalRoster),
    label: pickLabelFor(h, season, round, originalRoster),
    resolved: true,
    reason: null,
    reasonText: null,
    draftId: sd.draft.draftId,
    draftSlot: slot,
    pickNo: pick.pickNo,
    currentOwnerRoster: owner,
    currentOwnerName: rosterName(h, owner),
    wasTraded: wasTraded || usedBy !== originalRoster,
    usedByRoster: usedBy,
    usedByName: rosterName(h, usedBy),
    ...playerFields(h, pick),
  };
}
/**
 * One season's draft in true pick order, with player names and the drafting roster
 * — this is what makes "click into that player's draft and see the surrounding
 * picks" possible. Returns an empty board with a reason rather than throwing.
 */
export async function getDraftBoard(
  h,
  season,
  /**
   * `principals` NAMES THE PERSON WHO WAS ON THE CLOCK, not whoever holds that seat
   * today. Every row on this board is a decision made in `season`, so resolving the
   * roster id through `ownerAt(season, rosterId)` is exactly what D22 asks for. Without
   * it, a seat that has changed hands credited its 2022-2024 picks to the manager who
   * arrived in 2025 - and disagreed with the report cards, the superlatives and the
   * provenance rail, all three of which already name the right person for the same
   * pick. Optional, so a caller without an index degrades to the seat's current name.
   */
  opts = {},
) {
  const nameAt = (rosterId) => {
    const ownerId = opts.principals?.ownerAt(season, rosterId);
    const pr = ownerId ? opts.principals?.byOwnerId.get(ownerId) : undefined;
    return pr ? pr.teamName || pr.displayName : rosterName(h, rosterId);
  };
  const index = opts.index ?? (await buildDraftIndex(h));
  const empty = (reason, sd) => ({
    season,
    draftId: sd?.draft.draftId ?? null,
    status: sd?.draft.status ?? null,
    type: sd?.draft.type ?? null,
    rounds: sd?.draft.rounds ?? 0,
    teams: sd?.draft.teams ?? 0,
    picks: [],
    reason,
    reasonText: REASON_TEXT[reason],
  });
  if (!index.supported) return empty("no-draft-support");
  const sd = index.bySeason.get(season);
  if (!sd) return empty("no-draft");
  if (sd.picks.length === 0) return empty("not-yet-drafted", sd);
  const picks = sd.picks.map((p) => {
    const original = sd.draft.slotToRosterId[p.draftSlot] ?? null;
    const usedBy = p.rosterId ?? null;
    return {
      pickNo: p.pickNo,
      round: p.round,
      draftSlot: p.draftSlot,
      originalRoster: original,
      originalRosterName: original != null ? nameAt(original) : null,
      usedByRoster: usedBy,
      usedByName: usedBy != null ? nameAt(usedBy) : null,
      wasTraded: original != null && usedBy != null && original !== usedBy,
      isMine: h.me.rosterId != null && usedBy === h.me.rosterId,
      ...playerFields(h, p),
    };
  });
  return {
    season,
    draftId: sd.draft.draftId,
    status: sd.draft.status,
    type: sd.draft.type,
    rounds: sd.draft.rounds,
    teams: sd.draft.teams,
    picks,
    reason: null,
    reasonText: null,
  };
}
/** Every season that has a draft, newest first, with headline counts. */
export async function getDraftSeasons(h, opts = {}) {
  const index = opts.index ?? (await buildDraftIndex(h));
  const out = [];
  for (const [season, sd] of index.bySeason) {
    let tradedCount = 0;
    let mineCount = 0;
    for (const p of sd.picks) {
      const original = sd.draft.slotToRosterId[p.draftSlot];
      if (original != null && p.rosterId != null && original !== p.rosterId) {
        tradedCount++;
      }
      if (h.me.rosterId != null && p.rosterId === h.me.rosterId) mineCount++;
    }
    out.push({
      season,
      draftId: sd.draft.draftId,
      status: sd.draft.status,
      type: sd.draft.type,
      rounds: sd.draft.rounds,
      teams: sd.draft.teams,
      pickCount: sd.picks.length,
      tradedCount,
      mineCount,
    });
  }
  return out.sort((a, b) => b.season.localeCompare(a.season));
}
/**
 * Every made pick in the chain, flattened.
 *
 * The reverse of `resolvePickLineage`: that answers "what did this pick become",
 * this answers "which pick produced this player", which is the join the provenance
 * rail walks backwards through. It lives here rather than in lib/provenance because
 * the `(round, draftSlot) -> original roster` join is this module's own invariant
 * and there must not be a second copy of it.
 */
export function madePicks(index) {
  const out = [];
  for (const [season, sd] of index.bySeason) {
    for (const p of sd.picks) {
      out.push({
        season,
        round: p.round,
        pickNo: p.pickNo,
        draftSlot: p.draftSlot,
        originalRoster: sd.draft.slotToRosterId[p.draftSlot] ?? null,
        usedByRoster: p.rosterId ?? null,
        playerId: p.playerId,
        at: sd.draft.startTime,
        rounds: sd.draft.rounds,
      });
    }
  }
  return out;
}
/**
 * Every pick that ever changed hands, traced to what it became — the headline
 * "what did that first-rounder turn into?" list.
 *
 * Deduped to one row per pick identity, keeping the FINAL destination, and sorted
 * newest season first then by round.
 */
export async function getTradedPickLineages(h, opts = {}) {
  const index = opts.index ?? (await buildDraftIndex(h));
  // Last hop wins: that is the party who ultimately held the pick.
  const finalHop = new Map();
  for (const tp of h.tradedPicksHistory) {
    if (tp.ownerId === tp.rosterId && tp.previousOwnerId === tp.rosterId)
      continue;
    finalHop.set(`${tp.season}|${tp.round}|${tp.rosterId}`, {
      season: tp.season,
      round: tp.round,
      originalRoster: tp.rosterId,
      from: tp.previousOwnerId,
      to: tp.ownerId,
    });
  }
  const rows = [];
  for (const hop of finalHop.values()) {
    if (
      opts.rosterId != null &&
      hop.from !== opts.rosterId &&
      hop.to !== opts.rosterId &&
      hop.originalRoster !== opts.rosterId
    ) {
      continue;
    }
    const lineage = await resolvePickLineage(h, {
      season: hop.season,
      round: hop.round,
      originalRoster: hop.originalRoster,
      index,
    });
    rows.push({
      ...lineage,
      fromRoster: hop.from,
      fromName: rosterName(h, hop.from),
      toRoster: hop.to,
      toName: rosterName(h, hop.to),
    });
  }
  return rows.sort(
    (a, b) =>
      // Resolved (already became someone) first — that's the interesting half.
      Number(b.resolved) - Number(a.resolved) ||
      b.season.localeCompare(a.season) ||
      a.round - b.round,
  );
}
