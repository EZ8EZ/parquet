"use client";

/**
 * ONE BOARD, TWO READINGS.
 *
 * /league used to answer its own question four times over: a duration x coherence
 * scatter, a fourteen-row coherence list, the coherence x fragility scatter with a
 * SECOND fourteen-row list inside it, and then the power ranking - the same fourteen
 * rosters, four renderings, 3,379px of a 3,900px page at 375px. Round 8 collapsed that
 * to one toggled chart and one list.
 *
 * WHAT CHANGED THIS ROUND, and it is a replacement rather than an addition. The
 * duration x coherence scatter is gone. It plotted `rosterDuration` against `tci` -
 * exactly the two numbers the window map reads its quartiles from - on an axis of
 * abstract seasons-from-now, and it answered "where does everyone sit" without ever
 * answering "when". The window map answers both from the same derivation, on real
 * calendar seasons, and it answers the question the scatter could not: WHO ELSE pays
 * off when you do. A better expression of the same data replaces it rather than
 * joining it, so the page's height is unchanged - see /league's own header comment on
 * why that constraint is not negotiable here.
 *
 * The fragility board stays, because it is NOT the same data. RFI is a separate
 * metric with no other home on this page, and deleting it would lose a reading rather
 * than restate one.
 *
 * WHAT IS LOST, stated rather than glossed: the scatter showed each roster's TCI as a
 * position, and the window map shows coherence only as a state (a split row draws no
 * window). The number itself survives in the list under the chart and on the fragility
 * board's y axis. The toggle is instant (no server round trip - see lib/league/url.ts
 * on why this writes with history.replaceState) and addressable, so "look at the
 * fragility board" is a link rather than an instruction.
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CoherenceFragilityQuadrant } from "@/components/CoherenceFragilityQuadrant";
import { MetricGloss } from "@/components/MetricGloss";
import { WindowMap, type WindowMapRow } from "@/components/WindowMap";
import {
  BOARD_TABS,
  boardSearch,
  readBoard,
  type BoardAxes,
} from "@/lib/league/url";
import type { QuadrantView } from "@/lib/metrics/quadrant";
import { cn } from "@/lib/ui";

export interface WindowBoard {
  rows: WindowMapRow[];
  first: number;
  last: number;
  currentSeason: number;
  /** The viewer's own situation, counted. Null when they hold no roster here. */
  synthesis: string | null;
}

export function LeagueBoard({
  windows,
  view,
}: {
  windows: WindowBoard;
  view: QuadrantView;
}) {
  // Seeded from the query string exactly once, through `useSearchParams` so the SERVER
  // render already has the right board and a shared /league?board=fragility link opens
  // on the fragility board rather than flipping to it after hydration. Same reason
  // ValuesList takes its filters this way (and, like it, this component is mounted
  // inside a Suspense boundary because of it).
  const params = useSearchParams();
  const [board, setBoard] = useState<BoardAxes>(() => readBoard(params.toString()));

  function choose(next: BoardAxes) {
    setBoard(next);
    const { pathname, search, hash } = window.location;
    window.history.replaceState(null, "", `${pathname}${boardSearch(search, next)}${hash}`);
  }

  const splits = windows.rows.filter((r) => r.state === "split").length;
  const unreadable = windows.rows.filter((r) => r.state === "unreadable").length;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Board"
        className="mb-1.5 flex gap-1 rounded-full border border-border bg-surface p-1"
      >
        {BOARD_TABS.map((t) => {
          const on = t.id === board;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => choose(t.id)}
              className={cn(
                "flex min-h-11 flex-1 flex-col items-center justify-center rounded-full px-2 transition-colors",
                on
                  ? "bg-accent-wash text-accent-text"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
              style={{ transitionDuration: "var(--motion-fast)", transitionTimingFunction: "var(--ease-out)" }}
            >
              <span className="text-note font-semibold leading-tight">{t.label}</span>
              <span className="text-micro leading-tight text-faint">{t.axes}</span>
            </button>
          );
        })}
      </div>

      {board === "windows" ? (
        <div className="rounded-[--radius] border border-border bg-surface p-2.5">
          <WindowMap
            rows={windows.rows}
            first={windows.first}
            last={windows.last}
            currentSeason={windows.currentSeason}
          />

          {/* SHAPE legend, not a colour key - colour is never the only encoding here
              and in this chart it is not an encoding at all beyond marking the viewer.
              Each entry draws the mark it is naming, at the size it is drawn on the
              chart, so the legend is the thing rather than a description of it. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-micro text-faint">
            <span className="inline-flex items-center gap-1">
              <svg width="26" height="7" viewBox="0 0 26 7" aria-hidden="true">
                <rect x="0" y="1" width="26" height="5" rx="2.5" fill="var(--color-border-strong)" />
                <circle cx="15" cy="3.5" r="2.6" fill="var(--color-border-strong)" stroke="var(--color-surface)" strokeWidth="1.4" />
              </svg>
              middle half of their value, dot is the peak
            </span>
            <span className="inline-flex items-center gap-1">
              <svg width="26" height="7" viewBox="0 0 26 7" aria-hidden="true">
                <line x1="1" y1="3.5" x2="25" y2="3.5" stroke="var(--color-border-strong)" strokeWidth="1" strokeDasharray="1.5 2.5" />
                <line x1="1" y1="1" x2="1" y2="6" stroke="var(--color-border-strong)" strokeWidth="2" />
                <line x1="25" y1="1" x2="25" y2="6" stroke="var(--color-border-strong)" strokeWidth="2" />
              </svg>
              assets disagree, so no single window
            </span>
          </div>

          {/* The reading the chart cannot print inside itself: the counts. */}
          {windows.synthesis && (
            <p className="mt-1.5 text-meta leading-snug text-secondary">
              {windows.synthesis}
            </p>
          )}
          {/* The COUNT of these is already in the synthesis above; what is not there,
              and cannot be, is why the state is worth looking for. */}
          {(splits > 0 || unreadable > 0) && (
            <p className="mt-1 text-meta leading-snug text-secondary">
              {splits > 0 && (
                <>
                  A roster drawn as two ends holds assets that disagree about when it
                  wins, which is what makes it the most motivated trade partner on this
                  board.
                </>
              )}
              {unreadable > 0 && (
                <>
                  {" "}
                  {unreadable} hold too few valued assets to read any window from.
                </>
              )}
            </p>
          )}
          <MetricGloss metrics={["tci"]} className="mt-0.5" />
        </div>
      ) : (
        <CoherenceFragilityQuadrant view={view} />
      )}
    </div>
  );
}
