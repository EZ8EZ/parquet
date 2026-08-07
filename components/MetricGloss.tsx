/**
 * In-place plain-language definitions for the two proprietary indexes, for any
 * surface that shows TCI or RFI as a bare number.
 *
 * The problem this solves: "62 TCI" is legible to the manager who has lived with
 * the app and gibberish to a leaguemate seeing it for the first time. The fix is
 * NOT a tour or a tooltip library - it is one quiet, closed-by-default <details>
 * disclosure (the same native pattern the commissioner page and the recap already
 * use) that a first-time reader can open, read in fifteen seconds, and close.
 * Regulars never pay for it: closed, it is one faint line.
 *
 * The caveats are load-bearing, not fine print. Each definition carries the thing
 * the index deliberately does NOT measure, because that refusal is what makes the
 * number trustworthy (see D23: low fragility is not the same as good). A test pins
 * those phrases so a future copy edit cannot quietly flatten them into praise.
 */
import Link from "next/link";
import { ChevronRight, HelpCircle } from "lucide-react";
import { cn } from "@/lib/ui";

export type GlossMetric = "tci" | "rfi";

/** Exported as data so the copy test can hold the exact shipped words. */
export const METRIC_GLOSS: Record<
  GlossMetric,
  { abbr: string; name: string; scale: string; body: string }
> = {
  tci: {
    abbr: "TCI",
    name: "Timeline Coherence Index",
    scale: "0-100",
    body:
      "Every asset pays off at some point in time - a rookie later, a veteran now, " +
      "a far-out pick after that. TCI measures whether a roster's assets agree " +
      "about when. It is direction-free on purpose: a committed rebuild and a " +
      "committed title push both score high, because it measures whether there is " +
      "a plan, not whether the plan is good. The one reading it calls bad is " +
      "straddling - value split across two timelines, serving neither.",
  },
  rfi: {
    abbr: "RFI",
    name: "Roster Fragility Index",
    scale: "0-100, higher is more fragile",
    body:
      "If the wrong player went down tonight, how much of the season goes with " +
      "him? Built by deleting each player and re-solving the best legal lineup " +
      "from who is left, plus how concentrated the value is and how much sits in " +
      "bodies that miss games. Low is not the same as good: a torn-down roster " +
      "with nothing to lose scores mid-pack, because there is nothing left to " +
      "fail. Picks are excluded - a future first cannot fill a lineup slot tonight.",
  },
};

/**
 * Shared footnote: the NUMBERS are absolute, the WORDS beside them are relative.
 *
 * An earlier version of this line said both indexes were measured against the
 * league's own spread. That is false and duration.ts says so in its own comment:
 * a roster's TCI depends only on its own assets, which is exactly why the digest
 * can subtract two readings and get a real movement. What IS league-relative is
 * the labelling - posture comes from `shortnessPercentile`, the fragility band
 * from `fragilityPercentile` - so the note now separates the two.
 */
export const METRIC_GLOSS_NOTE =
  "Each index is computed from a roster's own assets, so it does not move when " +
  "someone else trades. The labels beside them are league-relative: postures " +
  "like contending, and bands like brittle, come from where a roster sits " +
  "against the other thirteen. Both read the roster as it stands tonight.";

export function MetricGloss({
  metrics = ["tci", "rfi"],
  className,
}: {
  metrics?: GlossMetric[];
  className?: string;
}) {
  const label =
    metrics.length === 1
      ? `What ${METRIC_GLOSS[metrics[0]].abbr} measures`
      : "What TCI and RFI measure";
  return (
    <details className={cn("group", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-faint transition-colors hover:text-accent">
        <HelpCircle size={12} aria-hidden="true" className="shrink-0" />
        {label}
        <ChevronRight
          size={12}
          aria-hidden="true"
          className="transition-transform group-open:rotate-90"
        />
      </summary>
      <div className="mb-2 space-y-2 rounded-[--radius-sm] border border-border bg-surface/60 p-2.5">
        {metrics.map((m) => {
          const g = METRIC_GLOSS[m];
          return (
            <p key={m} className="text-[12px] leading-snug text-muted">
              <span className="font-semibold text-ink">
                {g.abbr} · {g.name}
              </span>{" "}
              <span className="font-mono text-[11px] tnum text-faint">
                ({g.scale})
              </span>
              <br />
              {g.body}
            </p>
          );
        })}
        <p className="text-[11px] leading-snug text-faint">{METRIC_GLOSS_NOTE}</p>
        <Link
          href="/methodology"
          className="inline-flex min-h-11 items-center gap-0.5 text-[11px] font-semibold text-accent"
        >
          The full method
          <ChevronRight size={12} aria-hidden="true" />
        </Link>
      </div>
    </details>
  );
}
