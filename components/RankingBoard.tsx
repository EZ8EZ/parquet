"use client";

/**
 * The /rank drag board: your own ordering, blended live against consensus.
 *
 * Drag-reorder is built on Pointer Events, not HTML5 `draggable` - draggable
 * does not fire reliably on touch, which is disqualifying on a mobile-first
 * app. Only the grip icon is a drag target (`touch-action: none`, pointer
 * capture on pointerdown) so the page's own vertical scroll keeps working
 * everywhere else on the row. The dragged row is repositioned with an
 * imperative `style.transform` on a direct DOM ref rather than through React
 * state, so a fast drag does not fight the list's own re-render: the array
 * only gets a `setOrder` when the finger actually crosses into a new slot, and
 * the transform on every frame in between is a plain DOM write. See
 * `onHandlePointerMove` for the arithmetic that keeps the row glued to the
 * finger across a reorder.
 *
 * Everything downstream of `order` - the blend, the applied ranks, the
 * valuation, the tiers - is exactly the pipeline described in
 * lib/rankings/index.ts. This component owns none of that math; it only
 * turns a drag into an ordered id list and hands it to `customSource()`.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { GripVertical, RotateCcw } from "lucide-react";
import type { Player } from "@/lib/providers/types";
import {
  applyRanks,
  blendSources,
  consensusSource,
  customSource,
  disagreements as computeDisagreements,
} from "@/lib/rankings";
import { computeTiers, tierResolver } from "@/lib/rankings/tiers";
import { withViewTransition } from "@/lib/view-transition";
import { injuryLabel, valuePlayers } from "@/lib/valuation";
import {
  CUSTOM_RANK_STORAGE_KEY,
  customOrderFromCookieHeader,
  parseCustomOrder,
  reorder,
  syncCustomOrder,
} from "@/lib/rankings/customOrder";
import { Card, DeltaValue, EmptyState, SectionHeader } from "@/components/ui";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { cn, fmtValue } from "@/lib/ui";

// Row pitch: 56px row (h-14) + 4px gap (gap-1). The drag math below assumes
// every row is exactly this tall, so if the row markup's height classes ever
// change, this constant has to move with them.
const ROW_HEIGHT = 56;
const ROW_GAP = 4;
const ROW_PITCH = ROW_HEIGHT + ROW_GAP;

/**
 * How long to wait before persisting the order into the cookie.
 *
 * One drag gesture crosses several slots and commits a new `order` on each one, so
 * an undebounced write would fire a dozen requests for a single finger movement.
 * The debounce is safe because it is never the last line of defence: the pending
 * write is flushed on unmount and on pagehide (see `flushOrder` below), so neither
 * a quick tap-through to another page nor closing the tab can drop the tail of a
 * drag.
 */
const COOKIE_WRITE_DEBOUNCE_MS = 600;

function weightCopy(w: number): string {
  if (w === 0) return "0% yours - pure consensus. Drag a few players to start diverging.";
  if (w === 100) return "100% yours - consensus is fully overridden wherever you ranked someone.";
  if (w === 50) return "50% - your order and consensus split the difference.";
  const lead = w > 50 ? "your order leads the blend" : "consensus still leads the blend";
  return `${w}% yours - ${lead}.`;
}

interface DragInfo {
  id: string;
  pointerId: number;
  startClientY: number;
  startIndex: number;
  hoverIndex: number;
}

