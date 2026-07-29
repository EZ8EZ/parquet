/**
 * TRADE GRAPH — the data behind the beta trade web.
 *
 * Two pure, serializable models over the same corpus:
 *
 *  1. `buildTradeGraph` — the league as a network. Nodes are the managers, edges are
 *     manager PAIRS that have traded, weighted by how many deals they've done. Edge
 *     weights come from the existing `deriveManagerProfile().tradePartners`
 *     derivation rather than a fresh recount, so the web can never disagree with the
 *     dossiers. Node positions are baked in here (a deterministic ring, seriated so
 *     frequent partners land next to each other) — the renderer draws, it never
 *     decides geometry, and there is no randomness or clock anywhere in this file.
 *
 *  2. `buildAssetMoves` + `buildTradeTree` — asset lineage. Every hop every player and
 *     pick took, from which a "what did trading him away actually become?" tree can
 *     be walked. The moves list is the only thing that has to cross the wire; the
 *     trees are rebuilt from it on demand, so switching roots costs nothing.
 *
 * MULTI-TEAM TRADES: a 3-team deal is one transaction with 3+ parties. It becomes one
 * edge per participating pair (3 pairs for 3 teams) and is flagged `multiTeam` so the
 * UI can say so. Parties are read from the union of `rosterIds`, `adds`, `drops` and
 * pick owners, because commissioner-reconstructed trades don't always agree with
 * `rosterIds` alone.
 */
import type { LeagueHistory } from "../history";
import type { Transaction } from "../providers/types";
import { deriveManagerProfile } from "../derive/manager";
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
  /** Ring radius. Leaves room for the outer tap ring and the abbreviation. */
  r: 128,
  /** Drawn node radius. */
  nodeR: 15,
  /** Invisible tap radius: 23 units ~ 45px at 390px, clearing the 44px minimum. */
  tapR: 23,
} as const;

// ---------------------------------------------------------------- types

