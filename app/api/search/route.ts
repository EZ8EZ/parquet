import { NextResponse } from "next/server";
import { getLeagueHistory, type LeagueHistory } from "@/lib/history";
import { getPrincipals, tenureLabel } from "@/lib/principals";
import { cachedValuePlayers, injuryLabel, type ValueBreakdown } from "@/lib/valuation";
import { computeTiers, tierResolver } from "@/lib/rankings/tiers";
import {
  buildDraftIndex,
  getDraftBoard,
  getDraftSeasons,
  getTradedPickLineages,
  type DraftIndex,
} from "@/lib/lineage";
import { describeTransaction, ordinal } from "@/lib/derive/describe";
import { fold } from "@/lib/ui";
import { boardHref } from "@/app/drafts/parts";

export const dynamic = "force-dynamic";

// One surface, four entity types, capped so the overlay never turns into a second
// scrollable page - the point is a fast answer, not an exhaustive one.
const LIMIT = 8;

// Query/name matching uses the one shared diacritic fold (lib/ui.ts) - this
// route, /values' filter and the trade builder's picker previously each carried
// a private near-copy, and two folds that drift apart mean the same query finds
// a player in one surface and not another.

export interface PlayerResult {
  kind: "player";
  id: string;
  name: string;
  team: string | null;
  position: string | null;
  age: number | null;
  value: number;
  tier: string;
  /** `injuryLabel()` output, e.g. "Knee · Surgery". Null when healthy or rested. */
  injury: string | null;
}

export interface ManagerResult {
  kind: "manager";
  id: string;
  name: string;
  displayName: string;
  isFormer: boolean;
  tenureLabel: string | null;
  avatar: string | null;
  teamLogoUrl: string | null;
  href: string;
}

export interface TradeResult {
  kind: "trade";
  id: string;
  season: string;
  week: number;
  description: string;
}

export interface PickResult {
  kind: "pick";
  id: string;
  label: string;
  season: string;
  pickNo: number | null;
  resolved: boolean;
  playerName: string | null;
  ownerName: string;
  href: string;
}

export interface SearchResponse {
  query: string;
  players: PlayerResult[];
  managers: ManagerResult[];
  trades: TradeResult[];
  picks: PickResult[];
}

// ---------------------------------------------------------------- player values
//
// Tiers only mean something relative to the WHOLE league's value distribution (see
// /values), so this can't be computed on just the matched subset. The player values
// themselves now come from lib/valuation's own shared `cachedValuePlayers` (every
// caller in the app - dossiers, timelines, fragility, /values, /web, this route -
// used to memoize the identical computation separately; see DECISIONS for the
// cold-start pass that consolidated it). Tiers are cheap to rebuild from an already-
// cached value map, so only the tier resolver is memoized here, still keyed and
// TTL'd the same way lib/principals.ts and lib/lineage memo the corpus derivations
// they build on - a keystroke-driven endpoint has no business rebuilding it per key.
let tierCache: {
  at: number;
  key: string;
  tierFor: (v: number) => { label: string } | null;
} | null = null;
const TIER_TTL_MS = 5 * 60_000;

function getPlayerValuation(h: LeagueHistory) {
  const values = cachedValuePlayers(h);
  const key = `${h.provider}|${h.currentLeague.leagueId}`;
  if (tierCache && tierCache.key === key && Date.now() - tierCache.at < TIER_TTL_MS) {
    return { values, tierFor: tierCache.tierFor };
  }
  const valuesDesc = [...values.values()]
    .map((v) => v.value)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  const tiers = computeTiers(valuesDesc, { floor: (valuesDesc[0] ?? 0) * 0.1 });
  const tierFor = tierResolver(tiers);
  tierCache = { at: Date.now(), key, tierFor };
  return { values, tierFor };
}

function searchPlayers(h: LeagueHistory, needle: string): PlayerResult[] {
  const { values, tierFor } = getPlayerValuation(h);
  const startsWith = (name: string) => fold(name).startsWith(needle);

  return [...h.players.values()]
    .filter((p) => fold(p.fullName).includes(needle))
    .map((p) => ({ p, v: values.get(p.playerId) }))
    .filter((row): row is { p: typeof row.p; v: ValueBreakdown } => !!row.v && row.v.value > 0)
    .sort((a, b) => {
      const aw = startsWith(a.p.fullName) ? 0 : 1;
      const bw = startsWith(b.p.fullName) ? 0 : 1;
      return aw - bw || b.v.value - a.v.value;
    })
    .slice(0, LIMIT)
    .map(({ p, v }) => ({
      kind: "player",
      id: p.playerId,
      name: p.fullName,
      team: p.team,
      position: p.position,
      age: p.age,
      value: v.value,
      tier: tierFor(v.value)?.label ?? "Fringe",
      injury: injuryLabel({
        status: p.injuryStatus,
        bodyPart: p.injuryBodyPart,
        notes: p.injuryNotes,
      }),
    }));
}

