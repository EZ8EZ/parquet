/**
 * PICK LINEAGE — closing the dynasty loop.
 *
 * In a dynasty league the question that actually matters about a trade is never
 * "what pick did I give up?" but "what did that pick BECOME?" Sleeper stores the two
 * halves of that answer in two unrelated places and never joins them:
 *
 *   1. A *tradeable* pick is `{ season, round, rosterId }` where `rosterId` is the
 *      roster the pick ORIGINALLY belongs to (`h.tradedPicksHistory`, and
 *      `DraftPickRef` inside each trade).
 *   2. A *made* pick is `{ pickNo, round, draftSlot, rosterId, playerId }` where
 *      `rosterId` is whoever ACTUALLY used it.
 *
 * The join key is the draft's `slotToRosterId` map: it says which draft slot each
 * roster originally owns. Reverse it and a traded pick lands on exactly one made
 * pick — and therefore exactly one player. Verified 42/42 against live Sleeper data
 * (see API_NOTES "Drafts").
 *
 * Everything here degrades instead of throwing: future picks, seasons with no draft,
 * providers with no draft support, and half-finished drafts all return an explicit
 * `unresolved` state carrying a reason the UI can print verbatim.
 */
import type { LeagueHistory } from "../history";
import { getLeagueProvider } from "../providers";
import type { DraftMeta, DraftPick } from "../providers/types";
import { ordinal, rosterName } from "../derive/describe";

// ---------------------------------------------------------------- types

/** Why a pick could not be traced to a player. */
export type UnresolvedReason =
  /** The provider has no draft support at all (e.g. CSV imports). */
  | "no-draft-support"
  /** No draft exists for that season — a genuinely future pick. */
  | "no-draft"
  /** The draft exists but hasn't happened (or hasn't reached this pick) yet. */
  | "not-yet-drafted"
  /** The draft happened but has no slot for that roster (roster left the league). */
  | "slot-unknown"
  /** The pick was made but carries no player (rare; malformed data). */
  | "no-player";

export interface PickLineage {
  /** Identity of the tradeable pick being traced. */
  season: string;
  round: number;
  originalRoster: number;
  originalRosterName: string;
  /** e.g. "2024 1st (orig. Citadel)". */
  label: string;
  /** True only when `player` is populated. */
  resolved: boolean;
  reason: UnresolvedReason | null;
  /** Human copy for the unresolved case — safe to render directly. */
  reasonText: string | null;
  draftId: string | null;
  draftSlot: number | null;
  /** Overall pick number in the draft, from the API. Never recomputed. */
  pickNo: number | null;
  /** Who currently owns the pick per chain-wide traded-pick history. */
  currentOwnerRoster: number;
  currentOwnerName: string;
  /** Whether the pick ever changed hands. */
  wasTraded: boolean;
  /** The roster that actually used the pick (ground truth from the made pick). */
  usedByRoster: number | null;
  usedByName: string | null;
  /** What the pick became. */
  playerId: string | null;
  playerName: string | null;
  position: string | null;
  team: string | null;
  age: number | null;
}

export interface BoardPick {
  pickNo: number;
  round: number;
  draftSlot: number;
  /** Roster that originally owned this slot. */
  originalRoster: number | null;
  originalRosterName: string | null;
  /** Roster that actually made the pick. */
  usedByRoster: number | null;
  usedByName: string | null;
  /** The slot changed hands before the draft — i.e. this pick has a lineage story. */
  wasTraded: boolean;
  /** Belongs to the roster currently being viewed. */
  isMine: boolean;
  playerId: string | null;
  playerName: string | null;
  position: string | null;
  team: string | null;
  age: number | null;
}

export interface DraftBoard {
  season: string;
  draftId: string | null;
  /** "complete" | "pre_draft" | "drafting" | … (provider-widened). */
  status: string | null;
  /** "linear" | "snake" | … */
  type: string | null;
  rounds: number;
  teams: number;
  /** Picks in true draft order (by the API's own `pickNo`). Empty if unresolved. */
  picks: BoardPick[];
  /** Set when the board has no picks to show. */
  reason: UnresolvedReason | null;
  reasonText: string | null;
}

