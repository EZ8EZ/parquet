/**
 * TRADE GRAPH — the data behind the beta trade web.
 *
 * Two pure, serializable models over the same corpus:
 *
 *  1. `buildTradeGraph` — the league as a network. Nodes are PRINCIPALS (see
 *     lib/principals.ts), not roster seats: a roster that changed hands contributes
 *     one node per manager who actually sat in it, not one blended node for whoever
 *     holds it today. Edges are manager PAIRS that have traded, weighted by how many
 *     deals they've done, with each trade attributed to whoever actually held a seat
 *     THAT season - `PrincipalIndex.ownerAt` is the only correct way to turn a
 *     (season, rosterId) pair into a person, and a roster-keyed version would credit
 *     one manager's trades to whoever replaced them. Node positions are baked in here
 *     (a deterministic ring, seriated so frequent partners land next to each other) —
 *     the renderer draws, it never decides geometry, and there is no randomness or
 *     clock anywhere in this file.
 *
 *  2. `buildAssetMoves` + `buildTradeTree` — asset lineage. Every hop every player and
 *     pick took, from which a "what did trading him away actually become?" tree can
 *     be walked. Asset flow is tracked by ROSTER SEAT (a roster's belongings are a
 *     fact about the roster, not the person), but each hop also carries the PRINCIPAL
 *     who actually made that move, resolved once at build time via `ownerAt`, so a
 *     chain that happens to span a handover names the right manager at each hop
 *     instead of relabelling the whole history with whoever holds the seat today.
 *
 * MULTI-TEAM TRADES: a 3-team deal is one transaction with 3+ parties. It becomes one
 * edge per participating pair (3 pairs for 3 teams) and is flagged `multiTeam` so the
 * UI can say so. Parties are read from the union of `rosterIds`, `adds`, `drops` and
 * pick owners, because commissioner-reconstructed trades don't always agree with
 * `rosterIds` alone.
 */
import type { LeagueHistory } from "../history";
import type { Transaction } from "../providers/types";
import { deriveManagerProfile, type ManagerProfile } from "../derive/manager";
import { tenureLabel, tenureSeasons, type PrincipalIndex } from "../principals";
import {
  describeTradeForRoster,
  describeTransaction,
  pickLabel,
  rosterName,
} from "../derive/describe";

// ---------------------------------------------------------------- geometry

/**
 * Fixed SVG space. Everything scales via the viewBox, so these are unitless: at
 * 390px wide one unit is ~0.98px, which is what the node/label sizes are tuned for.
 */
export const RING = {
  size: 400,
  cx: 200,
  cy: 200,
  /**
   * Ring radius. Sized so the drawing fills ~90% of the box: at 390px the column
   * gives the SVG ~350px, and anything smaller makes the node tags unreadable.
   */
  r: 150,
  /** Largest drawn node radius (the busiest trader). */
  nodeR: 19,
  /** Invisible tap radius: 26 units ~ 46px wide at 390px, over the 44px minimum. */
  tapR: 26,
} as const;

// ---------------------------------------------------------------- types

export interface TradeGraphNode {
  /** Stable identity: the platform user id (Principal.ownerId). Never shared, even
   *  across a handover - a departed and a current manager can share a rosterId, but
   *  never this. */
  ownerId: string;
  /** The roster they hold now, or the last one they held if they've left. Kept for
   *  `TeamAvatar`/ring-math continuity and for routing a CURRENT principal's dossier
   *  link - it is not the identity key, `ownerId` is. */
  rosterId: number;
  /** Team name if set, else the Sleeper handle. */
  name: string;
  handle: string;
  /** <=3 characters, drawn inside the node. Unique across the league. */
  abbr: string;
  /** Deals this manager has been part of (from the dossier derivation, scoped to
   *  their own tenure when any roster in the league has changed hands). */
  trades: number;
  /** Distinct managers they've traded with. */
  partners: number;
  /** Net picks acquired minus spent, for the focus panel. */
  picksNet: number;
  isMe: boolean;
  /** For `TeamAvatar` - same imagery every other page uses for this manager. */
  avatarId: string | null;
  teamLogoUrl: string | null;
  /** No longer holds a roster in the league. */
  isFormer: boolean;
  /** e.g. "2022-2024". Set only when `isFormer` - nothing to date-range for a current
   *  manager. See `lib/principals.ts#tenureLabel`. */
  tenureLabel: string | undefined;
  /** Position on the ring, in the `RING` coordinate space. */
  x: number;
  y: number;
}