export function RankingBoard({
  players,
  scoring,
}: {
  players: Player[];
  scoring: Record<string, number>;
}) {
  const playersById = useMemo(
    () => new Map(players.map((p) => [p.playerId, p])),
    [players],
  );
  // The pristine consensus order this page was rendered with. Stable for the
  // life of the page load, so it doubles as both the fallback order and the
  // yardstick "moved" counts below diff against.
  const poolIds = useMemo(() => players.map((p) => p.playerId), [players]);

  const [order, setOrder] = useState<string[]>(poolIds);
  const [customized, setCustomized] = useState(false);
  const [weight, setWeight] = useState(50);
  const [resetArmed, setResetArmed] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Read the saved order once, after hydration - never on the server render, so
  // the first client paint matches the server's and React has nothing to warn
  // about. The cookie is the store (see lib/rankings/customOrder.ts); the
  // localStorage read behind it is a one-time legacy migration for a board saved
  // before the cookie existed, which the write effect below then promotes into
  // the cookie. Only adopts a saved order if there IS one; a fresh visit stays
  // on consensus order without ever writing anything.
  useEffect(() => {
    const fromCookie = customOrderFromCookieHeader(document.cookie);
    const stored =
      fromCookie.length > 0
        ? fromCookie
        : parseCustomOrder(localStorage.getItem(CUSTOM_RANK_STORAGE_KEY));
    if (stored.length > 0) {
      // Deliberate exception to the "no setState in effects" guidance: this is
      // a one-time sync from a browser-only API (localStorage) that cannot be
      // read during the server render, not a derivation of other React state,
      // so there is no cascading-render risk - it fires once, on mount, full stop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrder(syncCustomOrder(stored, poolIds));
      setCustomized(true);
    }
    // poolIds is stable for the page's lifetime (derived from server-fetched
    // props); this is meant to run exactly once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The write path. Refs rather than deps so the flush sites below (unmount,
  // pagehide) always see the latest order without re-subscribing per drag.
  const orderRef = useRef(order);
  const customizedRef = useRef(customized);
  useEffect(() => {
    orderRef.current = order;
    customizedRef.current = customized;
  });
  const lastWrittenRef = useRef<string | null>(null);

  // Persist the order into the cookie - the one store, and the only form a
  // SERVER component can read, which is what lets /trade/finder tell you a
  // package is selling a player you rate well above consensus. Guarded on
  // `customized`: writing consensus order for a viewer who has only looked at
  // this page would manufacture an opinion they never expressed, and every
  // reader downstream would then report gaps that are really just the ties and
  // holes in the consensus ranks themselves.
  const flushOrder = useCallback((keepalive: boolean) => {
    if (!customizedRef.current) return;
    const body = JSON.stringify({ order: orderRef.current });
    if (body === lastWrittenRef.current) return;
    lastWrittenRef.current = body;
    // Fire and forget: a failed write is not worth interrupting a drag over -
    // the order lives in state, and the next reorder or flush retries.
    void fetch("/api/custom-rank", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!customized) return;
    const t = setTimeout(() => flushOrder(false), COOKIE_WRITE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [order, customized, flushOrder]);

  // The debounce's safety net: a client-side navigation unmounts this component
  // and a reload or tab close fires pagehide, both inside the debounce window if
  // the user moves fast. `keepalive: true` is what lets the request outlive the
  // page it was sent from.
  useEffect(() => {
    const onPageHide = () => flushOrder(true);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flushOrder(true);
    };
  }, [flushOrder]);

  useEffect(() => {
    if (!resetArmed) return;
    const t = setTimeout(() => setResetArmed(false), 3000);
    return () => clearTimeout(t);
  }, [resetArmed]);

  function handleReset() {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    /*
     * The ONE animated state change on this page, and the only one that earns it.
     *
     * A drag is not animated and must not be: the row is already glued to the finger,
     * and a tween on top of direct manipulation is a fight the finger loses. Reset is
     * the opposite - one tap silently relocates every row in the list at once, and the
     * reader is almost always holding a specific player in their head ("where did the
     * guy I moved to 3 end up?"). Tracking one object across a wholesale reshuffle is
     * the single thing animation is actually proven to help with, so this is where it
     * goes and nowhere else. See lib/view-transition.ts for the guards.
     */
    withViewTransition(() => setOrder(poolIds));
    setCustomized(false);
    setResetArmed(false);
    // Clear the legacy localStorage save too, or the migration read on the next
    // mount would resurrect the exact ranking the user just asked to forget.
    localStorage.removeItem(CUSTOM_RANK_STORAGE_KEY);
    // The cookie was just deleted, so the dedupe memory must go with it: an
    // identical order re-dragged later is a genuinely new write, not a repeat.
    lastWrittenRef.current = null;
    void fetch("/api/custom-rank", { method: "DELETE" }).catch(() => {});
  }

  /* ---------------------------------------------------------------- */
  /* Drag                                                               */
  /* ---------------------------------------------------------------- */

  const dragInfoRef = useRef<DragInfo | null>(null);
  const dragRowRef = useRef<HTMLLIElement | null>(null);

  const onHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
      const li = e.currentTarget.closest("li");
      const idx = order.indexOf(id);
      if (!li || idx === -1) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragInfoRef.current = {
        id,
        pointerId: e.pointerId,
        startClientY: e.clientY,
        startIndex: idx,
        hoverIndex: idx,
      };
      dragRowRef.current = li;
      setDraggingId(id);
    },
    [order],
  );

  const onHandlePointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const info = dragInfoRef.current;
    if (!info || e.pointerId !== info.pointerId) return;
    const deltaY = e.clientY - info.startClientY;
    const rawHover = info.startIndex + Math.round(deltaY / ROW_PITCH);
    const hoverIndex = Math.max(0, Math.min(order.length - 1, rawHover));

    // The row has already reflowed by (hoverIndex - startIndex) pitches once
    // the last setOrder below commits. Subtracting that out of the transform
    // keeps the row's ON-SCREEN position exactly `deltaY` from where the drag
    // started, regardless of how many times it has been reordered so far.
    const settledShift = (hoverIndex - info.startIndex) * ROW_PITCH;
    if (dragRowRef.current) {
      dragRowRef.current.style.transform = `translateY(${deltaY - settledShift}px)`;
    }

    if (hoverIndex !== info.hoverIndex) {
      info.hoverIndex = hoverIndex;
      setOrder((prev) => reorder(prev, prev.indexOf(info.id), hoverIndex));
      setCustomized(true);
    }
  }, [order.length]);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const info = dragInfoRef.current;
    if (!info || e.pointerId !== info.pointerId) return;
    if (dragRowRef.current) dragRowRef.current.style.transform = "";
    dragInfoRef.current = null;
    dragRowRef.current = null;
    setDraggingId(null);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Blend + valuation + tiers - the exact recipe /values uses          */
  /* ---------------------------------------------------------------- */

  const consensus = useMemo(() => consensusSource(players), [players]);
  const custom = useMemo(() => customSource(order), [order]);
  const blended = useMemo(
    () => blendSources(consensus, custom, weight / 100),
    [consensus, custom, weight],
  );
  const blendedPlayers = useMemo(
    () => applyRanks(players, blended),
    [players, blended],
  );
  const values = useMemo(
    () => valuePlayers(blendedPlayers, scoring),
    [blendedPlayers, scoring],
  );
  const valuesDesc = useMemo(
    () =>
      [...values.values()]
        .map((v) => v.value)
        .filter((v) => v > 0)
        .sort((a, b) => b - a),
    [values],
  );
  // Same floor recipe as /values, so a tier label means the same thing on both
  // pages - a "Cornerstone" here is a "Cornerstone" there.
  const tiers = useMemo(
    () => computeTiers(valuesDesc, { floor: (valuesDesc[0] ?? 0) * 0.1 }),
    [valuesDesc],
  );
  const tierFor = useMemo(() => tierResolver(tiers), [tiers]);

  const gaps = useMemo(
    () => computeDisagreements(custom, consensus, playersById).slice(0, 12),
    [custom, consensus, playersById],
  );

  const movedCount = useMemo(
    () => order.reduce((n, id, i) => (id !== poolIds[i] ? n + 1 : n), 0),
    [order, poolIds],
  );

  if (players.length === 0) {
    return (
      <EmptyState title="No rankable players yet">
        The league payload has not resolved any consensus ranks to build a
        board from.
      </EmptyState>
    );
  }

  return (
    <div>
      <dl className="grid grid-cols-3 divide-x divide-border rounded-[--radius-sm] border border-border bg-surface/60">
        <Figure label="in pool" value={`${order.length}`} />
        <Figure label="moved" value={`${movedCount}`} sub={customized ? "saved" : "unsaved"} />
        <Figure
          label="top gap"
          value={gaps[0] ? `${Math.abs(gaps[0].delta).toFixed(0)}` : "-"}
          sub={gaps[0]?.name}
        />
      </dl>

      <Card className="mt-2.5">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="blend-weight"
            className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted"
          >
            Blend weight
          </label>
          <span className="figure text-base font-semibold text-accent">
            {weight}%
          </span>
        </div>
        <input
          id="blend-weight"
          type="range"
          min={0}
          max={100}
          step={5}
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
          aria-label="Blend weight: percent your ranking versus consensus"
          className="weight-slider mt-2.5 h-11 w-full cursor-pointer rounded-full bg-elevated"
          style={{
            background: `linear-gradient(to right, var(--color-accent) ${weight}%, var(--color-elevated) ${weight}%)`,
          }}
        />
        <p className="mt-1.5 text-meta leading-snug text-muted">{weightCopy(weight)}</p>
      </Card>

      <SectionHeader
        title="Your ranking"
        action={
          <button
            type="button"
            onClick={handleReset}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-meta font-semibold transition-colors",
              resetArmed
                ? "border-negative/40 bg-negative/12 text-negative"
                : "border-border text-muted hover:border-border-strong",
            )}
          >
            <RotateCcw size={13} aria-hidden="true" />
            {resetArmed ? "Tap again to reset" : "Reset"}
          </button>
        }
      />
      <p className="-mt-1 mb-1.5 text-meta leading-snug text-faint">
        Drag the handle to reorder. Your position in this list is your rank;
        everything else on the page follows it.
      </p>

      <ul className="flex flex-col gap-1">
        {order.map((id, i) => {
          const p = playersById.get(id);
          if (!p) return null;
          const v = values.get(id);
          const tier = v ? tierFor(v.value)?.label : undefined;
          const dragging = draggingId === id;
          // Body part only: this row is 390px wide with a drag handle in it. Null for
          // a healthy player and for load management, which is a flag, not an injury.
          const injury = injuryLabel(
            {
              status: p.injuryStatus,
              bodyPart: p.injuryBodyPart,
              notes: p.injuryNotes,
            },
            { short: true },
          );
          return (
            <li
              key={id}
              /*
               * The name that lets the reset transition follow THIS row to its new
               * slot. Suppressed while a drag is in flight: that row is being moved by
               * an imperative `style.transform` on every frame, and a captured element
               * is lifted out of the layout for the duration of a transition, which
               * would tear the finger away from it.
               */
              style={dragging ? undefined : { viewTransitionName: `rank-row-${id}` }}
              className={cn(
                "relative flex h-14 items-center gap-2 rounded-[--radius-sm] border px-2 transition-colors",
                dragging
                  ? "z-10 border-accent/50 bg-surface-2 shadow-lg"
                  : "border-border bg-surface/60",
              )}
            >
              <button
                type="button"
                aria-label={`Drag to reorder ${p.fullName}`}
                className="flex h-11 w-8 shrink-0 touch-none items-center justify-center text-faint active:text-accent"
                onPointerDown={(e) => onHandlePointerDown(e, id)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <GripVertical size={18} aria-hidden="true" />
              </button>
              <span className="w-6 shrink-0 text-right figure text-meta text-faint">
                {i + 1}
              </span>
              <PlayerAvatar name={p.fullName} team={p.team} playerId={p.playerId} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold leading-tight text-ink">
                    {p.fullName}
                  </span>
                  {injury && (
                    <span className="shrink-0 rounded bg-negative/15 px-1 text-meta font-semibold leading-tight text-negative">
                      {injury}
                    </span>
                  )}
                </span>
                <span className="mt-px block truncate figure text-meta text-faint">
                  {p.position ?? "-"}
                  {p.team ? ` · ${p.team}` : ""}
                  {p.age != null ? ` · ${p.age}y` : ""} · cons #{p.searchRank}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block figure text-[13px] font-semibold leading-tight text-ink">
                  {v ? fmtValue(v.value) : "-"}
                </span>
                {tier && (
                  <span className="block whitespace-nowrap text-meta leading-tight text-faint">
                    {tier}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <SectionHeader title="Where you disagree with consensus" />
      <p className="-mt-1 mb-1.5 text-meta leading-snug text-faint">
        Sorted biggest gap first. This cuts both ways: it is your strongest
        convictions and, read the other way, exactly where you are most likely
        wrong.
      </p>
      {gaps.length === 0 ? (
        <EmptyState title="No disagreements yet">
          Drag a few players out of consensus order to see them surface here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface/60">
          {gaps.map((g) => {
            const p = playersById.get(g.playerId);
            return (
              <li key={g.playerId} className="flex min-h-11 items-center gap-2.5 px-2.5 py-1.5">
                <PlayerAvatar name={g.name} team={p?.team} playerId={g.playerId} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
                    {g.name}
                  </span>
                  <span className="block truncate figure text-meta text-faint">
                    you #{g.yourRank} · consensus #{g.consensusRank}
                  </span>
                </span>
                <DeltaValue n={Math.round(g.delta)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="min-w-0 px-2.5 py-1.5">
      <dt className="text-meta uppercase tracking-wide text-faint">{label}</dt>
      <dd className="truncate figure text-base font-semibold text-ink">{value}</dd>
      {sub && <dd className="truncate text-meta text-muted">{sub}</dd>}
    </div>
  );
}
