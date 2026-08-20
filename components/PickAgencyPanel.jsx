/**
 * WHOSE SEASON DECIDES THE PICKS YOU HOLD, AND WHO HOLDS THE PICKS YOUR SEASONS DECIDE.
 *
 * THE LEDGER REPLACED A SPLIT BAR (SHELVED.md S10, D98). The bar divided the picks you
 * control by the picks you hold, and the fault was in the arithmetic rather than the
 * drawing: the denominator is what you HOLD, so trading your own first away raises the
 * ratio. A reader who had divested most of their own future was shown a fuller accent
 * segment than a reader who had kept it.
 *
 * What is here instead is three rows and no chart, because the three quantities do not
 * share a denominator. Rows one and two sum to what your own seasons decide; rows one and
 * three sum to what you hold. The first row is in both sums. Two overlapping sets cannot
 * be drawn as one divided bar without hiding the overlap, and the overlap is the
 * interesting part, so it is printed as a sentence underneath instead.
 *
 * THE LABELS ARE THE ENCODING. Three lines that scan identically -
 *
 *   yours to set, yours to hold
 *   yours to set, theirs to hold
 *   theirs to set, yours to hold
 *
 * - so both axes land in one reading pass without a 2x2 grid to decode. "yours" is always
 * accent-text and "theirs" is always secondary, the same word in the same colour in every
 * row, which is what makes the triplet readable as a system rather than three sentences.
 * The colour is reinforcement and never the only channel: the words themselves differ, so
 * the rows still read correctly in greyscale.
 *
 * THE RAILS ARE A VENN DIAGRAM EXPRESSED AS GUTTERS. A row that is yours to set carries
 * an accent rail on its left edge; a row that is yours to hold carries one on its right.
 * The overlap row therefore has both, which is the set relationship drawn without drawing
 * a shape. Both borders are always present and only the colour changes, so no row shifts
 * horizontally against its neighbours.
 *
 * NEVER A ZERO-COUNT ROW. `summarizeAgency` drops empty buckets and hands back a sentence
 * naming the absence instead - the honest version of the reading the old bar rendered as
 * 100% accent on a roster that had given everything away.
 *
 * THE LIST IS GROUPED, NOT PER-PICK. It used to be one native `<details>` per live pick,
 * and the sentence inside each one is a template: every pick riding on a rebuilding roster
 * expands to the same clause with a different name in it. Twelve disclosure widgets
 * therefore advertised twelve findings and held four. `groupAgency` states the shared
 * clause once and puts the picks underneath as a compact list where the season, the round
 * and the roster whose season sets each one are what actually differ. Nothing is dropped:
 * the group counts, firsts and values sum to the ungrouped list, which lib/agency's test
 * pins.
 *
 * SETTLED PICKS ARE A GROUP, NOT A FILTER. They used to be dropped from the list and
 * accounted for in a paragraph, which is a paragraph spent explaining an omission. They
 * are now the last group, ordered by the board rather than by posture, and each row prints
 * the one thing a settled pick knows that a live one cannot: its published slot. The live
 * rows carry a muted "est" after the value and the settled rows carry nothing, so the
 * difference between an exact price and a lottery spread is visible in the list itself
 * rather than only in the methodology note below it.
 *
 * Still native `<details>`, so the summary line stays scannable at 375px and the full read
 * is one tap away without any client JavaScript.
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, Tag } from "@/components/ui";
import { PostureTag } from "@/components/PostureTag";
import { groupAgency } from "@/lib/agency";
import { ordinal } from "@/lib/derive/describe";
import { fmtValue } from "@/lib/ui";
/** The one word doing the encoding, in the one colour it is always in. */
function Who({ who }) {
  return (
    <span
      className={
        who === "yours"
          ? "font-semibold text-accent-text"
          : "font-semibold text-secondary"
      }
    >
      {who}
    </span>
  );
}
function LedgerRow({ bucket, sub }) {
  return (
    <div
      className={`flex items-baseline gap-2.5 border-l-2 border-r-2 px-2 py-1.5 ${
        bucket.setter === "yours" ? "border-l-accent" : "border-l-transparent"
      } ${bucket.holder === "yours" ? "border-r-accent" : "border-r-transparent"}`}
    >
      {/* Fixed width, so the three label sentences start on the same pixel and the
          triplet can be read as three variations of one line. Firsts lead and carry the
          weight: a dynasty manager counts firsts, and the pick count is the context for
          that number rather than the number itself. */}
      <span className="w-[76px] shrink-0">
        <span className="block figure text-body leading-tight">
          <span className="font-semibold text-ink">{bucket.firsts}</span>{" "}
          <span className="text-meta text-secondary">
            {bucket.firsts === 1 ? "first" : "firsts"}
          </span>
        </span>
        <span className="block figure text-meta leading-tight text-secondary">
          {bucket.picks} {bucket.picks === 1 ? "pick" : "picks"}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body leading-tight text-ink">
          <Who who={bucket.setter} /> to set, <Who who={bucket.holder} /> to
          hold
        </span>
        {sub && (
          <span className="block figure text-meta leading-tight text-muted">
            {sub}
          </span>
        )}
      </span>
    </div>
  );
}
export function PickAgencyPanel({ reads, summary, orderLine }) {
  if (!reads.length) return null;
  const groups = groupAgency(reads);
  /*
   * WHAT THE DELETED BLOCK USED TO SAY. A card headed "What the seasons you ride on are
   * doing" listed a posture, a count and the managers for every roster whose season sets
   * a pick this roster holds - which is the third row of the ledger, stated again, above
   * a group list that names the same managers with links to their dossiers. The postures
   * and counts fold in here as the third row's own sub-line; the manager names stay in
   * the groups below, where they are already links.
   */
  const ridingSub = summary.ridingOn
    .map((b) => `${b.picks} ${b.posture === "unread" ? "unread" : b.posture}`)
    .join(" · ");
  return (
    <>
      <Card className="p-3">
        <div className="space-y-0.5">
          {summary.buckets.map((b) => (
            <LedgerRow
              key={b.key}
              bucket={b}
              sub={b.key === "holdNotSet" ? ridingSub : null}
            />
          ))}
        </div>

        {/* The overlap, as a fact rather than a percentage. */}
        {summary.denominator && (
          <p className="mt-2 text-meta leading-snug text-secondary">
            {summary.denominator}
          </p>
        )}
        {summary.absence && (
          <p className="mt-2 text-meta leading-snug text-secondary">
            {summary.absence}
          </p>
        )}

        {/* The second row is the only one with no group below it to carry its
            sentence, because you do not hold those picks. */}
        {summary.buckets.map((b) =>
          b.note ? (
            <p
              key={`${b.key}-note`}
              className="mt-2 text-note leading-relaxed text-muted"
            >
              {b.note}
            </p>
          ) : null,
        )}

        {orderLine && (
          <>
            <div className="rule my-2.5" />
            <p className="text-meta leading-snug text-secondary">
              {orderLine}{" "}
              <Link
                href="/methodology#picks"
                className="font-semibold text-accent-text"
              >
                How picks are priced
              </Link>
            </p>
          </>
        )}
      </Card>

      <ul className="mt-1.5 divide-y divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface empty:hidden">
        {groups.map((g) => (
          <li key={g.key}>
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-2.5 py-1.5">
                <ChevronRight
                  size={13}
                  aria-hidden="true"
                  className="disclosure-chevron shrink-0 text-faint group-open:rotate-90"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold leading-tight text-ink">
                    {g.title}
                  </span>
                  {/* The counts, which is what a closed group has to earn its line
                with: how many, how much, and how much of it is a first. */}
                  <span className="block figure text-meta leading-tight text-secondary">
                    {g.count} {g.count === 1 ? "pick" : "picks"} ·{" "}
                    {fmtValue(g.value)}
                    {g.firsts > 0
                      ? ` · ${g.firsts} ${g.firsts === 1 ? "first" : "firsts"}`
                      : ""}
                  </span>
                </span>
                {g.kind === "controlled" ? (
                  <Tag tone="accent">yours</Tag>
                ) : g.kind === "settled" ? (
                  <Tag>settled</Tag>
                ) : (
                  <PostureTag posture={g.posture ?? "unread"} />
                )}
              </summary>
              <div className="disclosure-body px-2.5 pb-2.5 pt-0.5">
                {/* The templated clause, once. */}
                <p className="text-note leading-relaxed text-muted">{g.note}</p>
                {/* And then the part that genuinely differs pick to pick. For a live
                pick that is the season whose standings set the slot, which is not
                the season on the pick and is the thing readers get wrong. For a
                settled pick the slot is published, so the row prints it. */}
                <ul className="mt-1.5 space-y-1">
                  {g.picks.map((r) => (
                    <li
                      key={r.key}
                      className="flex items-baseline justify-between gap-2 text-meta leading-snug"
                    >
                      <span className="min-w-0">
                        <span className="block figure font-semibold text-ink">
                          {r.shortLabel}
                          {r.pick.acquired && r.pick.fromName ? (
                            <span className="font-normal text-secondary">
                              {" "}
                              via {r.pick.fromName}
                            </span>
                          ) : null}
                        </span>
                        {r.settled ? (
                          <span className="block figure text-secondary">
                            {r.slot != null
                              ? `slot ${r.slot} of ${r.slotOf} · ${ordinal(r.overall)} overall`
                              : `the ${r.determiningSeason} season is over, and no slot for it is published here`}
                          </span>
                        ) : (
                          <span className="block text-secondary">
                            {r.controlled ? "your" : `${r.determinedByName}'s`}{" "}
                            <span className="figure">
                              {r.determiningSeason}
                            </span>{" "}
                            season sets it
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 figure text-muted">
                        {fmtValue(r.pick.value)}
                        {/* An exact price and a spread over a lottery are not the
                        same number, and the list is where the difference is
                        cheapest to show. */}
                        {!r.settled && <span className="text-faint"> est</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {g.managers.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-3">
                    {g.managers.map((m) => (
                      <Link
                        key={m.rosterId}
                        href={`/managers/${m.rosterId}`}
                        className="inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-accent-text"
                      >
                        {m.name}&apos;s dossier
                        <ChevronRight size={12} aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
