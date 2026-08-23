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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, RotateCcw, Search } from "lucide-react";
import {
  applyRanks,
  blendSources,
  consensusSource,
  customSource,
  disagreements as computeDisagreements,
} from "@/lib/rankings";
import { leagueTiers, tierResolver } from "@/lib/rankings/tiers";
import { withViewTransition } from "@/lib/view-transition";
import { injuryLabel, valuePlayers } from "@/lib/valuation";
import {
  CUSTOM_RANK_STORAGE_KEY,
  customOrderFromCookieHeader,
  parseCustomOrder,
  reorder,
  syncCustomOrder,
} from "@/lib/rankings/customOrder";
import { Card, EmptyState, SectionHeader } from "@/components/ui";
import { PlayerAvatar, photosEnabled } from "@/components/PlayerAvatar";
import { cn, fmtValue, fold } from "@/lib/ui";
// Row pitch: 64px row (h-16) + 4px gap (gap-1). The drag math below assumes
// every row is exactly this tall, so if the row markup's height classes ever
// change, this constant has to move with them.
//
// WAS 56px (h-14) until the row lost its avatar disc and its meta line moved
// from single-line `truncate` to `line-clamp-2` (see the row markup below) - a
// long meta line ("SF · 35y · cons #37") was clipping mid-number ("cons #...")
// at the old width even with the avatar gone, screenshotted on the live
// 120-player board. Two meta lines plus the name line is 64px at this type
// scale with room to spare; 56px was not.
const ROW_HEIGHT = 64;
const ROW_GAP = 4;
const ROW_PITCH = ROW_HEIGHT + ROW_GAP;
/**
 * How much of the board stands on the page at rest (VISION kill list, item 5).
 * The full pool still exists - saved, blended, and priced identically - but the
 * page renders your top slice plus whatever search has pulled into view: nobody
 * hand-ranks 120 assets on a phone; they disagree with the model about ~15.
 */
