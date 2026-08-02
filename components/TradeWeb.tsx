"use client";

/**
 * TRADE WEB (beta) — the league's trade history as something you can poke at.
 *
 * Two modes over one dataset:
 *   WEB   a ring of the 14 managers with a strand for every pair that has traded,
 *         thickness = number of deals. Tap a manager to focus them, tap a strand to
 *         read the actual deals, filter by season to watch alliances form and die.
 *   TREES one asset's lineage: what you gave up, what came back, and what THAT
 *         became. Picks resolve to the player they were spent on.
 *
 * Hand-rolled inline SVG, no chart library (DECISIONS D3), and no randomness: the
 * ring geometry is computed deterministically in lib/tradegraph and shipped with the
 * data, so this file only draws.
 *
 * Every view here is addressable: mode, season filter, the focused manager or pair,
 * one specific deal, and the trees root all live in the query string rather than in
 * component state, so anything you are looking at reloads, bookmarks and pastes.
 * That is also what gives a deal a URL at all - see lib/tradegraph/url.ts, which is
 * the only place the mapping is defined and the thing global search links a trade
 * result at.
 *
 * Mobile-first: one 400-unit-square viewBox that scales to the column width, 45px
 * tap circles on every node, abbreviations inside the nodes with full names in the
 * panel, and every strand also reachable as a button in the list underneath — which
 * doubles as the screen-reader path, since a ring of chords is not one.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronRight,
  CornerDownRight,
  FlaskConical,
  GitBranch,
  Info,
  Layers,
  Network,
  Search,
  X,
} from "lucide-react";
import { Card, EmptyState, SectionHeader, Stat, Tag } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { cn, fmtValue } from "@/lib/ui";
import {
  RING,
  assetPlayerId,
  buildTradeTree,
  countTreeNodes,
  rankTradeRoots,
  type AssetMove,
  type ManagerMetric,
  type PlayerNow,
  type TradeGraph,
  type TradeGraphEdge,
  type TradeRecord,
  type TradeTreeNode,
} from "@/lib/tradegraph";
import {
  edgeKeyForTrade,
  parseWebParams,
  webQueryString,
  type WebSelection,
  type WebUrlState,
} from "@/lib/tradegraph/url";

const POSTURE_TONE = {
  contending: "accent",
  ascending: "positive",
  rebuilding: "info",
  straddling: "negative",
} as const;

const BAND_TONE = {
  resilient: "positive",
  balanced: "neutral",
  brittle: "negative",
} as const;

/**
 * Both proprietary metrics, as two small tappable pills. This is the one place the
 * web/tree connects PAST decisions to WHERE THINGS STAND TODAY - a trade tree is
 * otherwise pure history, and the two metrics are otherwise nowhere outside their own
 * pages. Every pill routes to the metric's home page rather than trying to explain
 * the number inline a second time.
 */
function ManagerMetricPills({ metric }: { metric: ManagerMetric | undefined }) {
  if (!metric) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Link
        href="/league"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted transition-colors hover:text-ink"
      >
        <Tag tone={POSTURE_TONE[metric.posture]}>{metric.tci} TCI</Tag>
        <span className="text-faint">{metric.posture}</span>
      </Link>
      {metric.fragility != null && metric.fragilityBand && (
        <Link
          href="/awards"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted transition-colors hover:text-ink"
        >
          <Layers size={10} className="shrink-0" />
          <Tag tone={BAND_TONE[metric.fragilityBand]}>{Math.round(metric.fragility)} RFI</Tag>
        </Link>
      )}
    </span>
  );
}

/**
 * A manager's identity as one tappable unit: avatar, name, and their current
 * metric pills, linking to their dossier. Used everywhere the web or a tree names a
 * manager, so "who is this" always has a next step instead of dead-ending as text.
 *
 * A FORMER principal (left the league - see lib/principals.ts) routes to their own
 * `/managers/former/{ownerId}` page rather than the roster they no longer hold, and
 * never shows metric pills: fragility and TCI are properties of a roster as it stands
 * tonight, so attaching them to a departed manager would silently borrow whoever
 * replaced them - exactly the bug this component exists to avoid. That guard lives
 * here rather than in every caller, so it cannot be forgotten at a new call site.
 */
function ManagerLink({
  node,
  metric,
  isMe,
}: {
  node: {
    ownerId: string;
    rosterId: number;
    name: string;
    avatarId: string | null;
    teamLogoUrl: string | null;
    isFormer: boolean;
    tenureLabel?: string;
  };
  metric: ManagerMetric | undefined;
  isMe?: boolean;
}) {
  const href = node.isFormer ? `/managers/former/${node.ownerId}` : `/managers/${node.rosterId}`;
  // Two links side by side, deliberately NOT nested: the dossier link wraps only the
  // avatar and name, and the metric pills below it link out on their own. An <a>
  // cannot contain another <a> - the pills used to sit inside this link and React
  // flagged the resulting hydration mismatch.
  return (
    <span className="inline-flex min-w-0 max-w-full flex-col items-start gap-0.5">
      <Link
        href={href}
        className="group -m-1 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-[--radius-sm] p-1 text-left transition-colors hover:bg-surface-2"
      >
        <TeamAvatar
          name={node.name}
          avatarId={node.avatarId}
          teamLogoUrl={node.teamLogoUrl}
          size="xs"
          isMe={isMe}
        />
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="truncate text-[13px] font-semibold text-ink group-hover:text-accent">
            {node.name}
          </span>
          {isMe ? (
            <Tag tone="accent">you</Tag>
          ) : (
            node.isFormer && (
              <Tag>former{node.tenureLabel ? ` ${node.tenureLabel}` : ""}</Tag>
            )
          )}
        </span>
      </Link>
      {!node.isFormer && <ManagerMetricPills metric={metric} />}
    </span>
  );
}

