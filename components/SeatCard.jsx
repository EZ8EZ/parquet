"use client";
/**
 * THE SEAT CARD - where the viewer's own value lands, and who is standing in it.
 *
 * ---------------------------------------------------------------------------------
 * WHY THE PAGE OPENS HERE
 * ---------------------------------------------------------------------------------
 * /league used to open on four posture-census tiles: a league-wide tally, three of whose
 * four counts were counts of quartile membership (SHELVED.md S12). It occupied the highest
 * slot on the page and answered a question nobody arrives with. The question people
 * arrive with is about their own seat - when does MY value land, and who else is dated
 * into it - and every number needed to answer it was already computed and scattered.
 *
 * So this is the first thing on the page, full width, in the app's standing
 * "this is about you" treatment (`border-accent-edge` + `bg-accent-wash`, the same pair
 * the selected-roster panel wears when the selection is the viewer).
 *
 * ---------------------------------------------------------------------------------
 * IT RENDERS EVERY STATE `windowSynthesis` CAN PRODUCE, NOT JUST THE COMMON ONE
 * ---------------------------------------------------------------------------------
 * `lib/metrics/window.js` can say four different things about the viewer's own window,
 * and three of them are refusals:
 *
 *   window       a readable single span. The span is the largest figure on the page.
 *   split        the assets disagree; SPLIT_ROSTER, with the centroid it declined to
 *                publish as a window carried alongside it.
 *   unreadable   NO_RECORD (nothing priced at all) or INSUFFICIENT_SAMPLE (one or two
 *                priced assets, below the floor where quartiles can separate).
 *   null         no roster identified for the viewer at all.
 *
 * THE REFUSALS USED TO PRINT AS UNMARKED PLAIN TEXT HERE, which is precisely the failure
 * lib/refusal.js exists to end: /league rendered `windowSynthesis` ungated, so a refused
 * roster's stated refusal arrived looking exactly like a reading, while /plan rendered
 * the same string gated behind `state === "window"` and so showed a refused roster
 * nothing at all. Two pages, one function, two different wrong answers. This card is now
 * the one owner: the refusal renders THROUGH `RefusalMark`, with the code as the figure
 * where a span would otherwise be, and /plan links here instead of keeping its own copy.
 *
 * The code in the figure slot is deliberate and is D95's rule, not a shortcut. A refusal
 * that renders as a dash reads as a missing number, which is a claim the derivation just
 * declined to make; `windowShort` returns the code for the same reason.
 *
 * ---------------------------------------------------------------------------------
 * THE COMPARISON BUCKETS ARE NAMES NOW, AND THEY SELECT
 * ---------------------------------------------------------------------------------
 * `overlapFor` has always computed the real roster identities for shared / earlier /
 * later / samePeak / unresolved, and every surface in the app reduced them to `.length`
 * before printing. "6 rosters overlap that" is a fact a reader cannot act on; six names
 * are six conversations. So the buckets render as named chips, and each chip is a
 * selector - the same click-to-select mechanism the ranking rows use, because a page with
 * two selection idioms has none.
 *
 * The buckets are an exact PARTITION of the other thirteen rosters, which took one
 * adjustment to be true: `samePeak` is a SUBSET of `shared` by construction (equal peaks
 * means both spans contain that season, so they intersect), so rendering both as peers
 * would print some rosters twice. `shared` is therefore split into "peaks with you" and
 * "overlaps, peaks elsewhere", and every roster appears exactly once.
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { RefusalMark } from "@/components/RefusalMark";
import { RosterChip } from "@/components/LeagueSelection";
export function SeatCard({ seat }) {
  const { rank, teams, state, code, span, peak, synthesis, buckets } = seat;
  const readable = state === "window";
  return (
    <section className="rounded-[--radius] border border-accent-edge bg-accent-wash p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-meta font-semibold uppercase tracking-[0.14em] text-accent-text">
            Your seat
          </h2>
          {/*
              THE LARGEST FIGURE ON THE PAGE, and what it is depends on whether there is
              one. A readable span prints as the span; a refused one prints its CODE at
              the same size, because the refusal is the reading and shrinking it into a
              footnote would be the dash bug with extra steps.
            */}
          <p
            className={
              `mt-0.5 font-display font-semibold leading-none text-ink ` +
              (readable ? "figure text-display" : "text-lede")
            }
          >
            {readable ? span : (code ?? "no roster")}
          </p>
          {readable && peak != null && (
            <p className="mt-1 figure text-note text-secondary">
              heaviest {peak}
            </p>
          )}
        </div>
        {rank > 0 && (
          <div className="shrink-0 text-right">
            <p className="figure text-lede font-semibold leading-none text-ink">
              {rank}
              <span className="text-note font-normal text-secondary">
                /{teams}
              </span>
            </p>
            <p className="mt-0.5 text-micro uppercase tracking-wide text-secondary">
              by asset value
            </p>
          </div>
        )}
      </div>

      {/*
          THE SYNTHESIS, FOR THE REFUSED STATES ONLY, and the reason is duplication
          measured on the live page rather than a preference.

          `windowSynthesis` is COUNTS ("5 rosters overlap that, 4 of them heaviest in
          2030 exactly as you are. 6 are dated entirely after you."). The buckets below
          are the same arithmetic with the rosters NAMED, and the count printed beside
          each label. Rendering both put every number on this card twice, in prose and
          then as a figure three lines later - which is exactly the density this page was
          restructured to stop.

          For a REFUSED window there are no buckets - `overlapFor` returns null, because a
          roster whose own assets disagree about when its value arrives has no span to
          place the other thirteen against - so the synthesis is the entire reading, and
          it is the one thing on this card that has to render. It goes through
          `RefusalMark` because that is what it is: the function returns
          `refusalSentence(...)` for those branches, and printing that as ordinary prose
          is what made a refusal look like a finding on this page for a round.

          The ordering caveat the synthesis closes with (spans sit close together;
          overlapping is the ordinary case) is not lost - it is under the chart that
          draws it, where it belongs, in components/LeagueBoard.jsx.
        */}
      {synthesis && !readable && (
        <RefusalMark className="mt-2 border-t border-accent-edge/60 pt-2">
          {synthesis}
        </RefusalMark>
      )}

      {/*
          THE NAMED BUCKETS. Only rendered for a readable window, because `overlapFor`
          returns null for anything else - a roster whose own assets disagree about when
          its value arrives has no span to place the other thirteen against, and inventing
          one to fill this space is the inference D19 refuses.
        */}
      {buckets.length > 0 && (
        <div
          role="group"
          aria-label="Rosters compared with your window"
          className="mt-2 space-y-1.5 border-t border-accent-edge/60 pt-2"
        >
          {buckets.map((b) => (
            <div key={b.key}>
              <p className="text-micro uppercase tracking-wide text-secondary">
                {b.label}
                <span className="ml-1 figure normal-case tracking-normal text-ink">
                  {b.rosters.length}
                </span>
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {b.rosters.map((r) => (
                  <RosterChip key={r.rosterId} roster={r} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* /plan is the page whose subject is the decision rather than the reading, and
          it used to print its own copy of the synthesis above. It links here now, so
          this link is the return leg. */}
      <Link
        href="/plan"
        className="mt-1 inline-flex min-h-11 items-center gap-0.5 text-meta font-semibold text-accent-text"
      >
        What to do about it
        <ChevronRight size={13} aria-hidden="true" />
      </Link>
    </section>
  );
}
