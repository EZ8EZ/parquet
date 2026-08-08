"use client";

/**
 * ONE BOARD, TWO PAIRS OF AXES.
 *
 * /league used to answer its own question four times over: the duration x coherence
 * scatter, a fourteen-row coherence list, the coherence x fragility scatter with a
 * SECOND fourteen-row list inside it, and then the power ranking - the same fourteen
 * rosters, four renderings, 3,379px of a 3,900px page at 375px. Nothing was wrong with
 * any one of them; there were just four.
 *
 * The two scatters have the same subject, the same fourteen dots and the same y axis
 * (TCI). They differ in one thing: what sits on x. So they are one chart with a toggle
 * now, and the page keeps exactly one roster list underneath, which carries both
 * numbers per row and is what the dot labels key to.
 *
 * WHAT IS LOST, stated rather than glossed: you can no longer see both pairings at
 * once. The mitigation is that the toggle is instant (no server round trip - see
 * lib/league/url.ts on why this writes with history.replaceState) and addressable, so
 * "look at the fragility board" is a link rather than an instruction.
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CoherenceFragilityQuadrant } from "@/components/CoherenceFragilityQuadrant";
import { MetricGloss } from "@/components/MetricGloss";
import { TimelineQuadrant, type TimelinePoint } from "@/components/TimelineChart";
import {
  BOARD_TABS,
  boardSearch,
  readBoard,
  type BoardAxes,
} from "@/lib/league/url";
import type { QuadrantView } from "@/lib/metrics/quadrant";
import { cn } from "@/lib/ui";

export function LeagueBoard({
  points,
  view,
}: {
  points: TimelinePoint[];
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

  return (
    <div>
      <div
        role="tablist"
        aria-label="Board axes"
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
            >
              <span className="text-note font-semibold leading-tight">{t.label}</span>
              <span className="figure text-micro leading-tight text-faint">
                {t.axes}
              </span>
            </button>
          );
        })}
      </div>

      {board === "duration" ? (
        <div className="rounded-[--radius] border border-border bg-surface p-2.5">
          <TimelineQuadrant points={points} />
          {/* The chart already prints both axis labels and the word STRADDLE inside
              the tinted band, so the 48-word gloss that used to sit here was mostly
              re-saying the picture. What the picture cannot say is why that band is
              the interesting one - that stays. The definitions go where every other
              definition in this app goes. */}
          <p className="mt-1 text-meta leading-snug text-secondary">
            Inside the tinted band a roster is straddling two timelines at once, which
            makes it the most motivated trade partner on this board.
          </p>
          <MetricGloss metrics={["tci"]} className="mt-0.5" />
        </div>
      ) : (
        <CoherenceFragilityQuadrant view={view} />
      )}
    </div>
  );
}