export interface DraftSeason {
  season: string;
  draftId: string;
  status: string;
  type: string;
  rounds: number;
  teams: number;
  /** Number of picks actually made. 0 for a draft that hasn't started. */
  pickCount: number;
  /** Picks in this draft that had been traded away from their original roster. */
  tradedCount: number;
  /** Picks in this draft that the viewing roster made. */
  mineCount: number;
}

/** A resolved lineage plus the trade that moved the pick. */
export interface TradedPickLineage extends PickLineage {
  fromRoster: number;
  fromName: string;
  toRoster: number;
  toName: string;
}

// ---------------------------------------------------------------- draft index

interface SeasonDrafts {
  draft: DraftMeta;
  picks: DraftPick[];
  /** Reverse of `draft.slotToRosterId`: original roster -> draft slot. */
  slotOf: Map<number, number>;
  /** `${round}|${slot}` -> made pick. */
  byRoundSlot: Map<string, DraftPick>;
}

export interface DraftIndex {
  /** False when the active provider implements neither draft method. */
  supported: boolean;
  bySeason: Map<string, SeasonDrafts>;
}

const EMPTY_INDEX: DraftIndex = { supported: false, bySeason: new Map() };

/**
 * In-process memo, mirroring the `playersCache` pattern in the Sleeper provider.
 * Drafts are immutable once complete but a live draft should still refresh, so the
 * TTL is short enough to follow one in progress.
 */
let indexCache: { at: number; key: string; value: DraftIndex } | null = null;
const INDEX_TTL_MS = 5 * 60_000;

/**
 * Load every draft in the league chain and index it for lineage lookups.
 *
 * Never throws: a provider without draft support, or a season whose draft fails to
 * load, simply produces a smaller index and the callers report "unresolved".
 */