/** A player-kind asset's CURRENT standing: avatar, value, tier, duration, holder. */
function PlayerNowRow({
  assetKey,
  label,
  now,
  names,
}: {
  assetKey: string;
  label: string;
  now: PlayerNow | undefined;
  names: Record<number, string>;
}) {
  const pid = assetPlayerId(assetKey);
  if (!pid || !now) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1.5 rounded-[--radius-sm] border border-border/70 bg-surface/50 px-2 py-1.5">
      <PlayerAvatar name={label} team={now.team} playerId={pid} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] leading-snug text-muted">
          worth <span className="font-mono font-semibold text-ink">{fmtValue(now.value)}</span>{" "}
          today · {now.tier} · {now.duration.toFixed(1)}s
        </span>
        {now.heldBy != null && names[now.heldBy] && (
          <span className="block text-[11px] leading-snug text-faint">
            now on{" "}
            <Link
              href={`/managers/${now.heldBy}`}
              className="font-semibold text-accent hover:underline"
            >
              {names[now.heldBy]}
            </Link>
          </span>
        )}
      </span>
    </div>
  );
}

export interface TradeWebProps {
  graph: TradeGraph;
  moves: AssetMove[];
  holdings: Record<string, number>;
  /** Every roster's CURRENT read on Duration/TCI and Fragility. */
  managerMetrics: Record<number, ManagerMetric>;
  /** Every ever-traded player's CURRENT value, tier, duration and holder. */
  playerNow: Record<string, PlayerNow>;
}

const ALL = "all";

/**
 * The view state of this page, backed by the address bar.
 *
 * WHY `replaceState` rather than `router.replace`: `/web` is force-dynamic and its
 * server render prices every player who has ever been traded, so routing on every tap
 * of a strand would pay for that whole render again, per tap. `replaceState` moves the
 * address bar with no server round trip, and Next reflects it back through
 * `useSearchParams` - which keeps the URL as the single source of truth instead of a
 * mirrored copy of it that can quietly disagree.
 *
 * Selections deliberately do not stack up in the back button: back leaves the page,
 * exactly as it did before any of this was addressable. The URL is here to be
 * reloaded and shared, not to turn every tap into a history entry.
 */