export interface TradeSideText {
  rosterId: number;
  name: string;
  /** e.g. "acquired Devin Booker for Jordan Poole". */
  text: string;
}

export interface TradeRecord {
  id: string;
  season: string;
  week: number;
  created: number;
  /** Roster seats that were party to this trade. */
  parties: number[];
  /** The same parties, resolved to the PRINCIPAL who actually held each seat during
   *  `season` - the correct key for grouping this trade into an edge. Deduplicated;
   *  usually the same length as `parties`, but collapses if a seat somehow resolved
   *  to the same owner twice. */
  ownerParties: string[];
  multiTeam: boolean;
  /** Neutral, perspective-free summary. */
  summary: string;
  sides: TradeSideText[];
  /**
   * True when at least one pick on this trade was inferred rather than recorded
   * (commissioner-executed deals lose their pick data). The "(inferred)" marker is
   * already inside the pick labels; this flag lets the UI say so up front too.
   */
  hasInferredPicks: boolean;
}

export interface TradeGraphEdge {
  /** `${a}-${b}` with a < b lexicographically. `a`/`b` are owner ids, not roster ids -
   *  a roster that changed hands needs to distinguish "traded with the old guy" from
   *  "traded with the new guy" and a roster-id key cannot do that. */
  key: string;
  a: string;
  b: string;
  /** Number of deals between the pair. */
  count: number;
  tradeIds: string[];
  /** Seasons the pair traded in, ascending. */
  seasons: string[];
}

export interface TradeGraph {
  nodes: TradeGraphNode[];
  edges: TradeGraphEdge[];
  trades: TradeRecord[];
  /** Every season in the league chain, ascending. */
  seasons: string[];
  maxEdgeCount: number;
  totalTrades: number;
  /** n*(n-1)/2 over PRINCIPALS, not rosters - how many pairings could exist. */
  possiblePairs: number;
  multiTeamCount: number;
  meRosterId: number | null;
  /**
   * False if the dossier-derived edge weight ever disagreed with the number of
   * deals found for that pair. Surfaced rather than silently reconciled.
   *
   * A roster that has changed hands makes this comparison inherently one-sided: a
   * STABLE partner's own dossier still reports one blended trade count against
   * "roster 11" across both managers who ever held it (`deriveManagerProfile`'s
   * partner counts are roster-keyed and this file does not change that), while the
   * web now draws two separate, correctly-attributed edges for the same pair of
   * trades. That produces a legitimate, expected `false` here for edges touching a
   * succeeded roster - it is not a bug, it is the thing this file exists to fix. A
   * league with no successions still gets a hard guarantee of agreement.
   */
  weightsAgree: boolean;
}

/**
 * A manager's CURRENT read on the two proprietary metrics, attached wherever the web
 * or a trade tree names them. Optional fields are null rather than absent so a
 * consumer can render "not enough data" instead of silently omitting the row -
 * matches how both metrics already degrade on their own pages.
 *
 * Both metrics are properties of a roster AS IT STANDS TONIGHT, so a departed
 * principal has nothing here - callers must not look this up by a former principal's
 * last roster id, which belongs to whoever replaced them now.
 */
export interface ManagerMetric {
  tci: number;
  posture: "contending" | "ascending" | "rebuilding" | "straddling";
  rosterDuration: number;
  fragility: number | null;
  fragilityBand: "resilient" | "balanced" | "brittle" | null;
}

