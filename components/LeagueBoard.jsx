"use client";
/**
 * ONE BOARD, TWO LENSED VIEWS OF THE SAME FOURTEEN ROSTERS.
 *
 * /league used to answer its own question four times over: a duration x coherence
 * scatter, a fourteen-row coherence list, the coherence x fragility scatter with a
 * SECOND fourteen-row list inside it, and then the power ranking - the same fourteen
 * rosters, four renderings, 3,379px of a 3,900px page at 375px. Round 8 collapsed that
 * to one toggled chart and one list; the duration x coherence scatter was then replaced
 * by the window map, which reads its spans off the same two numbers on an axis of real
 * calendar seasons and answers the question the scatter could not - WHO ELSE pays off
 * when you do.
 *
 * The fragility board stays, because it is NOT the same data. RFI is a separate metric
 * with no other home on this page, and deleting it would lose a reading rather than
 * restate one.
 *
 * WHAT IS LOST, stated rather than glossed: the scatter showed each roster's TCI as a
 * position, and the window map shows coherence only as a state (a split row draws no
 * window). The number itself survives on the fragility board's y axis and in the list
 * under the chart. The toggle is instant (no server round trip - see lib/league/url.js
 * on why this writes with history.replaceState) and addressable, so "look at the
 * fragility board" is a link rather than an instruction.
 *
 * ---------------------------------------------------------------------------------
 * THE TABS ARE QUESTIONS, AND THE SELECTION SURVIVES THEM
 * ---------------------------------------------------------------------------------
 * The labels were "Windows" and "Fragility" - the names of two instruments - which asks
 * a reader to choose a chart. They are the reading now, with the axis pair demoted to the
 * sub-label, because both tabs are the same rosters through different lenses and what a
 * reader wants to choose is what they want to know. The strings live in
 * `BOARD_TABS` (lib/league/url.js), which also records why the fragility question is not
 * phrased as "who can't absorb a hit".
 *
 * Selection is shared page state (components/LeagueSelection.jsx), so switching lenses
 * keeps the roster - which is the property that makes two lenses worth having, since
 * reading one roster on both is the only thing neither chart can do alone.
 */
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CoherenceFragilityQuadrant } from "@/components/CoherenceFragilityQuadrant";
import { MetricGloss } from "@/components/MetricGloss";
import { RefusalMark } from "@/components/RefusalMark";
import { WindowMap } from "@/components/WindowMap";
import { BOARD_TABS, boardSearch, readBoard } from "@/lib/league/url";
import { RosterChip, useLeagueSelection } from "@/components/LeagueSelection";
import { cn } from "@/lib/ui";
export function LeagueBoard({ windows, view, crossed }) {
  // Seeded from the query string exactly once, through `useSearchParams` so the SERVER
  // render already has the right board and a shared /league?board=fragility link opens
  // on the fragility board rather than flipping to it after hydration. Same reason
  // ValuesList takes its filters this way (and, like it, this component is mounted
  // inside a Suspense boundary because of it).
  const params = useSearchParams();
  const [board, setBoard] = useState(() => readBoard(params.toString()));
  const { selected, select } = useLeagueSelection();
  function choose(next) {
    setBoard(next);
    const { pathname, search, hash } = window.location;
    // `boardSearch` merges rather than replaces, so switching lenses cannot drop the
    // `?roster=` the selection wrote - which is the whole point of switching lenses.
    window.history.replaceState(
      null,
      "",
      `${pathname}${boardSearch(search, next)}${hash}`,
    );
  }
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
                "flex min-h-11 flex-1 flex-col items-center justify-center rounded-full px-2 py-1 text-center transition-colors",
                on
                  ? "bg-accent-wash text-accent-text"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
              style={{
                transitionDuration: "var(--motion-fast)",
                transitionTimingFunction: "var(--ease-out)",
              }}
            >
              {/* The question wraps rather than truncating: these are sentences now, and
                  at 390px two of them share a row. `leading-tight` keeps a two-line tab
                  inside the 44px the control already reserved. */}
              <span className="text-meta font-semibold leading-tight">
                {t.label}
              </span>
              <span className="text-micro leading-tight text-faint">
                {t.axes}
              </span>
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
            selectedId={selected}
          />

          {/* SHAPE legend, not a colour key - colour is never the only encoding here
                and in this chart it is not an encoding at all beyond marking the viewer
                and their overlap with the selection. Each entry draws the mark it is
                naming, at the size it is drawn on the chart, so the legend is the thing
                rather than a description of it. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-micro text-faint">
            <span className="inline-flex items-center gap-1">
              <svg width="26" height="7" viewBox="0 0 26 7" aria-hidden="true">
                <rect
                  x="0"
                  y="1"
                  width="26"
                  height="5"
                  rx="2.5"
                  fill="var(--color-border-strong)"
                />
                <circle
                  cx="15"
                  cy="3.5"
                  r="2.6"
                  fill="var(--color-border-strong)"
                  stroke="var(--color-surface)"
                  strokeWidth="1.4"
                />
              </svg>
              middle half of their value, dot is the peak
            </span>
            <span className="inline-flex items-center gap-1">
              <svg width="26" height="7" viewBox="0 0 26 7" aria-hidden="true">
                <line
                  x1="1"
                  y1="3.5"
                  x2="25"
                  y2="3.5"
                  stroke="var(--color-border-strong)"
                  strokeWidth="1"
                  strokeDasharray="1.5 2.5"
                />
                <line
                  x1="1"
                  y1="1"
                  x2="1"
                  y2="6"
                  stroke="var(--color-border-strong)"
                  strokeWidth="2"
                />
                <line
                  x1="25"
                  y1="1"
                  x2="25"
                  y2="6"
                  stroke="var(--color-border-strong)"
                  strokeWidth="2"
                />
              </svg>
              assets disagree, so no single span
            </span>
            {/* The intersection block gets a legend entry of its own, because it is the
                one mark on this chart that is arithmetic rather than a datum: two washes
                of one hue, the denser one being the seasons both rosters hold. */}
            <span className="inline-flex items-center gap-1">
              <svg width="26" height="9" viewBox="0 0 26 9" aria-hidden="true">
                <rect
                  x="0"
                  y="0"
                  width="26"
                  height="9"
                  fill="var(--color-accent)"
                  opacity="0.09"
                />
                <rect
                  x="10"
                  y="0"
                  width="10"
                  height="9"
                  fill="var(--color-accent)"
                  opacity="0.13"
                />
                <line
                  x1="10"
                  y1="0"
                  x2="10"
                  y2="9"
                  stroke="var(--color-accent)"
                  strokeWidth="1"
                  opacity="0.7"
                />
                <line
                  x1="20"
                  y1="0"
                  x2="20"
                  y2="9"
                  stroke="var(--color-accent)"
                  strokeWidth="1"
                  opacity="0.7"
                />
              </svg>
              your seasons, and the ones the selected roster also holds
            </span>
          </div>

          {/* WHAT THE AXIS IS. This sits above the counts on purpose: the counts read
                as a calendar claim without it, and on this league they are weak by
                construction rather than by accident - duration compresses fourteen
                dynasty rosters into a band a few seasons wide, so most rosters overlap
                most rosters. Saying that first is cheaper than letting a reader infer a
                projection and then hedging it. The arithmetic is unchanged; this is the
                framing catching up to it. See components/WindowMap.jsx. */}
          <p className="mt-1.5 text-meta leading-snug text-secondary">
            The seasons are an ordering, not a forecast. Every roster in a
            dynasty league holds players in the same narrow age range, so all
            fourteen spans land within a few seasons of each other and most of
            them overlap. Read this as who is dated earlier and who is dated
            later than you, not as a claim about a named year.
          </p>

          {/* The COUNT of the refused rows is in the seat card's synthesis; what is not
                there, and cannot be, is why the state is worth looking for.

                THE WORDS USED TO LIVE HERE, interpolated with counts computed in this
                component, and that was the bug lib/refusal.js was written for: two
                sentences about data sufficiency, in this file's own words, matching
                nothing the same conditions said anywhere else in the app and countable
                by nothing downstream. `windowRefusalSummary` owns them now, code first,
                and this is a render of a string the derivation produced. The mark is
                the drawn half of that same refusal - see RefusalMark's docstring - and
                deliberately the subordinate half: delete the glyph and the reading
                survives intact, which is the acceptance test. */}
          {windows.refusalSummary && (
            <RefusalMark className="mt-1.5">
              {windows.refusalSummary}
            </RefusalMark>
          )}
          <MetricGloss metrics={["tci"]} className="mt-0.5" />
        </div>
      ) : (
        <CoherenceFragilityQuadrant
          view={view}
          selectedId={selected}
          onSelect={select}
        />
      )}

      {/*
          THE ONE SENTENCE THAT NEEDS BOTH LENSES, and the only place on this page where
          the two boards' data is crossed. Rendered under the tabs rather than inside
          either chart, because it is true on both and belongs to neither.

          WHAT IT DELIBERATELY IS NOT: the intersection of the viewer's window with the
          quadrant's `splitTopHeavy` corner. That set is empty by near-construction and
          the arithmetic says why - a roster is only in `overlapFor(me).shared` if it has
          a readable single window, which requires a posture other than straddling, which
          requires TCI at or above the coherence floor of 55; `splitTopHeavy` requires TCI
          below the league MEDIAN. The two can only intersect in the sliver between 55 and
          a median above it, which on the live league is [55, 55.5) and holds nothing. A
          panel that renders "no rosters" on essentially every league is worse than no
          panel.

          The fragility half alone is genuinely free of the coherence axis, so this
          crosses the window map's `shared` with the quadrant's above-median-RFI half:
          three real rosters on the live league. It names them and stops - no advice, no
          grade (D6), and the median is stated as a median so nobody reads it as a bar.
        */}
      {crossed && crossed.rosters.length > 0 && (
        <div className="mt-1.5 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-2">
          <p className="text-note leading-snug text-ink/85">
            {crossed.sentence}
          </p>
          {/* Chips, not a comma list, and the same chips the seat card uses - a name a
              reader can act on should be a control wherever it appears. */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {crossed.rosters.map((r) => (
              <RosterChip key={r.rosterId} roster={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