// ---------------------------------------------------------------- managers

async function searchManagers(h: LeagueHistory, needle: string): Promise<ManagerResult[]> {
  const principals = await getPrincipals(h);
  return principals.principals
    .filter(
      (p) =>
        fold(p.displayName).includes(needle) ||
        (p.teamName != null && fold(p.teamName).includes(needle)),
    )
    .slice(0, LIMIT)
    .map((p) => ({
      kind: "manager",
      id: p.ownerId,
      name: p.teamName ?? p.displayName,
      displayName: p.displayName,
      isFormer: p.isFormer,
      tenureLabel: tenureLabel(p) ?? null,
      avatar: p.avatar,
      teamLogoUrl: p.teamLogoUrl,
      // Mirrors the exact href logic in app/managers/page.tsx - a former principal
      // has no roster to point at, only their own frozen file.
      href: p.isFormer
        ? `/managers/former/${p.ownerId}`
        : `/managers/${p.currentRosterId ?? p.lastRosterId}`,
    }));
}

// ---------------------------------------------------------------- trades

function searchTrades(h: LeagueHistory, needle: string): TradeResult[] {
  return h.transactions
    .filter((t) => t.type === "trade")
    .map((t) => ({ t, description: describeTransaction(h, t) }))
    // The description already names every roster, player and pick in the deal, so
    // matching against it (plus the season) covers all three without a second pass.
    .filter(
      ({ t, description }) =>
        fold(description).includes(needle) || fold(t.season).includes(needle),
    )
    .sort((a, b) => b.t.created - a.t.created)
    .slice(0, LIMIT)
    .map(({ t, description }) => ({
      kind: "trade",
      id: t.transactionId,
      season: t.season,
      week: t.week,
      description,
    }));
}

// ---------------------------------------------------------------- picks

async function searchPicks(
  h: LeagueHistory,
  needle: string,
  index: DraftIndex,
): Promise<PickResult[]> {
  const seasons = await getDraftSeasons(h, { index });
  const made: PickResult[] = [];
  for (const s of seasons) {
    const board = await getDraftBoard(h, s.season, { index });
    for (const p of board.picks) {
      const label =
        `${s.season} ${ordinal(p.round)}` +
        (p.wasTraded && p.originalRosterName ? ` (orig. ${p.originalRosterName})` : "");
      const haystack = [label, p.playerName, p.usedByName, p.originalRosterName]
        .filter(Boolean)
        .join(" ");
      if (!fold(haystack).includes(needle)) continue;
      made.push({
        kind: "pick",
        id: `made-${s.season}-${p.pickNo}`,
        label,
        season: s.season,
        pickNo: p.pickNo,
        resolved: true,
        playerName: p.playerName,
        ownerName: p.usedByName ?? "Unclaimed",
        href: boardHref(s.season, p.pickNo),
      });
      if (made.length >= LIMIT) break;
    }
    if (made.length >= LIMIT) break;
  }

  // Future/traded-but-not-yet-drafted capital - already resolved picks are covered
  // above via the board (which also catches picks nobody ever traded), so this only
  // adds the "still in flight" half of the pick-lineage picture.
  const future: PickResult[] = [];
  if (made.length < LIMIT) {
    const lineages = await getTradedPickLineages(h, { index });
    for (const l of lineages) {
      if (l.resolved) continue;
      const haystack = [l.label, l.fromName, l.toName, l.currentOwnerName].join(" ");
      if (!fold(haystack).includes(needle)) continue;
      future.push({
        kind: "pick",
        id: `future-${l.season}-${l.round}-${l.originalRoster}`,
        label: l.label,
        season: l.season,
        pickNo: null,
        resolved: false,
        playerName: null,
        ownerName: l.currentOwnerName,
        href: boardHref(l.season, null),
      });
      if (made.length + future.length >= LIMIT) break;
    }
  }

  return [...made, ...future].slice(0, LIMIT);
}

// ---------------------------------------------------------------- route

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 64);

  if (!q) {
    return NextResponse.json({
      query: "",
      players: [],
      managers: [],
      trades: [],
      picks: [],
    } satisfies SearchResponse);
  }

  const needle = fold(q);
  const h = await getLeagueHistory();
  // Shared across getDraftSeasons/getDraftBoard/getTradedPickLineages so a search
  // that touches every season's draft still costs one index build, not four.
  const draftIndex = await buildDraftIndex(h);

  const [managers, picks] = await Promise.all([
    searchManagers(h, needle),
    searchPicks(h, needle, draftIndex),
  ]);
  const players = searchPlayers(h, needle);
  const trades = searchTrades(h, needle);

  return NextResponse.json({
    query: q,
    players,
    managers,
    trades,
    picks,
  } satisfies SearchResponse);
}