/** A traded player's CURRENT standing, not what they were worth at trade time. */
export interface PlayerNow {
  team: string | null;
  value: number;
  tier: string;
  /** Seasons from now the player's own value arrives, on average. */
  duration: number;
  /** Roster currently holding them, or null if no longer in the league. */
  heldBy: number | null;
}

export type AssetKind = "player" | "pick";

/** One hop of one asset, in one trade. */
export interface AssetMove {
  /** `${tradeId}|${assetKey}` — stable and unique. */
  id: string;
  /** `p:<playerId>` or `k:<season>-<round>-<originalRoster>`. */
  assetKey: string;
  kind: AssetKind;
  /** Player name, or a pick label that already carries any "(inferred)" marker. */
  label: string;
  /** For a pick that has since been used: the player it became. */
  became: string | null;
  inferred: boolean;
  tradeId: string;
  season: string;
  week: number;
  created: number;
  /** Roster seats. Asset flow is tracked by SEAT, not by manager - a roster's
   *  belongings are a fact about the roster, and that is what makes a chain that
   *  spans a handover keep making sense as one lineage. */
  from: number;
  to: number;
  /** The PRINCIPAL who actually made this hop, resolved via `ownerAt(season, from/
   *  to)` at build time - who was in the seat THAT season, not who holds it now. */
  fromOwnerId: string | null;
  toOwnerId: string | null;
}

export interface TradeTreeNode {
  id: string;
  assetKey: string;
  label: string;
  kind: AssetKind;
  became: string | null;
  inferred: boolean;
  season: string;
  week: number;
  tradeId: string;
  from: number;
  to: number;
  fromOwnerId: string | null;
  toOwnerId: string | null;
  /** "out" = left the tracked manager, "in" = came back to them. */
  direction: "out" | "in";
  /** Where this branch ended: still held, released, flipped on, cap reached. */
  outcome: string | null;
  children: TradeTreeNode[];
}

export interface TradeRoot {
  moveId: string;
  assetKey: string;
  label: string;
  kind: AssetKind;
  /** The seat that gave the asset up — the tree is told from their side. */
  owner: number;
  /** The principal who actually gave it up, resolved at that season. */
  ownerId: string | null;
  season: string;
  /** Total nodes in the resulting tree, i.e. how much of a story it is. */
  size: number;
  depth: number;
}

// ---------------------------------------------------------------- helpers

/** Every roster a trade touches. `rosterIds` alone can miss a party. */
export function tradeParties(t: Transaction): number[] {
  const s = new Set<number>(t.rosterIds);
  for (const r of Object.values(t.adds)) s.add(r);
  for (const r of Object.values(t.drops)) s.add(r);
  for (const dp of t.draftPicks) {
    s.add(dp.ownerId);
    s.add(dp.previousOwnerId);
  }
  return [...s].sort((x, y) => x - y);
}

/**
 * A <=3 character tag for the ring. Initials for multi-word names, else the first
 * three characters. Collisions are broken deterministically by iteration order.
 */
export function abbreviate(name: string, taken: Set<string>): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let base: string;
  if (words.length > 1) {
    base = words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
  } else {
    base = (words[0] ?? name).slice(0, 3).toUpperCase();
  }
  base = base || "?";
  let out = base;
  let n = 2;
  while (taken.has(out)) {
    out = `${base.slice(0, 2)}${n}`;
    n++;
  }
  taken.add(out);
  return out;
}

/**
 * Order nodes around the ring so heavily-trading pairs sit close together, which is
 * what makes cliques legible instead of a hairball of chords.
 *
 * Deterministic: a weight-sorted seed order, then first-improvement pairwise-swap
 * descent on Σ weight × circular-step-distance. No randomness, no clock. Generic over
 * the id type so it works equally for roster ids (tests exercise it directly with
 * plain numbers) and the owner-id strings the trade graph now keys nodes by - the
 * default tie-break compares ids with `<`/`>`, which does the right thing for both.
 */