const WORKING_SET = 25;
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
function weightCopy(w) {
  if (w === 0)
    return "0% yours - pure consensus. Drag a few players to start diverging.";
  if (w === 100)
    return "100% yours - consensus is fully overridden wherever you ranked someone.";
  if (w === 50) return "50% - your order and consensus split the difference.";
  const lead =
    w > 50 ? "your order leads the blend" : "consensus still leads the blend";
  return `${w}% yours - ${lead}.`;
}
export function RankingBoard({ players, scoring }) {
  const playersById = useMemo(
    () => new Map(players.map((p) => [p.playerId, p])),
    [players],
  );
  // The pristine consensus order this page was rendered with. Stable for the
  // life of the page load, so it doubles as both the fallback order and the
  // yardstick "moved" counts below diff against.
  const poolIds = useMemo(() => players.map((p) => p.playerId), [players]);
  const [order, setOrder] = useState(poolIds);
  const [customized, setCustomized] = useState(false);
  const [weight, setWeight] = useState(50);
  const [resetArmed, setResetArmed] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  // The working set: how many rows the page currently stands up. Search grows it
  // just far enough to land on the row it found; the buttons below grow it in
  // pages or all at once. Never shrinks a drag out from under a finger - only
  // user taps change it.
  const [limit, setLimit] = useState(WORKING_SET);
  const [q, setQ] = useState("");
  const [flashId, setFlashId] = useState(null);
  const shownCount = Math.min(limit, order.length);
  const matches = useMemo(() => {
    const s = fold(q.trim());
    if (!s) return [];
    return order
      .map((id, idx) => ({ id, idx, p: playersById.get(id) }))
      .filter((m) => m.p && fold(m.p.fullName).includes(s))
      .slice(0, 8);
  }, [q, order, playersById]);
  const jumpTo = useCallback((id, idx) => {
    setLimit((l) => Math.max(l, idx + 1));
    setQ("");
    setFlashId(id);
  }, []);
  // Scroll to the row search landed on, once it is rendered, and let the ring
  // fade the same way /values' ?focus arrival does.
  useEffect(() => {
    if (!flashId) return;
    document
      .getElementById(`rank-li-${flashId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFlashId(null), 1600);
    return () => clearTimeout(t);
  }, [flashId]);
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
  // Same pattern for the drag handler's clamp: a ref, so mid-drag pointermove
  // never runs against a stale working-set size and never resubscribes per tap.
  const limitRef = useRef(limit);
  useEffect(() => {
    orderRef.current = order;
    customizedRef.current = customized;
    limitRef.current = limit;
  });
  const lastWrittenRef = useRef(null);
  // Persist the order into the cookie - the one store, and the only form a
  // SERVER component can read, which is what lets /trade/finder tell you a
  // package is selling a player you rate well above consensus. Guarded on
  // `customized`: writing consensus order for a viewer who has only looked at
  // this page would manufacture an opinion they never expressed, and every
  // reader downstream would then report gaps that are really just the ties and
  // holes in the consensus ranks themselves.
  const flushOrder = useCallback((keepalive) => {
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
  const dragInfoRef = useRef(null);
  const dragRowRef = useRef(null);
  const onHandlePointerDown = useCallback(
    (e, id) => {
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
  const onHandlePointerMove = useCallback(
    (e) => {
      const info = dragInfoRef.current;
      if (!info || e.pointerId !== info.pointerId) return;
      const deltaY = e.clientY - info.startClientY;
      const rawHover = info.startIndex + Math.round(deltaY / ROW_PITCH);
      // Clamped to the VISIBLE slice, not the whole order: the rows below the
      // working-set cut are not on screen, so letting a drag cross the cut would
      // drop the row somewhere the finger cannot see. Expanding the list first
      // (search or "show more") makes the deeper slots reachable.
      const hoverIndex = Math.max(
        0,
        Math.min(Math.min(order.length, limitRef.current) - 1, rawHover),
      );
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
    },
    [order.length],
  );
  const endDrag = useCallback((e) => {
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
  const tiers = useMemo(() => leagueTiers(valuesDesc), [valuesDesc]);
  const tierFor = useMemo(() => tierResolver(tiers), [tiers]);
  const gaps = useMemo(
    () => computeDisagreements(custom, consensus, playersById).slice(0, 12),
    [custom, consensus, playersById],
  );
  // The board's #1 value: the shared scale every row's bottom bar is drawn
  // against (see the row markup below).
  const boardMax = useMemo(
    () => Math.max(...[...values.values()].map((x) => x.value), 1),
    [values],
  );
  const movedCount = useMemo(
    () => order.reduce((n, id, i) => (id !== poolIds[i] ? n + 1 : n), 0),
    [order, poolIds],
  );
  if (players.length === 0) {
    return (
      <EmptyState title="No rankable players yet">
        The league payload has not resolved any consensus ranks to build a board
        from.
      </EmptyState>
    );
  }
  return (
    <div>
      <dl className="grid grid-cols-3 divide-x divide-border rounded-[--radius-sm] border border-border bg-surface/60">
        <Figure label="in pool" value={`${order.length}`} />
        <Figure
          label="moved"
          value={`${movedCount}`}
          sub={customized ? "saved" : "unsaved"}
        />
        <Figure
          label="top gap"
          value={gaps[0] ? `${Math.abs(gaps[0].delta).toFixed(0)}` : "-"}
          sub={gaps[0]?.name}
        />
      </dl>

      {/* THE PAGE'S OWN INSTRUMENT (round 10). The blend weight is the one control
          this surface exists for, and it was set in the same 16px as a stat cell.
          Hero treatment: the shared gold-washed ground (hero-card, see globals.css)
          and the weight at --text-hero - the number IS this page's headline. */}
      <Card className="hero-card mt-2.5">
        <div className="flex items-end justify-between gap-2">
          <label
            htmlFor="blend-weight"
            className="pb-1 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted"
          >
            Blend weight
            <span className="mt-0.5 block normal-case tracking-normal text-secondary">
              yours vs consensus
            </span>
          </label>
          <span className="figure text-hero font-semibold leading-none text-accent-text">
            {weight}
            <span className="text-lede font-semibold text-muted">%</span>
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
            // COURT BLUE (VISION M4): the track IS a you-vs-the-field comparison -
            // your share of the blend in gold, consensus's share in the field
            // hue's wash. Same numbers, one more honest channel.
            background: `linear-gradient(to right, var(--color-accent) ${weight}%, var(--color-info-wash) ${weight}%)`,
          }}
        />
        <p className="mt-1.5 text-meta leading-snug text-muted">
          {weightCopy(weight)}
        </p>
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
                ? "border-negative-edge bg-negative-wash text-negative"
                : "border-border text-muted hover:border-border-strong",
            )}
          >
            <RotateCcw size={13} aria-hidden="true" />
            {resetArmed ? "Tap again to reset" : "Reset"}
          </button>
        }
      />
      <p className="-mt-1 mb-1.5 text-meta leading-snug text-faint">
        Drag the handle to reorder - your position in this list is your rank.
        Nobody hand-ranks {order.length} players: the board shows your top{" "}
        {WORKING_SET}, and search pulls anyone else into view.
      </p>

      {/* THE FINDER (VISION kill list, item 5). The 120-row wall is gone as the
          primary surface: you disagree with the model about the assets you care
          about, so the board is a working set plus a search that jumps straight
          to any player - expanding the list only as far as that row. The feature
          (the full order, the cookie, the finder's conviction line) is untouched;
          only how much of it stands on the page at once changed. */}
      <div className="relative mb-1.5">
        <Search
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Find any of the ${order.length} to rank him`}
          aria-label="Find a player on the board"
          className="h-11 w-full rounded-full border border-border bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-secondary focus:border-accent focus:outline-none"
        />
        {q.trim() && (
          <ul className="mt-1 space-y-0.5 rounded-[--radius-sm] border border-border bg-surface p-1">
            {matches.length === 0 && (
              <li className="px-2 py-1.5 text-meta text-secondary">
                No player matches.
              </li>
            )}
            {matches.map(({ id, idx, p }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => jumpTo(id, idx)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-[--radius-sm] px-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="w-8 shrink-0 text-right figure text-meta text-secondary">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 line-clamp-1 text-[13px] font-semibold text-ink">
                    {p.fullName}
                  </span>
                  <span className="shrink-0 figure text-meta text-faint">
                    cons #{p.searchRank}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {order.slice(0, shownCount).map((id, i) => {
          const p = playersById.get(id);
          if (!p) return null;
          const v = values.get(id);
          const tier = v ? tierFor(v.value)?.label : undefined;
          const dragging = draggingId === id;
          // YOUR FINGERPRINTS ON THE BOARD: a row sitting anywhere other than its
          // consensus slot carries a gold edge, so a scroll down the list shows at
          // a glance exactly where your opinion diverges - the same fact the
          // "moved" counter above states as one number.
          const moved = id !== poolIds[i];
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
              id={`rank-li-${id}`}
              /*
               * The name that lets the reset transition follow THIS row to its new
               * slot. Suppressed while a drag is in flight: that row is being moved by
               * an imperative `style.transform` on every frame, and a captured element
               * is lifted out of the layout for the duration of a transition, which
               * would tear the finger away from it.
               */
              style={
                dragging ? undefined : { viewTransitionName: `rank-row-${id}` }
              }
              className={cn(
                // overflow-hidden added for the two zero-height marks below (the
                // bottom value bar and the moved edge) - the row's OWN height is
                // exactly the ROW_HEIGHT the drag arithmetic assumes, unchanged.
                "relative flex h-16 items-center gap-2 overflow-hidden rounded-[--radius-sm] border px-2 transition-colors",
                dragging
                  ? "z-10 border-accent-edge bg-surface-2 shadow-lg"
                  : "border-border bg-surface/60",
                flashId === id && "ring-2 ring-accent",
              )}
            >
              {moved && !dragging && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-[3px] bg-accent"
                />
              )}
              {/* The board's value curve, drawn INSIDE the fixed-height row: each
                  row's bottom edge carries its value as length against the board's
                  #1. 120 identical rows become one readable decay curve on the way
                  down - geometry, never valence. */}
              {v && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-[3px]"
                >
                  <span
                    className="block h-full"
                    style={{
                      width: `${Math.max(1, Math.round((v.value / boardMax) * 100))}%`,
                      backgroundImage:
                        "linear-gradient(90deg, var(--color-accent-dim), var(--color-accent))",
                      opacity: 0.75,
                    }}
                  />
                </span>
              )}
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
              {/* The top of YOUR board gets podium-weight ordinals - hierarchy
                  restating the sort, exactly as the /values list's own top three
                  do (see ValueAssetRow's `hero`). */}
              <span
                className={cn(
                  "w-6 shrink-0 text-right figure",
                  i < 3
                    ? "text-lede font-semibold leading-none text-accent-text"
                    : "text-meta text-faint",
                )}
              >
                {i + 1}
              </span>
              {/*
                  NO MONOGRAM DISC HERE. Every row already carries a drag handle, a
                  rank number and a value+tier column of fixed width - a 32px
                  monogram circle on top of that was the single biggest fixed cost
                  left in the row, and it duplicated the name printed right beside
                  it. Freeing that width (plus the tier fix below) is what actually
                  stops names and the "cons #NN" meta from truncating, not shrinking
                  either one further.

                  A REAL PHOTO IS DIFFERENT, so it is not gone unconditionally: see
                  `photosEnabled` (lib/photos.js). On - the default as of D90 - a real
                  face is recognition value a reader uses, not decoration repeating
                  the name, so it renders at the same 32px this row's height
                  arithmetic already has room for. Off, which now takes an explicit
                  opt-out, this stays exactly the monogram-free row above.
                */}
              {photosEnabled() && (
                <PlayerAvatar
                  name={p.fullName}
                  team={p.team}
                  playerId={p.playerId}
                  size="sm"
                  className="shrink-0"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="line-clamp-1 text-[13px] font-semibold leading-tight text-ink">
                    {p.fullName}
                  </span>
                  {injury && (
                    <span className="shrink-0 rounded bg-negative-wash px-1 text-meta font-semibold leading-tight text-negative">
                      {injury}
                    </span>
                  )}
                </span>
                {/* Was single-line `truncate`: position + team + age + "cons #NN"
                      routinely ran past the row width and clipped the consensus
                      rank mid-number ("cons #..."), screenshotted on the live
                      120-player board. `line-clamp-2` wraps instead - the row's
                      height (ROW_HEIGHT above) was raised to fit it. */}
                <span className="mt-px line-clamp-2 block figure text-meta text-faint">
                  {p.position ?? "-"}
                  {p.team ? ` · ${p.team}` : ""}
                  {p.age != null ? ` · ${p.age}y` : ""} · cons #{p.searchRank}
                </span>
              </span>
              <span className="w-[4.5rem] shrink-0 text-right">
                <span className="block figure text-[13px] font-semibold leading-tight text-ink">
                  {v ? fmtValue(v.value) : "-"}
                </span>
                {tier && (
                  <span className="block text-meta leading-tight text-faint">
                    {tier}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {shownCount < order.length && (
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => setLimit((l) => l + WORKING_SET)}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-surface text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent-text"
          >
            Show {Math.min(WORKING_SET, order.length - shownCount)} more
            <span className="figure text-meta text-secondary">
              of {order.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setLimit(order.length)}
            className="flex min-h-11 shrink-0 items-center justify-center rounded-full border border-border px-4 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-accent-text"
          >
            All {order.length}
          </button>
        </div>
      )}

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
          {/* THE GAPS AS GEOMETRY (round 10). This list used to state each gap as a
              green-or-red signed number - but a rank disagreement has no good end
              (the page's own caption says it cuts both ways), so the valence pair
              was exactly the colour-as-judgment D6 forbids. Now: a centre-origin
              bar, direction by which side of the spine it fills, size by length
              against the biggest gap on the board, and the number beside it in
              plain ink. The two directions take the two OWNED hues (VISION M4:
              gold = yours, court blue = the field): a bar toward gold is a player
              you rank above consensus, toward blue is one the field ranks above
              you - identity, not valence, and the printed ranks still carry
              everything if the colour is deleted (lib/chart-colors' test). */}
          {gaps.map((g) => {
            const maxGap = Math.max(Math.abs(gaps[0]?.delta ?? 1), 1);
            const half = (Math.abs(g.delta) / maxGap) * 50;
            const right = g.delta > 0;
            const n = Math.round(g.delta);
            return (
              <li
                key={g.playerId}
                className="flex min-h-11 items-center gap-2.5 px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block line-clamp-1 text-[13px] font-semibold leading-tight text-ink">
                    {g.name}
                  </span>
                  <span className="block line-clamp-1 figure text-meta text-faint">
                    you #{g.yourRank} · consensus #{g.consensusRank}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="relative h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-elevated"
                >
                  <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
                  {/* A zero gap draws nothing but the spine - a minimum-width nub
                      on a zero would assert a disagreement that does not exist. */}
                  {n !== 0 && (
                    <span
                      className="absolute inset-y-0"
                      style={{
                        [right ? "left" : "right"]: "50%",
                        width: `${Math.max(half, 4)}%`,
                        // delta = consensusRank - yourRank: positive means YOU
                        // have him higher (gold, rightward); negative means the
                        // field does (court blue, leftward).
                        background: right
                          ? "var(--color-accent)"
                          : "var(--color-info)",
                      }}
                    />
                  )}
                </span>
                <span className="w-8 shrink-0 text-right figure text-meta font-semibold text-ink">
                  {n > 0 ? `+${n}` : n}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
function Figure({ label, value, sub }) {
  return (
    <div className="min-w-0 px-2.5 py-1.5">
      <dt className="text-meta uppercase tracking-wide text-faint">{label}</dt>
      <dd className="line-clamp-1 figure text-lede font-semibold text-ink">
        {value}
      </dd>
      {sub && <dd className="line-clamp-1 text-meta text-muted">{sub}</dd>}
    </div>
  );
}