function useWebUrl(): [WebUrlState, (next: WebUrlState) => void] {
  const params = useSearchParams();
  const state = useMemo(() => parseWebParams(params), [params]);
  const commit = useCallback((next: WebUrlState) => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${webQueryString(next)}`,
    );
  }, []);
  return [state, commit];
}

export function TradeWeb({
  graph,
  moves,
  holdings,
  managerMetrics,
  playerNow,
}: TradeWebProps) {
  const [url, commit] = useWebUrl();

  // A URL is untrusted input (see lib/tradegraph/url.ts), so every id in it is checked
  // against THIS league's graph before it drives anything: a stale or hand-edited link
  // lands on the overview rather than an empty panel or a zeroed season.
  const linkedEdgeKey = useMemo(
    () => (url.tradeId ? edgeKeyForTrade(graph.edges, url.tradeId) : null),
    [url.tradeId, graph.edges],
  );
  const season =
    url.season && graph.seasons.includes(url.season) ? url.season : ALL;
  const selection = useMemo<WebSelection>(() => {
    // A linked deal lights up the strand it sits on - the web has no per-trade
    // geometry of its own to select.
    if (url.tradeId) {
      return linkedEdgeKey ? { kind: "edge", key: linkedEdgeKey } : null;
    }
    const s = url.selection;
    if (s?.kind === "node") {
      return graph.nodes.some((n) => n.ownerId === s.ownerId) ? s : null;
    }
    if (s?.kind === "edge") {
      return graph.edges.some((e) => e.key === s.key) ? s : null;
    }
    return null;
  }, [url.tradeId, url.selection, linkedEdgeKey, graph.nodes, graph.edges]);

  // Everything a commit builds on is the VALIDATED read, so changing the season on a
  // page reached by a bad link does not carry that bad link's ids forward.
  const current: WebUrlState = {
    mode: url.mode,
    season: season === ALL ? null : season,
    selection,
    tradeId: linkedEdgeKey ? url.tradeId : null,
    asset: url.asset,
  };
  const mode = url.mode;
  const setMode = (next: "web" | "trees") => commit({ ...current, mode: next });

  return (
    <div>
      <div
        role="tablist"
        aria-label="Trade web mode"
        className="mb-4 flex gap-1.5 rounded-full border border-border bg-surface/60 p-1"
      >
        <ModeTab
          active={mode === "web"}
          onClick={() => setMode("web")}
          icon={<Network size={14} />}
          label="Web"
        />
        <ModeTab
          active={mode === "trees"}
          onClick={() => setMode("trees")}
          icon={<GitBranch size={14} />}
          label="Trees"
        />
      </div>

      {mode === "web" ? (
        <WebMode
          graph={graph}
          managerMetrics={managerMetrics}
          season={season}
          selection={selection}
          linkedTradeId={current.tradeId}
          unresolvedTradeId={url.tradeId && !linkedEdgeKey ? url.tradeId : null}
          onSeason={(next) =>
            commit({ ...current, season: next === ALL ? null : next })
          }
          onSelect={(next) =>
            // Tapping anything yourself replaces a linked deal: the URL should say
            // what you are looking at now, not how you arrived.
            commit({ ...current, selection: next, tradeId: null })
          }
        />
      ) : (
        <TreesMode
          graph={graph}
          moves={moves}
          holdings={holdings}
          managerMetrics={managerMetrics}
          playerNow={playerNow}
          rootId={url.asset}
          onRoot={(next) => commit({ ...current, asset: next })}
        />
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none",
        active
          ? "bg-accent text-accent-ink"
          : "text-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ web mode */

function WebMode({
  graph,
  managerMetrics,
  season,
  selection: sel,
  linkedTradeId,
  unresolvedTradeId,
  onSeason,
  onSelect,
}: {
  graph: TradeGraph;
  managerMetrics: Record<number, ManagerMetric>;
  /** `ALL` or a season in `graph.seasons` - already validated by the caller. */
  season: string;
  selection: WebSelection;
  /** The deal a link pointed at, marked in the pair's list once it is found. */
  linkedTradeId: string | null;
  /** A linked deal this graph has no strand for, said out loud rather than ignored. */
  unresolvedTradeId: string | null;
  onSeason: (next: string) => void;
  onSelect: (next: WebSelection) => void;
}) {
  // Keyboard focus is not part of the view being shared - it belongs to this session's
  // pointer and tab order, so it stays local while everything above lives in the URL.
  const [focused, setFocused] = useState<string | null>(null);
  const [focusedEdge, setFocusedEdge] = useState<string | null>(null);

  const view = useMemo(() => {
    const trades =
      season === ALL
        ? graph.trades
        : graph.trades.filter((t) => t.season === season);
    const keep = new Set(trades.map((t) => t.id));
    const tradeById = new Map(trades.map((t) => [t.id, t]));

    const edges = graph.edges
      .map((e) => {
        const ids = e.tradeIds.filter((id) => keep.has(id));
        return { ...e, tradeIds: ids, count: ids.length };
      })
      .filter((e) => e.count > 0);

    // Keyed by owner id, not roster id: `ownerParties` is already resolved to
    // whoever actually held each seat that season (lib/tradegraph#buildTradeGraph),
    // which is what lets a handover split into two honest node counts.
    const nodeTrades = new Map<string, number>();
    for (const t of trades) {
      for (const ownerId of t.ownerParties) {
        nodeTrades.set(ownerId, (nodeTrades.get(ownerId) ?? 0) + 1);
      }
    }
    const partnersOf = new Map<string, Map<string, number>>();
    for (const e of edges) {
      (partnersOf.get(e.a) ?? partnersOf.set(e.a, new Map()).get(e.a)!).set(
        e.b,
        e.count,
      );
      (partnersOf.get(e.b) ?? partnersOf.set(e.b, new Map()).get(e.b)!).set(
        e.a,
        e.count,
      );
    }
    const maxCount = edges.reduce((m, e) => Math.max(m, e.count), 0);
    const maxTrades = Math.max(1, ...nodeTrades.values());
    return { trades, tradeById, edges, nodeTrades, partnersOf, maxCount, maxTrades };
  }, [graph, season]);

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.ownerId, n])),
    [graph.nodes],
  );

  const activeNode = sel?.kind === "node" ? sel.ownerId : null;
  const activeEdge = sel?.kind === "edge" ? sel.key : null;
  const selectedEdge = activeEdge
    ? view.edges.find((e) => e.key === activeEdge)
    : undefined;

  // A strand is lit when it is selected, keyboard-focused, or touches the
  // focused manager.
  const isLit = (a: string, b: string, key: string) => {
    if (key === focusedEdge) return true;
    if (activeEdge) return key === activeEdge;
    if (activeNode != null) return a === activeNode || b === activeNode;
    return false;
  };
  const dimming = activeEdge != null || activeNode != null;

  const label = `Trade web: ${graph.nodes.length} managers, ${view.edges.length} pairs that have traded, ${view.trades.length} deals${season === ALL ? " across all seasons" : ` in ${season}`}.`;

  return (
    <div>
      {/* Season filter */}
      <div className="scroll-x -mx-4 mb-3 flex gap-1.5 px-4 sm:mx-0 sm:px-0">
        <FilterChip
          active={season === ALL}
          onClick={() => onSeason(ALL)}
          label="All seasons"
        />
        {graph.seasons.map((s) => (
          <FilterChip
            key={s}
            active={season === s}
            onClick={() => onSeason(s)}
            label={s}
          />
        ))}
      </div>

      <div className="rounded-[--radius] border border-border bg-surface/60 p-1">
        {/* role="group", not "img": an img role would collapse the whole SVG into
            one atomic node for assistive tech and hide the interactive managers
            and strands inside it. */}
        <svg
          viewBox={`0 0 ${RING.size} ${RING.size}`}
          className="mx-auto block w-full max-w-[460px]"
          role="group"
          aria-label={label}
        >
          {/* Tapping the field clears the selection. */}
          <rect
            x={0}
            y={0}
            width={RING.size}
            height={RING.size}
            fill="transparent"
            onClick={() => onSelect(null)}
          />
          <circle
            cx={RING.cx}
            cy={RING.cy}
            r={RING.r}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={0.75}
            strokeDasharray="2 5"
          />

          {/* Strands, thin ones first so heavy pairs read on top. */}
          <g>
            {[...view.edges]
              .sort((x, y) => x.count - y.count)
              .map((e) => {
                const a = nodeById.get(e.a)!;
                const b = nodeById.get(e.b)!;
                const d = bowedPath(a.x, a.y, b.x, b.y);
                const lit = isLit(e.a, e.b, e.key);
                const w = r2(
                  0.8 + 3.0 * Math.pow(e.count / view.maxCount, 0.65),
                );
                const opacity = lit
                  ? 0.95
                  : dimming
                    ? 0.07
                    : r2(0.26 + 0.4 * (e.count / view.maxCount));
                return (
                  <g key={e.key}>
                    {/* Wide invisible stroke so a 1.5-unit strand is tappable -
                        and a real button, so the strand is keyboard-reachable.
                        Focus indication is the strand itself lighting up (isLit),
                        so the default outline box is suppressed. */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      role="button"
                      tabIndex={0}
                      aria-pressed={activeEdge === e.key}
                      aria-label={`${a.name} and ${b.name}: ${e.count} ${e.count === 1 ? "deal" : "deals"}`}
                      className="cursor-pointer"
                      style={{ pointerEvents: "stroke", outline: "none" }}
                      onClick={() => onSelect({ kind: "edge", key: e.key })}
                      onFocus={() => setFocusedEdge(e.key)}
                      onBlur={() => setFocusedEdge(null)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          onSelect(
                            activeEdge === e.key
                              ? null
                              : { kind: "edge", key: e.key },
                          );
                        }
                      }}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth={lit ? r2(w + 0.8) : w}
                      strokeLinecap="round"
                      opacity={opacity}
                      className="transition-opacity duration-200 motion-reduce:transition-none"
                      style={{ pointerEvents: "none" }}
                    />
                  </g>
                );
              })}
          </g>

          {/* Managers */}
          <g>
            {graph.nodes.map((n) => {
              const trades = view.nodeTrades.get(n.ownerId) ?? 0;
              const r = r2(
                13 + 6 * Math.pow(trades / view.maxTrades, 0.6) * (trades ? 1 : 0),
              );
              const isSel = activeNode === n.ownerId;
              const onLitEdge =
                selectedEdge != null &&
                (selectedEdge.a === n.ownerId || selectedEdge.b === n.ownerId);
              const isPartner =
                activeNode != null &&
                view.partnersOf.get(activeNode)?.has(n.ownerId) === true;
              const dim =
                dimming && !isSel && !onLitEdge && !isPartner;
              const stroke = isSel
                ? "var(--color-accent)"
                : onLitEdge
                  ? "var(--color-accent)"
                  : n.isMe
                    ? "var(--color-accent)"
                    : isPartner
                      ? "var(--color-info)"
                      : "var(--color-border-strong)";
              return (
                <g
                  key={n.ownerId}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSel}
                  aria-label={`${n.name}${n.isMe ? " (you)" : ""}${n.isFormer ? " (former)" : ""}: ${trades} trades, ${view.partnersOf.get(n.ownerId)?.size ?? 0} partners`}
                  className="cursor-pointer"
                  opacity={dim ? 0.3 : 1}
                  onClick={() =>
                    onSelect(isSel ? null : { kind: "node", ownerId: n.ownerId })
                  }
                  onFocus={() => setFocused(n.ownerId)}
                  onBlur={() => setFocused(null)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      onSelect(
                        isSel ? null : { kind: "node", ownerId: n.ownerId },
                      );
                    }
                  }}
                >
                  <circle cx={n.x} cy={n.y} r={RING.tapR} fill="transparent" />
                  {focused === n.ownerId && (
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={RING.tapR - 1}
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                    />
                  )}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r}
                    fill={
                      isSel
                        ? "var(--color-accent)"
                        : n.isMe
                          ? "rgba(230,179,77,0.16)"
                          : "var(--color-surface-2)"
                    }
                    stroke={stroke}
                    strokeWidth={isSel || n.isMe || onLitEdge ? 2 : 1}
                  />
                  <text
                    x={n.x}
                    y={n.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11.5}
                    fontWeight={700}
                    className="font-mono"
                    fill={isSel ? "var(--color-accent-ink)" : "var(--color-ink)"}
                    style={{ pointerEvents: "none" }}
                  >
                    {n.abbr}
                  </text>
                  {n.isMe && !isSel && (
                    <text
                      x={n.x}
                      y={r2(n.y + r + 9)}
                      textAnchor="middle"
                      fontSize={8}
                      letterSpacing="0.12em"
                      className="font-mono"
                      fill="var(--color-accent)"
                      style={{ pointerEvents: "none" }}
                    >
                      YOU
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/*
            The focused manager's name goes in the middle of the ring, not beside
            their node: 14 labels around a 350px circle is unreadable, and a label
            beside the rightmost node would run off the viewBox.
          */}
          {activeNode != null &&
            (() => {
              const n = nodeById.get(activeNode)!;
              const deals = view.nodeTrades.get(activeNode) ?? 0;
              const partners = view.partnersOf.get(activeNode)?.size ?? 0;
              const label = truncate(n.name, 20);
              // Sized from the label so the plate hugs the text at any name length.
              const plateW = r2(Math.max(112, label.length * 7.6 + 18));
              return (
                <g style={{ pointerEvents: "none" }}>
                  {/* Backing plate: the ring centre is crossed by strands. */}
                  <rect
                    x={r2(RING.cx - plateW / 2)}
                    y={RING.cy - 22}
                    width={plateW}
                    height={40}
                    rx={9}
                    fill="var(--color-bg)"
                    opacity={0.82}
                  />
                  <text
                    x={RING.cx}
                    y={RING.cy - 4}
                    textAnchor="middle"
                    fontSize={15}
                    fontWeight={600}
                    className="font-display"
                    fill="var(--color-accent)"
                  >
                    {label}
                  </text>
                  <text
                    x={RING.cx}
                    y={RING.cy + 12}
                    textAnchor="middle"
                    fontSize={9.5}
                    className="font-mono"
                    fill="var(--color-muted)"
                  >
                    {deals} {deals === 1 ? "deal" : "deals"} · {partners}{" "}
                    {partners === 1 ? "partner" : "partners"}
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
        <Info size={12} className="shrink-0" />
        Bubble size = deals made. Strand thickness = deals between that pair.
      </p>

      {/* Selection panel */}
      <div className="mt-4">
        {unresolvedTradeId && (
          <Card className="mb-2 border-warn/30 bg-warn/[0.06]">
            <p className="text-sm leading-relaxed text-muted">
              That link points at a deal this web has no strand for - its sides
              never resolved to two managers, so there is no pairing to open. Every
              other deal is below.
            </p>
          </Card>
        )}
        {sel == null && <WebOverview graph={graph} view={view} season={season} />}
        {activeNode != null && (
          <NodePanel
            graph={graph}
            view={view}
            ownerId={activeNode}
            managerMetrics={managerMetrics}
            onClear={() => onSelect(null)}
            onPickEdge={(key) => onSelect({ kind: "edge", key })}
          />
        )}
        {selectedEdge && (
          <EdgePanel
            graph={graph}
            view={view}
            edge={selectedEdge}
            managerMetrics={managerMetrics}
            linkedTradeId={linkedTradeId}
            onClear={() => onSelect(null)}
          />
        )}
        {activeEdge && !selectedEdge && (
          <Card>
            <p className="text-sm text-muted">
              That pair has no deals in {season}. Clear the season filter to see
              them.
            </p>
          </Card>
        )}
      </div>

      {/* Same information, as a list — the keyboard and screen-reader path. */}
      <SectionHeader title={`Managers (${graph.nodes.length})`} />
      <ul className="space-y-1.5">
        {[...graph.nodes]
          .sort((a, b) => b.trades - a.trades)
          .map((n) => (
            <li key={n.ownerId}>
              <button
                type="button"
                onClick={() => onSelect({ kind: "node", ownerId: n.ownerId })}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[--radius-sm] border px-3 py-2 text-left transition-colors motion-reduce:transition-none",
                  n.isMe
                    ? "border-accent/30 bg-accent/[0.06]"
                    : "border-border bg-surface/60 hover:bg-surface-2",
                )}
              >
                <span className="w-9 shrink-0 font-mono text-[11px] font-bold text-accent">
                  {n.abbr}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {n.name}
                    {n.isMe && <span className="ml-1.5 text-accent">(you)</span>}
                    {!n.isMe && n.isFormer && (
                      <span className="ml-1.5 text-faint">
                        former{n.tenureLabel ? ` ${n.tenureLabel}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-faint">
                    {n.handle}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm tnum text-ink">
                    {view.nodeTrades.get(n.ownerId) ?? 0}
                  </span>
                  <span className="block text-[10px] text-faint">deals</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-faint" />
              </button>
            </li>
          ))}
      </ul>

      <SectionHeader
        title={`Pairings that have traded (${view.edges.length} of ${graph.possiblePairs})`}
      />
      <ul className="space-y-1.5">
        {view.edges.map((e) => {
          const a = nodeById.get(e.a)!;
          const b = nodeById.get(e.b)!;
          return (
            <li key={e.key}>
              <button
                type="button"
                onClick={() => onSelect({ kind: "edge", key: e.key })}
                className="flex w-full items-center gap-2 rounded-[--radius-sm] border border-border bg-surface/60 px-3 py-2 text-left transition-colors hover:bg-surface-2 motion-reduce:transition-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">
                    {a.name} <span className="text-faint">&amp;</span> {b.name}
                  </span>
                  <span className="block truncate text-[11px] text-faint">
                    {e.seasons.join(", ")}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-sm tnum text-accent">
                  {e.count}
                </span>
                <ChevronRight size={14} className="shrink-0 text-faint" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The season-filtered derivation the web renders from. */
interface WebView {
  trades: TradeRecord[];
  tradeById: Map<string, TradeRecord>;
  edges: TradeGraphEdge[];
  /** ownerId -> deals that season/filter. */
  nodeTrades: Map<string, number>;
  /** ownerId -> (partner ownerId -> deals with them). */
  partnersOf: Map<string, Map<string, number>>;
  maxCount: number;
  maxTrades: number;
}

function WebOverview({
  graph,
  view,
  season,
}: {
  graph: TradeGraph;
  view: WebView;
  season: string;
}) {
  const busiest = view.edges[0];
  const nodeById = new Map(graph.nodes.map((n) => [n.ownerId, n]));
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label={season === ALL ? "Deals, all time" : `Deals in ${season}`}
          value={view.trades.length}
          tone="accent"
        />
        <Stat
          label="Pairs connected"
          value={`${view.edges.length}/${graph.possiblePairs}`}
          sub={`${graph.possiblePairs - view.edges.length} pairs have never traded`}
        />
      </div>
      {busiest && (
        <Card className="mt-2">
          <div className="text-[11px] uppercase tracking-wide text-faint">
            Busiest pairing
          </div>
          <div className="mt-0.5 text-sm font-semibold text-ink">
            {nodeById.get(busiest.a)?.name} &amp; {nodeById.get(busiest.b)?.name}
          </div>
          <div className="mt-0.5 font-mono text-[11px] tnum text-accent">
            {busiest.count} deals
          </div>
        </Card>
      )}
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Tap a manager to focus their strands, or tap a strand to read the deals
        behind it. Everything is also listed below.
      </p>
    </div>
  );
}

function NodePanel({
  graph,
  view,
  ownerId,
  managerMetrics,
  onClear,
  onPickEdge,
}: {
  graph: TradeGraph;
  view: WebView;
  ownerId: string;
  managerMetrics: Record<number, ManagerMetric>;
  onClear: () => void;
  onPickEdge: (key: string) => void;
}) {
  const node = graph.nodes.find((n) => n.ownerId === ownerId);
  if (!node) return null;
  const partners = [...(view.partnersOf.get(ownerId) ?? new Map())]
    .map(([oid, count]) => ({
      oid,
      count,
      node: graph.nodes.find((n) => n.ownerId === oid)!,
    }))
    .sort((a, b) => b.count - a.count || a.node.name.localeCompare(b.node.name));
  const never = graph.nodes.filter(
    (n) =>
      n.ownerId !== ownerId &&
      !(view.partnersOf.get(ownerId)?.has(n.ownerId) ?? false),
  );
  const max = Math.max(1, ...partners.map((p) => p.count));

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <ManagerLink
          node={node}
          metric={managerMetrics[node.rosterId]}
          isMe={node.isMe}
        />
        <ClearButton onClick={onClear} />
      </div>
      <p className="-mt-1 text-[11px] text-faint">{node.handle}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Deals" value={view.nodeTrades.get(ownerId) ?? 0} tone="accent" />
        <Stat label="Partners" value={partners.length} />
        <Stat
          label="Picks net"
          value={node.picksNet > 0 ? `+${node.picksNet}` : `${node.picksNet}`}
          tone={
            node.picksNet > 0 ? "positive" : node.picksNet < 0 ? "negative" : "neutral"
          }
        />
      </div>

      {partners.length > 0 ? (
        <>
          <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Trades with
          </div>
          <ul className="space-y-1">
            {partners.map((p) => (
              <li key={p.oid}>
                <button
                  type="button"
                  onClick={() =>
                    onPickEdge(
                      ownerId < p.oid
                        ? `${ownerId}-${p.oid}`
                        : `${p.oid}-${ownerId}`,
                    )
                  }
                  className="flex w-full items-center gap-2 rounded-[--radius-sm] px-2 py-1.5 text-left transition-colors hover:bg-surface-2 motion-reduce:transition-none"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {p.node.name}
                  </span>
                  <span
                    aria-hidden
                    className="h-1.5 rounded-full bg-accent"
                    style={{ width: `${r2(18 + (p.count / max) * 54)}px` }}
                  />
                  <span className="w-5 shrink-0 text-right font-mono text-[12px] tnum text-accent">
                    {p.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">No deals in this season filter.</p>
      )}

      {never.length > 0 && (
        <>
          <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Never traded with ({never.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {never.map((n) => (
              <Tag key={n.ownerId} tone="neutral">
                {n.name}
              </Tag>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function EdgePanel({
  graph,
  view,
  edge,
  managerMetrics,
  linkedTradeId,
  onClear,
}: {
  graph: TradeGraph;
  view: WebView;
  edge: TradeGraph["edges"][number];
  managerMetrics: Record<number, ManagerMetric>;
  /**
   * The deal a link pointed at. A pair can have a dozen deals, so arriving from a
   * trade URL has to say WHICH one, or the link lands you in a list and leaves you
   * to guess. The list stays in date order rather than floating it to the top: the
   * order is the pair's history, and reordering it would misrepresent that.
   */
  linkedTradeId: string | null;
  onClear: () => void;
}) {
  const a = graph.nodes.find((n) => n.ownerId === edge.a)!;
  const b = graph.nodes.find((n) => n.ownerId === edge.b)!;
  const trades = edge.tradeIds
    .map((id) => view.tradeById.get(id))
    .filter((t): t is TradeGraph["trades"][number] => t != null)
    .sort((x, y) => y.created - x.created);

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <ManagerLink node={a} metric={managerMetrics[a.rosterId]} isMe={a.isMe} />
            <span className="text-faint">&amp;</span>
            <ManagerLink node={b} metric={managerMetrics[b.rosterId]} isMe={b.isMe} />
          </div>
          <p className="font-mono text-[11px] tnum text-accent">
            {edge.count} {edge.count === 1 ? "deal" : "deals"} ·{" "}
            {edge.seasons.join(", ")}
          </p>
        </div>
        <ClearButton onClick={onClear} />
      </div>

      <ul className="mt-3 space-y-2">
        {trades.map((t) => {
          const linked = t.id === linkedTradeId;
          return (
          <li
            key={t.id}
            className={cn(
              "rounded-[--radius-sm] border p-3",
              linked
                ? "border-accent/50 bg-accent/[0.07]"
                : "border-border bg-surface-2/60",
            )}
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] tnum text-muted">
                {t.season} · wk {t.week}
              </span>
              {linked && <Tag tone="accent">this deal</Tag>}
              {t.multiTeam && (
                <Tag tone="info">{t.parties.length}-team deal</Tag>
              )}
              {t.hasInferredPicks && <Tag tone="warn">picks inferred</Tag>}
            </div>
            <ul className="space-y-1">
              {t.sides.map((s) => (
                <li key={s.rosterId} className="text-[13px] leading-snug">
                  <span
                    className={cn(
                      "font-semibold",
                      s.rosterId === graph.meRosterId ? "text-accent" : "text-ink",
                    )}
                  >
                    {s.name}
                  </span>{" "}
                  <span className="text-muted">{s.text}</span>
                </li>
              ))}
            </ul>
          </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Clear selection"
      className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-surface-2 hover:text-ink motion-reduce:transition-none"
    >
      <X size={16} />
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none",
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-border bg-surface/60 text-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

/* ---------------------------------------------------------------- trees mode */

function TreesMode({
  graph,
  moves,
  holdings,
  managerMetrics,
  playerNow,
  rootId,
  onRoot,
}: {
  graph: TradeGraph;
  moves: AssetMove[];
  holdings: Record<string, number>;
  managerMetrics: Record<number, ManagerMetric>;
  playerNow: Record<string, PlayerNow>;
  /** An `AssetMove` id from the URL, or null for "whatever ranks first". */
  rootId: string | null;
  onRoot: (next: string) => void;
}) {
  const [q, setQ] = useState("");
  // "My deals" is the right default for someone arriving cold, but it is the wrong
  // one for someone arriving on a link to a specific chain: half the league's chains
  // are not theirs, and defaulting the filter on would silently drop the very asset
  // the link named.
  const [mineOnly, setMineOnly] = useState(
    graph.meRosterId != null && rootId == null,
  );

  // Keyed by owner id: the stable identity that survives a handover, needed to look
  // up a tree hop's actual manager (`fromOwnerId`/`toOwnerId`) rather than whoever
  // currently sits in that roster's seat.
  const nodeByOwner = useMemo(
    () => new Map(graph.nodes.map((n) => [n.ownerId, n])),
    [graph.nodes],
  );

  const ctx = useMemo(() => {
    // CURRENT holder only - "still on X"/"now on X" always describes today, and a
    // former principal's old roster id belongs to someone else now, so including
    // them here would let their name win that lookup by iteration order.
    const names: Record<number, string> = {};
    for (const n of graph.nodes) if (!n.isFormer) names[n.rosterId] = n.name;
    // Every principal's own name, keyed by the identity that never changes even
    // though the roster they hold can. Paired with a move's own fromOwnerId/
    // toOwnerId (resolved at the correct season by buildAssetMoves) this is what
    // lets a hop through a succeeded roster name the manager who actually made it.
    const ownerNames: Record<string, string> = {};
    for (const n of graph.nodes) ownerNames[n.ownerId] = n.name;
    return { moves, holdings, names, ownerNames };
  }, [graph.nodes, moves, holdings]);

  const roots = useMemo(() => rankTradeRoots(ctx), [ctx]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return roots.filter(
      (r) =>
        (!mineOnly || r.owner === graph.meRosterId) &&
        (!s || r.label.toLowerCase().includes(s)),
    );
  }, [roots, q, mineOnly, graph.meRosterId]);

  const effectiveRoot =
    (rootId && filtered.some((r) => r.moveId === rootId) ? rootId : null) ??
    filtered[0]?.moveId ??
    null;

  const tree = useMemo(
    () => (effectiveRoot ? buildTradeTree(ctx, effectiveRoot) : null),
    [ctx, effectiveRoot],
  );
  const rootMeta = roots.find((r) => r.moveId === effectiveRoot);
  // The principal who actually made the root move, resolved via the move's own
  // fromOwnerId (season-correct - see lib/tradegraph#buildAssetMoves) rather than
  // whoever currently holds that roster seat. Falls back to a current-roster lookup
  // only in the degraded case where no owner id resolved at all.
  const originNode = tree
    ? (tree.fromOwnerId && nodeByOwner.get(tree.fromOwnerId)) ||
      graph.nodes.find((n) => !n.isFormer && n.rosterId === tree.from) ||
      null
    : null;

  return (
    <div>
      <Card className="mb-4 border-info/25 bg-info/[0.05]">
        <p className="text-xs leading-relaxed text-muted">
          <span className="font-semibold text-ink">Follow the asset.</span> Pick
          something a manager gave up and see what it turned into: what came back,
          and what those pieces were flipped for after that. Traded picks resolve to
          the player they were actually spent on.
        </p>
      </Card>

      <div className="relative mb-2">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a player or pick…"
          aria-label="Search assets"
          className="w-full rounded-full border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </div>
      {graph.meRosterId != null && (
        <div className="mb-3 flex gap-1.5">
          <FilterChip
            active={mineOnly}
            onClick={() => setMineOnly(true)}
            label="My deals"
          />
          <FilterChip
            active={!mineOnly}
            onClick={() => setMineOnly(false)}
            label="Whole league"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState title="Nothing to trace">
          No traded asset matches that search. Try a surname, or a season like
          &quot;2024&quot;.
        </EmptyState>
      ) : (
        <>
          <div className="scroll-x -mx-4 mb-4 flex gap-1.5 px-4 sm:mx-0 sm:px-0">
            {filtered.slice(0, 14).map((r) => (
              <button
                key={r.moveId}
                type="button"
                onClick={() => onRoot(r.moveId)}
                aria-pressed={r.moveId === effectiveRoot}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none",
                  r.moveId === effectiveRoot
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-surface/60 text-muted hover:text-ink",
                )}
              >
                {truncate(r.label, 20)}
                <span className="ml-1.5 font-mono text-[10px] tnum text-faint">
                  {r.size}
                </span>
              </button>
            ))}
          </div>

          {tree && rootMeta && originNode && (
            <Card>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                Trade tree · {rootMeta.season}
              </div>
              <ManagerLink
                node={originNode}
                metric={managerMetrics[originNode.rosterId]}
                isMe={originNode.isMe}
              />
              <h3 className="mt-0.5 font-display text-xl font-semibold leading-tight text-ink">
                gave up {tree.label}
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                {tree.outcome}
                {tree.kind === "pick" && tree.became && ` · became ${tree.became}`}
              </p>
              {tree.kind === "player" && (
                <PlayerNowRow
                  assetKey={tree.assetKey}
                  label={tree.label}
                  now={playerNow[assetPlayerId(tree.assetKey) ?? ""]}
                  names={ctx.names}
                />
              )}
              <div className="mt-3">
                {tree.children.length === 0 ? (
                  <p className="text-sm text-muted">
                    Nothing came back on record for this side of the deal.
                  </p>
                ) : (
                  <TreeBranch nodes={tree.children} playerNow={playerNow} names={ctx.names} />
                )}
              </div>
              <p className="mt-3 text-[11px] text-faint">
                {countTreeNodes(tree)} assets in this chain · depth capped at 4
                trades deep
              </p>
            </Card>
          )}
          {tree && rootMeta && !originNode && (
            <Card>
              <p className="text-sm text-muted">
                {(tree.fromOwnerId && ctx.ownerNames[tree.fromOwnerId]) ||
                  ctx.names[tree.from]}{" "}
                gave up {tree.label}. {tree.outcome}
              </p>
            </Card>
          )}

          <SectionHeader title={`All traceable assets (${filtered.length})`} />
          <ul className="space-y-1.5">
            {filtered.slice(0, 60).map((r) => (
              <li key={r.moveId}>
                <button
                  type="button"
                  onClick={() => onRoot(r.moveId)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[--radius-sm] border px-3 py-2 text-left transition-colors motion-reduce:transition-none",
                    r.moveId === effectiveRoot
                      ? "border-accent/40 bg-accent/[0.06]"
                      : "border-border bg-surface/60 hover:bg-surface-2",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">
                      {r.label}
                    </span>
                    <span className="block truncate text-[11px] text-faint">
                      {(r.ownerId && ctx.ownerNames[r.ownerId]) || ctx.names[r.owner]} ·{" "}
                      {r.season}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-[12px] tnum text-accent">
                      {r.size}
                    </span>
                    <span className="block text-[10px] text-faint">assets</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {filtered.length > 60 && (
            <p className="mt-2 text-[11px] text-faint">
              Showing the 60 biggest chains. Search to narrow it down.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A branch of the lineage as an indented rail. A real node-link tree needs
 * horizontal room this column does not have at 390px, so the tree is drawn as
 * nested rails: same structure, readable on a phone, no horizontal scroll.
 */
function TreeBranch({
  nodes,
  playerNow,
  names,
}: {
  nodes: TradeTreeNode[];
  playerNow: Record<string, PlayerNow>;
  names: Record<number, string>;
}) {
  return (
    <ul className="space-y-2 border-l border-border pl-3">
      {nodes.map((n) => {
        const pid = assetPlayerId(n.assetKey);
        return (
          <li key={n.id} className="relative">
            <span
              aria-hidden
              className="absolute -left-3 top-3.5 h-px w-3 bg-border"
            />
            <div className="rounded-[--radius-sm] border border-border bg-surface-2/50 px-3 py-2">
              <div className="flex items-start gap-2">
                <CornerDownRight size={13} className="mt-0.5 shrink-0 text-positive" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold leading-snug text-ink">
                    {n.label}
                  </div>
                  {n.became && (
                    <div className="text-[11px] text-info">became {n.became}</div>
                  )}
                  <div className="mt-0.5 text-[11px] leading-snug text-muted">
                    {n.season} · {n.outcome}
                  </div>
                  {n.inferred && (
                    <div className="mt-1">
                      <Tag tone="warn">inferred pick</Tag>
                    </div>
                  )}
                  {pid && (
                    <PlayerNowRow
                      assetKey={n.assetKey}
                      label={n.label}
                      now={playerNow[pid]}
                      names={names}
                    />
                  )}
                </div>
              </div>
            </div>
            {n.children.length > 0 && (
              <div className="mt-2">
                <TreeBranch nodes={n.children} playerNow={playerNow} names={names} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------- helpers */

/**
 * Quadratic curve between two ring points, bowed perpendicular to the chord so long
 * chords don't all collapse into a straight line through the middle. The bow always
 * leans the same rotational way, which is what gives the web its spun look.
 */
function bowedPath(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): string {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const sign = nx * (RING.cx - mx) + ny * (RING.cy - my) >= 0 ? 1 : -1;
  const bow = 0.16 * len;
  const qx = r2(mx + nx * sign * bow);
  const qy = r2(my + ny * sign * bow);
  return `M${ax},${ay} Q${qx},${qy} ${bx},${by}`;
}

/**
 * Round to 2dp. Every computed SVG number goes through this: unrounded floats
 * serialize differently on the server than in the browser, which React reports as a
 * hydration mismatch.
 */
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

export function BetaBadge() {
  return (
    <Tag tone="warn">
      <FlaskConical size={11} />
      Beta
    </Tag>
  );
}