export interface TradeGraphNode {
  rosterId: number;
  /** Team name if set, else the Sleeper handle. */
  name: string;
  handle: string;
  /** <=3 characters, drawn inside the node. Unique across the league. */
  abbr: string;
  /** Deals this manager has been part of (from the dossier derivation). */
  trades: number;
  /** Distinct managers they've traded with. */
  partners: number;
  /** Net picks acquired minus spent, for the focus panel. */
  picksNet: number;
  isMe: boolean;
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
  parties: number[];
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
  /** `${a}-${b}` with a < b. */
  key: string;
  a: number;
  b: number;
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
  /** n*(n-1)/2 — how many pairings could exist. */
  possiblePairs: number;
  multiTeamCount: number;
  meRosterId: number | null;
  /**
   * False if the dossier-derived edge weight ever disagreed with the number of
   * deals found for that pair. Surfaced rather than silently reconciled.
   */
  weightsAgree: boolean;
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
  from: number;
  to: number;
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
  /** The manager who gave the asset up — the tree is told from their side. */
  owner: number;
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
 * three characters. Collisions are broken deterministically by roster id order.
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
 * descent on Σ weight × circular-step-distance. No randomness, no clock.
 */
export function ringOrder(
  ids: number[],
  weight: (a: number, b: number) => number,
): number[] {
  const n = ids.length;
  if (n < 3) return [...ids];

  const total = new Map<number, number>();
  for (const a of ids) {
    let s = 0;
    for (const b of ids) if (a !== b) s += weight(a, b);
    total.set(a, s);
  }
  // Seed: busiest traders first, ties by roster id.
  const order = [...ids].sort(
    (a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0) || a - b,
  );

  const step = (i: number, j: number) => {
    const d = Math.abs(i - j);
    return Math.min(d, n - d);
  };
  const cost = (arr: number[]) => {
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

export function buildTradeGraph(h: LeagueHistory): TradeGraph {
  const trades = h.transactions.filter((t) => t.type === "trade");
  const rosterIds = h.rosters.map((r) => r.rosterId).sort((a, b) => a - b);

  // Edge weights + node counts come from the existing dossier derivation.
  const profiles = new Map(
    rosterIds.map((rid) => [rid, deriveManagerProfile(h, rid)] as const),
  );
  const profileWeight = (a: number, b: number) =>
    profiles.get(a)?.tradePartners.find((p) => p.rosterId === b)?.count ?? 0;

  // Deals per pair, from the trades themselves (this is what the UI lists).
  const pairTrades = new Map<string, string[]>();
  const pairSeasons = new Map<string, Set<string>>();
  const records: TradeRecord[] = [];
  let multiTeamCount = 0;

  for (const t of trades) {
    const parties = tradeParties(t);
    const multiTeam = parties.length > 2;
    if (multiTeam) multiTeamCount++;
    records.push({
      id: t.transactionId,
      season: t.season,
      week: t.week,
      created: t.created,
      parties,
      multiTeam,
      summary: describeTransaction(h, t),
      sides: parties.map((rid) => ({
        rosterId: rid,
        name: rosterName(h, rid),
        text: describeTradeForRoster(h, t, rid),
      })),
      hasInferredPicks: t.draftPicks.some((dp) => dp.inferred === true),
    });
    for (let i = 0; i < parties.length; i++) {
      for (let j = i + 1; j < parties.length; j++) {
        const key = `${parties[i]}-${parties[j]}`;
        (pairTrades.get(key) ?? pairTrades.set(key, []).get(key)!).push(
          t.transactionId,
        );
        (
          pairSeasons.get(key) ?? pairSeasons.set(key, new Set()).get(key)!
        ).add(t.season);
      }
    }
  }

  let weightsAgree = true;
  const edges: TradeGraphEdge[] = [];
  for (const [key, ids] of pairTrades) {
    const [a, b] = key.split("-").map(Number);
    // Symmetrised: the derivation is computed per manager, so read both directions.
    const derived = Math.max(profileWeight(a, b), profileWeight(b, a));
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
  const weight = (a: number, b: number) =>
    w.get(a < b ? `${a}-${b}` : `${b}-${a}`) ?? 0;
  const order = ringOrder(rosterIds, weight);

  const taken = new Set<string>();
  const nodeByRoster = new Map<number, TradeGraphNode>();
  for (const rid of rosterIds) {
    const p = profiles.get(rid)!;
    const name = rosterName(h, rid);
    nodeByRoster.set(rid, {
      rosterId: rid,
      name,
      handle: p.displayName,
      abbr: abbreviate(name, taken),
      trades: p.trades,
      partners: p.tradePartners.length,
      picksNet: p.picks.net,
      isMe: h.me.rosterId === rid,
      x: 0,
      y: 0,
    });
  }
  const n = order.length;
  order.forEach((rid, i) => {
    // Start at the top and go clockwise.
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const node = nodeByRoster.get(rid)!;
    node.x = round2(RING.cx + RING.r * Math.cos(angle));
    node.y = round2(RING.cy + RING.r * Math.sin(angle));
  });

  return {
    // Ring order, so the renderer can draw in place without re-sorting.
    nodes: order.map((rid) => nodeByRoster.get(rid)!),
    edges,
    trades: records,
    seasons: h.chain.map((c) => c.season),
    maxEdgeCount: edges.reduce((m, e) => Math.max(m, e.count), 0),
    totalTrades: trades.length,
    possiblePairs: (rosterIds.length * (rosterIds.length - 1)) / 2,
    multiTeamCount,
    meRosterId: h.me.rosterId,
    weightsAgree,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------- asset moves

export const playerKey = (playerId: string) => `p:${playerId}`;
export const pickKey = (season: string, round: number, orig: number) =>
  `k:${season}-${round}-${orig}`;

/**
 * Every hop of every asset that moved in a trade, chronological.
 *
 * `pickPlayers` maps a pick's asset key to the player it became (resolved by
 * `lib/lineage`), which is how a pick chain keeps going past the draft.
 */
export function buildAssetMoves(
  h: LeagueHistory,
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
        label: pickLabel(dp),
        became: pickPlayers[key] ?? null,
        inferred: dp.inferred === true,
        tradeId: t.transactionId,
        season: t.season,
        week: t.week,
        // The event time is the trade's, not the pick's own season.
        created: t.created,
        from: dp.previousOwnerId,
        to: dp.ownerId,
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
  /** rosterId -> display name. */
  names: Record<number, string>;
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
 * The root is one asset leaving one manager. Its children are what that manager got
 * back in the same deal; each of those, if it was later traded on by the same
 * manager, hangs the next deal's return underneath it. Branches end when the asset
 * is still on the roster, was released, became a drafted player, or the depth cap is
 * hit — and the outcome is always stated rather than left blank.
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
      node.outcome = `flipped in ${onward.season} to ${name(onward.to)} - chain continues`;
      return node;
    }
    seen.add(stamp);
    node.outcome = `flipped in ${onward.season} to ${name(onward.to)}`;
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
    direction: "out",
    outcome: `sent to ${name(root.to)} in ${root.season}`,
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
 * One root per (asset, manager who gave it up), keeping the FIRST departure, since
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
