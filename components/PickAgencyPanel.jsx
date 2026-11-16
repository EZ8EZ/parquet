/**
 * WHOSE SEASON DECIDES THE PICKS YOU HOLD, AND WHO HOLDS THE PICKS YOUR SEASONS DECIDE.
 *
 * Three ledger rows and no chart (SHELVED.md S10, D98): the three quantities do not
 * share a denominator. Rows one and two sum to what your own seasons decide; rows one
 * and three sum to what you hold. The labels are the encoding - "yours to set, theirs to
 * hold" - with "yours" always in accent text and "theirs" always secondary, so the words
 * carry the meaning and colour only reinforces it. `summarizeAgency` never hands back a
 * zero-count row; it names the absence instead.
 *
 * Below, the groups from `groupAgency`: one row per shared clause (the clause is a
 * template, so it is stated once), opening a sheet that lists the picks it covers and
 * the season that sets each. Settled picks are the last group and print their published
 * slot; live picks carry "est" beside the value. Nothing is dropped: the group counts,
 * firsts and values sum to the ungrouped list (lib/agency's test pins it).
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, Chip, Disclosure, List, ListRow, Sheet } from "@/components/ui";
import { PostureTag } from "@/components/PostureTag";
import { groupAgency } from "@/lib/agency";
import { ordinal } from "@/lib/derive/describe";
import { fmtValue } from "@/lib/ui";

/** The one word doing the encoding, in the one colour it is always in. */
function Who({ who }) {
  return <span className={who === "yours" ? "font-semibold text-accent-text" : "font-semibold text-secondary"}>{who}</span>;
}

function LedgerRow({ bucket, sub }) {
  return (
    <li className="flex items-baseline gap-3 py-2">
      <span className="w-[76px] shrink-0">
        <span className="block figure text-body">
          <span className="font-bold text-ink">{bucket.firsts}</span>{" "}
          <span className="text-meta text-secondary">{bucket.firsts === 1 ? "first" : "firsts"}</span>
        </span>
        <span className="block figure text-meta text-secondary">
          {bucket.picks} {bucket.picks === 1 ? "pick" : "picks"}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body text-ink">
          <Who who={bucket.setter} /> to set, <Who who={bucket.holder} /> to hold
        </span>
        {sub && <span className="block figure text-meta text-muted">{sub}</span>}
      </span>
    </li>
  );
}

function groupBadge(g) {
  if (g.kind === "controlled")
    return (
      <Chip tone="accent" size="sm">
        yours
      </Chip>
    );
  if (g.kind === "settled") return <Chip size="sm">settled</Chip>;
  return <PostureTag posture={g.posture ?? "unread"} />;
}

export function PickAgencyPanel({ reads, summary, orderLine }) {
  if (!reads.length) return null;
  const groups = groupAgency(reads);
  const ridingSub = summary.ridingOn
    .map((b) => `${b.picks} ${b.posture === "unread" ? "unread" : b.posture}`)
    .join(" · ");
  const notes = summary.buckets.filter((b) => b.note).map((b) => b.note);
  const facts = [summary.denominator, summary.absence].filter(Boolean);
  return (
    <>
      <Card>
        <ul className="-my-2 divide-y divide-border">
          {summary.buckets.map((b) => (
            <LedgerRow key={b.key} bucket={b} sub={b.key === "holdNotSet" ? ridingSub : null} />
          ))}
        </ul>
        {(facts.length > 0 || notes.length > 0 || orderLine) && (
          <Disclosure className="-mb-2 mt-2" summary="How to read this">
            {facts.map((f, i) => (
              <p key={`f${i}`} className={i ? "mt-2" : undefined}>
                {f}
              </p>
            ))}
            {notes.map((n, i) => (
              <p key={`n${i}`} className="mt-2">
                {n}
              </p>
            ))}
            {orderLine && <p className="mt-2">{orderLine}</p>}
            <p className="mt-2">
              <Link href="/methodology#picks" className="font-semibold text-accent-text underline underline-offset-2">
                How picks are priced
              </Link>
            </p>
          </Disclosure>
        )}
      </Card>

      {groups.length > 0 && (
        <List className="mt-2" aria-label="Picks grouped by whose season sets them">
          {groups.map((g) => {
            const counts = `${g.count} ${g.count === 1 ? "pick" : "picks"}${
              g.firsts > 0 ? ` · ${g.firsts} ${g.firsts === 1 ? "first" : "firsts"}` : ""
            }`;
            return (
              <li key={g.key}>
                <Sheet
                  triggerLabel={`${g.title}, ${counts}. Show details`}
                  title={g.title}
                  subtitle={`${counts} · ${fmtValue(g.value)}`}
                  trigger={
                    <ListRow as="span" chevron title={g.title} badge={groupBadge(g)} meta={counts} value={fmtValue(g.value)} />
                  }
                >
                  <p className="text-note text-muted">{g.note}</p>
                  <ul className="mt-3 divide-y divide-border rounded-control bg-surface-2 px-3">
                    {g.picks.map((r) => (
                      <li key={r.key} className="flex items-baseline justify-between gap-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block figure text-body font-semibold text-ink">
                            {r.shortLabel}
                            {r.pick.acquired && r.pick.fromName ? (
                              <span className="font-normal text-secondary"> via {r.pick.fromName}</span>
                            ) : null}
                          </span>
                          <span className="block text-meta text-secondary">
                            {r.settled ? (
                              r.slot != null ? (
                                <span className="figure">
                                  slot {r.slot} of {r.slotOf} · {ordinal(r.overall)} overall
                                </span>
                              ) : (
                                `the ${r.determiningSeason} season is over, and no slot for it is published here`
                              )
                            ) : (
                              <>
                                {r.controlled ? "your" : `${r.determinedByName}'s`}{" "}
                                <span className="figure">{r.determiningSeason}</span> season sets it
                              </>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 figure text-body font-semibold text-ink">
                          {fmtValue(r.pick.value)}
                          {!r.settled && <span className="text-meta font-normal text-secondary"> est</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {g.managers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-4">
                      {g.managers.map((m) => (
                        <Link
                          key={m.rosterId}
                          href={`/managers/${m.rosterId}`}
                          className="inline-flex min-h-11 items-center gap-0.5 text-note font-semibold text-accent-text"
                        >
                          {m.name}&apos;s dossier
                          <ChevronRight size={16} aria-hidden="true" />
                        </Link>
                      ))}
                    </div>
                  )}
                </Sheet>
              </li>
            );
          })}
        </List>
      )}
    </>
  );
}