export function ringOrder<T>(
  ids: T[],
  weight: (a: T, b: T) => number,
  compare: (a: T, b: T) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0),
): T[] {
  const n = ids.length;
  if (n < 3) return [...ids];

  const total = new Map<T, number>();
  for (const a of ids) {
    let s = 0;
    for (const b of ids) if (a !== b) s += weight(a, b);
    total.set(a, s);
  }
  // Seed: busiest traders first, ties broken deterministically.
  const order = [...ids].sort(
    (a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0) || compare(a, b),
  );

  const step = (i: number, j: number) => {
    const d = Math.abs(i - j);
    return Math.min(d, n - d);
  };
  const cost = (arr: T[]) => {
    let c = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const w = weight(arr[i], arr[j]);
        if (w) c += w * step(i, j);
      }
    }
    return c;
  };

  let best = cost(order);
  for (let pass = 0; pass < 200; pass++) {
    let improved = false;
    for (let i = 0; i < n && !improved; i++) {
      for (let j = i + 1; j < n; j++) {
        [order[i], order[j]] = [order[j], order[i]];
        const c = cost(order);
        if (c < best) {
          best = c;
          improved = true;
          break;
        }
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    if (!improved) break;
  }
  return order;
}

// ---------------------------------------------------------------- graph

/**
 * Builds the trade web. `principals` is the caller's one `getPrincipals(h)` fetch
 * (see lib/principals.ts) - this file never fetches it itself, so a page that needs
 * both the graph and something else keyed by principal (e.g. the manager metrics)
 * only pays for the succession lookup once.
 */
export function buildTradeGraph(h: LeagueHistory, principals: PrincipalIndex): TradeGraph {
  const tradesRaw = h.transactions.filter((t) => t.type === "trade");

  // One behavioural profile per PRINCIPAL, confined to their own tenure when any
  // roster in this league has changed hands - the exact conditional lib/superlatives
  // uses, so a league with no handovers produces byte-identical numbers to the old
  // roster-keyed derivation, and a handover splits one blended profile into two real
  // ones instead of averaging two people together.
  const profiles = new Map<string, ManagerProfile>();
  for (const pr of principals.principals) {
    const rosterId = pr.currentRosterId ?? pr.lastRosterId;
    profiles.set(
      pr.ownerId,
      deriveManagerProfile(h, rosterId, {
        ownerId: pr.ownerId,
        displayName: pr.displayName,
        teamName: pr.teamName,
        seasons: principals.hasSuccessions ? tenureSeasons(pr, rosterId) : undefined,
      }),
    );
  }

  // Deals per pair, from the trades themselves (this is what the UI lists) - grouped
  // by PRINCIPAL, resolved trade-by-trade via ownerAt rather than assumed from the
  // roster ids alone, which is what lets a single roster's history split cleanly
  // across a handover instead of crediting every trade it was ever part of to
  // whoever holds the seat today.
  const pairTrades = new Map<string, { a: string; b: string; ids: string[] }>();
  const pairSeasons = new Map<string, Set<string>>();
  const records: TradeRecord[] = [];
  let multiTeamCount = 0;

  for (const t of tradesRaw) {
    const parties = tradeParties(t);
    const multiTeam = parties.length > 2;
    if (multiTeam) multiTeamCount++;

    const ownerParties = [
      ...new Set(
        parties
          .map((rid) => principals.ownerAt(t.season, rid))
          .filter((x): x is string => x != null),
      ),
    ].sort();

    records.push({
      id: t.transactionId,
      season: t.season,
      week: t.week,
      created: t.created,
      parties,
      ownerParties,
      multiTeam,
      summary: describeTransaction(h, t),
      sides: parties.map((rid) => {
        const ownerId = principals.ownerAt(t.season, rid);
        const pr = ownerId ? principals.byOwnerId.get(ownerId) : undefined;
        return {
          rosterId: rid,
          // A principal's own team name/handle from THAT season beats the roster's
          // current label, which would otherwise say the successor's name for a
          // trade the departed manager actually made.
          name: pr ? pr.teamName || pr.displayName : rosterName(h, rid),
          text: describeTradeForRoster(h, t, rid),
        };
      }),
      hasInferredPicks: t.draftPicks.some((dp) => dp.inferred === true),
    });

    for (let i = 0; i < ownerParties.length; i++) {
      for (let j = i + 1; j < ownerParties.length; j++) {
        const a = ownerParties[i];
        const b = ownerParties[j];
        const key = pairEdgeKey(a, b);
        const entry = pairTrades.get(key) ?? { a, b, ids: [] };
        entry.ids.push(t.transactionId);
        pairTrades.set(key, entry);
        (
          pairSeasons.get(key) ?? pairSeasons.set(key, new Set()).get(key)!
        ).add(t.season);
      }
    }
  }

  // Sanity cross-check against the dossier derivation - see the caveat on
  // `weightsAgree` above for what this can and cannot promise once a roster has
  // changed hands.
  const effectiveRosterOf = new Map<string, number>(
    principals.principals.map((pr) => [pr.ownerId, pr.currentRosterId ?? pr.lastRosterId]),
  );
  const profileWeight = (ownerA: string, rosterB: number) =>
    profiles.get(ownerA)?.tradePartners.find((p) => p.rosterId === rosterB)?.count ?? 0;

  let weightsAgree = true;
  const edges: TradeGraphEdge[] = [];
  for (const [key, { a, b, ids }] of pairTrades) {
    const rosterA = effectiveRosterOf.get(a);
    const rosterB = effectiveRosterOf.get(b);
    const derived =
      rosterA != null && rosterB != null
        ? Math.max(profileWeight(a, rosterB), profileWeight(b, rosterA))
        : 0;
    if (derived !== ids.length) weightsAgree = false;
    edges.push({
      key,
      a,
      b,
      count: Math.max(derived, ids.length),
      tradeIds: ids,
      seasons: [...(pairSeasons.get(key) ?? [])].sort(),
    });
  }
  edges.sort((x, y) => y.count - x.count || x.key.localeCompare(y.key));

  // Ring layout, seriated on the same weights.
  const w = new Map(edges.map((e) => [e.key, e.count]));
  const weight = (a: string, b: string) => w.get(pairEdgeKey(a, b)) ?? 0;
  const ownerIds = principals.principals.map((pr) => pr.ownerId);
  const order = ringOrder(ownerIds, weight);

  const taken = new Set<string>();
  const nodeByOwner = new Map<string, TradeGraphNode>();
  for (const pr of principals.principals) {
    const p = profiles.get(pr.ownerId)!;
    const rosterId = pr.isFormer ? pr.lastRosterId : (pr.currentRosterId as number);
    const name = pr.teamName || pr.displayName;
    nodeByOwner.set(pr.ownerId, {
      ownerId: pr.ownerId,
      rosterId,
      name,
      handle: pr.displayName,
      abbr: abbreviate(name, taken),
      trades: p.trades,
      partners: p.tradePartners.length,
      picksNet: p.picks.net,
      isMe: pr.ownerId === h.me.userId,
      avatarId: pr.avatar,
      teamLogoUrl: pr.teamLogoUrl,
      isFormer: pr.isFormer,
      tenureLabel: tenureLabel(pr),
      x: 0,
      y: 0,
    });
  }
  const n = order.length;
  order.forEach((ownerId, i) => {
    // Start at the top and go clockwise.
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const node = nodeByOwner.get(ownerId)!;
    node.x = round2(RING.cx + RING.r * Math.cos(angle));
    node.y = round2(RING.cy + RING.r * Math.sin(angle));
  });

  return {
    // Ring order, so the renderer can draw in place without re-sorting.
    nodes: order.map((ownerId) => nodeByOwner.get(ownerId)!),
    edges,
    trades: records,
    seasons: h.chain.map((c) => c.season),
    maxEdgeCount: edges.reduce((m, e) => Math.max(m, e.count), 0),
    totalTrades: tradesRaw.length,
    possiblePairs: (ownerIds.length * (ownerIds.length - 1)) / 2,
    multiTeamCount,
    meRosterId: h.me.rosterId,
    weightsAgree,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------- asset moves

/**
 * The canonical key for the strand between two managers, order-independent: a pair has
 * one key however you name it. Three call sites were building this by hand (the edge
 * fold below, the ring weight lookup, and the web's own partner rows), which is one
 * convention too many for something a URL now has to round-trip.
 */
export function pairEdgeKey(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export const playerKey = (playerId: string) => `p:${playerId}`;
export const pickKey = (season: string, round: number, orig: number) =>
  `k:${season}-${round}-${orig}`;
/** Recovers the player id from a player-kind asset key. Null for a pick. */
export const assetPlayerId = (assetKey: string): string | null =>
  assetKey.startsWith("p:") ? assetKey.slice(2) : null;

/**
 * Every hop of every asset that moved in a trade, chronological.
 *
 * `pickPlayers` maps a pick's asset key to the player it became (resolved by
 * `lib/lineage`), which is how a pick chain keeps going past the draft.
 *
 * Each hop also carries `fromOwnerId`/`toOwnerId`, the principal actually holding
 * that seat during the hop's own season - resolved once here via `ownerAt` so
 * `buildTradeTree` never has to guess who a roster id "means" at a given point in the
 * chain.
 */
export function buildAssetMoves(
  h: LeagueHistory,
  principals: PrincipalIndex,
  pickPlayers: Record<string, string> = {},
): AssetMove[] {
  const out: AssetMove[] = [];
  for (const t of h.transactions) {
    if (t.type !== "trade") continue;

    for (const [pid, to] of Object.entries(t.adds)) {
      const from = t.drops[pid];
      // Without a recorded origin the asset can't be chained to a giver.
      if (from == null || from === to) continue;
      const key = playerKey(pid);
      out.push({
        id: `${t.transactionId}|${key}`,
        assetKey: key,
        kind: "player",
        label: h.players.get(pid)?.fullName ?? `Player ${pid}`,
        became: null,
        inferred: false,
        tradeId: t.transactionId,
        season: t.season,
        week: t.week,
        created: t.created,
        from,
        to,
        fromOwnerId: principals.ownerAt(t.season, from),
        toOwnerId: principals.ownerAt(t.season, to),
      });
    }

    for (const dp of t.draftPicks) {
      if (dp.ownerId === dp.previousOwnerId) continue;
      const key = pickKey(dp.season, dp.round, dp.rosterId);
      out.push({
        id: `${t.transactionId}|${key}`,
        assetKey: key,
        kind: "pick",
        // pickLabel already carries "(inferred)" when the pick was inferred.
        // Origin qualifier per the /drafts lineage convention: a pick moving on
        // from someone other than its original roster names where it came from,
        // so two same-round pick nodes in one strand stay distinguishable.
        label: pickLabel(
          dp,
          dp.rosterId !== dp.previousOwnerId ? rosterName(h, dp.rosterId) : null,
        ),
        became: pickPlayers[key] ?? null,
        inferred: dp.inferred === true,
        tradeId: t.transactionId,
        season: t.season,
        week: t.week,
        // The event time is the trade's, not the pick's own season.
        created: t.created,
        from: dp.previousOwnerId,
        to: dp.ownerId,
        fromOwnerId: principals.ownerAt(t.season, dp.previousOwnerId),
        toOwnerId: principals.ownerAt(t.season, dp.ownerId),
      });
    }
  }

  return out.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
}

/** playerId -> the roster currently holding them. */
export function buildHoldings(h: LeagueHistory): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of h.rosters) for (const pid of r.players) out[pid] = r.rosterId;
  return out;
}

// ---------------------------------------------------------------- trade trees

export interface TreeContext {
  moves: AssetMove[];
  /** playerId -> roster currently holding them. */
  holdings: Record<string, number>;
  /** rosterId -> CURRENT display name. Only for "still on X"/"now on X" in a terminal
   *  outcome - who holds a roster TODAY, never who held it at some past hop. Must be
   *  built from CURRENT principals only: a departed principal's last roster id is
   *  someone else's seat now, and keying this off them would show their name for
   *  what is actually the successor's roster. */
  names: Record<number, string>;
  /** ownerId -> display name. A principal's own name never changes, only which
   *  roster they occupy over time, so this needs no season dimension by itself - pair
   *  it with a move's `fromOwnerId`/`toOwnerId` (already resolved at the correct
   *  season by `buildAssetMoves`) to name any historical hop correctly, e.g. the
   *  departing manager for a pre-handover hop and the successor for a post-handover
   *  one, even within the same chain. */
  ownerNames: Record<string, string>;
  maxDepth?: number;
}

interface TreeIndex {
  byTrade: Map<string, AssetMove[]>;
  byAsset: Map<string, AssetMove[]>;
}

function indexMoves(moves: AssetMove[]): TreeIndex {
  const byTrade = new Map<string, AssetMove[]>();
  const byAsset = new Map<string, AssetMove[]>();
  for (const m of moves) {
    (byTrade.get(m.tradeId) ?? byTrade.set(m.tradeId, []).get(m.tradeId)!).push(m);
    (
      byAsset.get(m.assetKey) ?? byAsset.set(m.assetKey, []).get(m.assetKey)!
    ).push(m);
  }
  return { byTrade, byAsset };
}

const DEFAULT_DEPTH = 4;

/**
 * "I gave up X. What do I have to show for it now?"
 *
 * The root is one asset leaving one roster SEAT. Its children are what that seat got
 * back in the same deal; each of those, if it was later traded on by the same seat,
 * hangs the next deal's return underneath it. Branches end when the asset is still on
 * the roster, was released, became a drafted player, or the depth cap is hit — and
 * the outcome is always stated rather than left blank.
 *
 * Asset flow is tracked by SEAT (a roster's belongings are a fact about the roster),
 * but every outcome sentence names the PRINCIPAL who actually made that hop, resolved
 * at the hop's own season - so a chain spanning a handover correctly credits the
 * departing manager for their hops and the successor for theirs, never blending the
 * two or relabelling history with whoever holds the seat today.
 */
export function buildTradeTree(
  ctx: TreeContext,
  rootMoveId: string,
): TradeTreeNode | null {
  const idx = indexMoves(ctx.moves);
  const root = ctx.moves.find((m) => m.id === rootMoveId);
  if (!root) return null;
  const maxDepth = ctx.maxDepth ?? DEFAULT_DEPTH;
  const owner = root.from;
  const name = (rid: number) => ctx.names[rid] ?? `Roster ${rid}`;
  // Historical attribution for an outcome sentence: whoever actually held the seat
  // at the hop's own season, falling back to the roster's current name only when an
  // owner id couldn't be resolved (a provider with no per-season data degrades to the
  // old roster-keyed behaviour rather than dropping the fact - see lib/principals.ts).
  const ownerName = (ownerId: string | null, fallbackRosterId: number) =>
    (ownerId && ctx.ownerNames[ownerId]) || name(fallbackRosterId);

  /** What `owner` received in a given trade. */
  const returns = (tradeId: string) =>
    (idx.byTrade.get(tradeId) ?? [])
      .filter((m) => m.to === owner)
      .sort((a, b) => a.label.localeCompare(b.label));

  /** The next time `owner` sent this asset back out. */
  const nextOut = (assetKey: string, after: number) =>
    (idx.byAsset.get(assetKey) ?? []).find(
      (m) => m.from === owner && m.created > after,
    );

  const terminal = (m: AssetMove): string => {
    if (m.kind === "pick") {
      return m.became ? `used on ${m.became}` : "pick not used yet";
    }
    const pid = m.assetKey.slice(2);
    const held = ctx.holdings[pid];
    if (held === owner) return `still on ${name(owner)}`;
    if (held != null) return `now on ${name(held)}`;
    return "no longer in the league";
  };

  const seen = new Set<string>([`${root.assetKey}|${root.tradeId}`]);

  const visit = (m: AssetMove, depth: number, path: string): TradeTreeNode => {
    const node: TradeTreeNode = {
      id: path,
      assetKey: m.assetKey,
      label: m.label,
      kind: m.kind,
      became: m.kind === "pick" ? m.became : null,
      inferred: m.inferred,
      season: m.season,
      week: m.week,
      tradeId: m.tradeId,
      from: m.from,
      to: m.to,
      fromOwnerId: m.fromOwnerId,
      toOwnerId: m.toOwnerId,
      direction: "in",
      outcome: null,
      children: [],
    };
    const onward = nextOut(m.assetKey, m.created);
    if (!onward) {
      node.outcome = terminal(m);
      return node;
    }
    const stamp = `${onward.assetKey}|${onward.tradeId}`;
    if (depth >= maxDepth || seen.has(stamp)) {
      node.outcome = `flipped in ${onward.season} to ${ownerName(onward.toOwnerId, onward.to)} - chain continues`;
      return node;
    }
    seen.add(stamp);
    node.outcome = `flipped in ${onward.season} to ${ownerName(onward.toOwnerId, onward.to)}`;
    node.children = returns(onward.tradeId).map((r, i) =>
      visit(r, depth + 1, `${path}.${i}`),
    );
    return node;
  };

  return {
    id: "root",
    assetKey: root.assetKey,
    label: root.label,
    kind: root.kind,
    became: root.kind === "pick" ? root.became : null,
    inferred: root.inferred,
    season: root.season,
    week: root.week,
    tradeId: root.tradeId,
    from: root.from,
    to: root.to,
    fromOwnerId: root.fromOwnerId,
    toOwnerId: root.toOwnerId,
    direction: "out",
    outcome: `sent to ${ownerName(root.toOwnerId, root.to)} in ${root.season}`,
    children: returns(root.tradeId).map((r, i) => visit(r, 1, `r${i}`)),
  };
}

export function countTreeNodes(node: TradeTreeNode): number {
  return 1 + node.children.reduce((s, c) => s + countTreeNodes(c), 0);
}

export function treeDepth(node: TradeTreeNode): number {
  return node.children.length === 0
    ? 1
    : 1 + Math.max(...node.children.map(treeDepth));
}

/**
 * Every asset departure worth offering as a tree root, best story first.
 *
 * One root per (asset, seat that gave it up), keeping the FIRST departure, since
 * that's where the lineage actually starts.
 */
export function rankTradeRoots(ctx: TreeContext): TradeRoot[] {
  const firstByPair = new Map<string, AssetMove>();
  for (const m of ctx.moves) {
    const k = `${m.assetKey}|${m.from}`;
    if (!firstByPair.has(k)) firstByPair.set(k, m);
  }
  const roots: TradeRoot[] = [];
  for (const m of firstByPair.values()) {
    const tree = buildTradeTree(ctx, m.id);
    if (!tree) continue;
    roots.push({
      moveId: m.id,
      assetKey: m.assetKey,
      label: m.label,
      kind: m.kind,
      owner: m.from,
      ownerId: m.fromOwnerId,
      season: m.season,
      size: countTreeNodes(tree),
      depth: treeDepth(tree),
    });
  }
  return roots.sort(
    (a, b) =>
      b.size - a.size ||
      b.depth - a.depth ||
      a.label.localeCompare(b.label) ||
      a.moveId.localeCompare(b.moveId),
  );
}