export async function buildDraftIndex(
  h: LeagueHistory,
  opts: { fresh?: boolean } = {},
): Promise<DraftIndex> {
  const key = `${h.provider}|${h.currentLeague.leagueId}`;
  if (
    !opts.fresh &&
    indexCache &&
    indexCache.key === key &&
    Date.now() - indexCache.at < INDEX_TTL_MS
  ) {
    return indexCache.value;
  }

  const provider = getLeagueProvider();
  if (!provider.getDrafts || !provider.getDraftPicks) {
    indexCache = { at: Date.now(), key, value: EMPTY_INDEX };
    return EMPTY_INDEX;
  }
  const getDrafts = provider.getDrafts.bind(provider);
  const getDraftPicks = provider.getDraftPicks.bind(provider);

  const bySeason = new Map<string, SeasonDrafts>();
  for (const league of h.chain) {
    let drafts: DraftMeta[];
    try {
      drafts = await getDrafts(league.leagueId);
    } catch {
      continue; // one bad season must not sink the whole feature
    }
    for (const draft of drafts) {
      let picks: DraftPick[] = [];
      try {
        picks = await getDraftPicks(draft.draftId);
      } catch {
        picks = [];
      }
      const slotOf = new Map<number, number>();
      for (const [slot, rosterId] of Object.entries(draft.slotToRosterId)) {
        slotOf.set(rosterId, Number(slot));
      }
      const byRoundSlot = new Map<string, DraftPick>();
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

  const value: DraftIndex = { supported: true, bySeason };
  indexCache = { at: Date.now(), key, value };
  return value;
}

/** Drop the memoized draft index (mirrors `invalidateHistory`). */
export function invalidateDraftIndex(): void {
  indexCache = null;
}

// ---------------------------------------------------------------- helpers

const REASON_TEXT: Record<UnresolvedReason, string> = {
  "no-draft-support": "This data source doesn't expose drafts.",
  "no-draft": "Not drafted yet — this pick is still in the future.",
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
function currentOwner(
  h: LeagueHistory,
  season: string,
  round: number,
  originalRoster: number,
): { owner: number; wasTraded: boolean } {
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

function unresolved(
  h: LeagueHistory,
  season: string,
  round: number,
  originalRoster: number,
  reason: UnresolvedReason,
  partial: Partial<PickLineage> = {},
): PickLineage {
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

/** e.g. `2024 1st (orig. Citadel)` — the "(orig. …)" only when it was traded. */
export function pickLabelFor(
  h: LeagueHistory,
  season: string,
  round: number,
  originalRoster: number,
): string {
  const { wasTraded } = currentOwner(h, season, round, originalRoster);
  const base = `${season} ${ordinal(round)}`;
  return wasTraded ? `${base} (orig. ${rosterName(h, originalRoster)})` : base;
}

/** Player display fields, preferring the live player universe over pick metadata. */
function playerFields(h: LeagueHistory, pick: DraftPick) {
  const p = pick.playerId ? h.players.get(pick.playerId) : undefined;
  return {
    playerId: pick.playerId,
    playerName: p?.fullName ?? pick.playerName,
    position: p?.position ?? pick.position,
    team: p?.team ?? pick.team,
    age: p?.age ?? null,
  };
}

// ---------------------------------------------------------------- public API

export interface ResolvePickOpts {
  season: string;
  round: number;
  /** The roster the pick ORIGINALLY belongs to — this is the join key. */
  originalRoster: number;
  /** Reuse a pre-built index to avoid re-fetching in batch/loop callers. */
  index?: DraftIndex;
}

/**
 * Trace a traded pick to the player it actually became.
 *
 * Resolution path: original roster → draft slot (reverse `slotToRosterId`) → the
 * made pick at that `(round, slot)` → its player. Returns an unresolved lineage
 * (never throws) when the draft hasn't happened or the data isn't there.
 */
export async function resolvePickLineage(
  h: LeagueHistory,
  opts: ResolvePickOpts,
): Promise<PickLineage> {
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
  h: LeagueHistory,
  season: string,
  opts: { index?: DraftIndex } = {},
): Promise<DraftBoard> {
  const index = opts.index ?? (await buildDraftIndex(h));
  const empty = (reason: UnresolvedReason, sd?: SeasonDrafts): DraftBoard => ({
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

  const picks: BoardPick[] = sd.picks.map((p) => {
    const original = sd.draft.slotToRosterId[p.draftSlot] ?? null;
    const usedBy = p.rosterId ?? null;
    return {
      pickNo: p.pickNo,
      round: p.round,
      draftSlot: p.draftSlot,
      originalRoster: original,
      originalRosterName: original != null ? rosterName(h, original) : null,
      usedByRoster: usedBy,
      usedByName: usedBy != null ? rosterName(h, usedBy) : null,
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
export async function getDraftSeasons(
  h: LeagueHistory,
  opts: { index?: DraftIndex } = {},
): Promise<DraftSeason[]> {
  const index = opts.index ?? (await buildDraftIndex(h));
  const out: DraftSeason[] = [];
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
 * Every pick that ever changed hands, traced to what it became — the headline
 * "what did that first-rounder turn into?" list.
 *
 * Deduped to one row per pick identity, keeping the FINAL destination, and sorted
 * newest season first then by round.
 */
export async function getTradedPickLineages(
  h: LeagueHistory,
  opts: { rosterId?: number; index?: DraftIndex } = {},
): Promise<TradedPickLineage[]> {
  const index = opts.index ?? (await buildDraftIndex(h));

  // Last hop wins: that is the party who ultimately held the pick.
  const finalHop = new Map<
    string,
    { season: string; round: number; originalRoster: number; from: number; to: number }
  >();
  for (const tp of h.tradedPicksHistory) {
    if (tp.ownerId === tp.rosterId && tp.previousOwnerId === tp.rosterId) continue;
    finalHop.set(`${tp.season}|${tp.round}|${tp.rosterId}`, {
      season: tp.season,
      round: tp.round,
      originalRoster: tp.rosterId,
      from: tp.previousOwnerId,
      to: tp.ownerId,
    });
  }

  const rows: TradedPickLineage[] = [];
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
