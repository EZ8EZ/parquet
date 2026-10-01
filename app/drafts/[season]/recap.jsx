import { cachedValuePlayers, slotValue } from "@/lib/valuation";
import { recapDraft } from "@/lib/draftrecap";
import { Card, DeltaValue, SectionHeader, Tag } from "@/components/ui";
import { fmtValue } from "@/lib/ui";

/**
 * "DRAFT NIGHT, MEASURED" - the value-over-slot read of one completed rookie draft.
 *
 * Which drafts get it. A complete draft that is NOT the oldest draft in the chain. The
 * oldest is treated as the startup: a startup prices veterans against a rookie-pick
 * curve it was never built for, so a value-over-slot number there would be a category
 * error rather than a measurement. This is a heuristic (a league imported mid-life has
 * a rookie draft as its oldest record and loses the section for that one season); the
 * caller passes `isRookieDraft` so the rule lives in one visible place.
 *
 * Slot cost. `slotValue(pickNo)` is the model's raw curve for an overall slot - the
 * same curve the trade calculator prices picks with - read with today's config. It is
 * NOT a snapshot of what the config said on draft night; there is no stored snapshot.
 * When the pick curve is recalibrated in lib/valuation/config.js, every cost (and so
 * every surplus) on this section moves with it automatically, with no change here.
 * The class-strength multiplier is deliberately left out: it is a forecast about a
 * class that has now been drafted, and the drafted players' own values supersede it.
 *
 * Value. Today's model value for each drafted player (`cachedValuePlayers`), so the
 * section drifts as values move; the standfirst says so. A player the model cannot
 * price is 0 and excluded from fallers/reaches by the engine (lib/draftrecap).
 *
 * Market. Sleeper dynasty ADP (`player.dynastyAdp`). Absent on the fixture/CSV corpus,
 * in which case the agreement line is simply not printed - never a made-up rho.
 *
 * Copy is a measurement throughout (D6): "value over slot", no winners or losers.
 */
export function DraftRecap({ h, board }) {
  const values = cachedValuePlayers(h);
  const recap = recapDraft({
    picks: board.picks.map((p) => ({ ...p, rosterId: p.usedByRoster })),
    valueOf: (id) => (id ? (values.get(id)?.value ?? null) : null),
    slotCost: (pickNo) => Math.round(slotValue(pickNo)),
    marketRankOf: (id) => {
      const adp = id ? h.players.get(id)?.dynastyAdp : undefined;
      return typeof adp === "number" && Number.isFinite(adp) ? adp : null;
    },
    // Names the manager on the clock that season, as resolved by getDraftBoard (D22).
    nameOfRoster: (rid) =>
      board.picks.find((p) => p.usedByRoster === rid)?.usedByName ??
      `Roster ${rid}`,
  });
  const { teams, biggestFallers, biggestReaches, marketAgreement, classTotals } =
    recap;
  const unpriced = recap.picks.filter((p) => p.unpriced).length;

  return (
    <section aria-labelledby="draft-night-measured" className="mb-4">
      <SectionHeader
        title={<span id="draft-night-measured">The class, valued today</span>}
      />
      <p className="mb-2 text-meta leading-relaxed text-muted">
        Each pick&rsquo;s value over slot is the player&rsquo;s model value today
        minus what the pick curve says that slot costs. Both are today&rsquo;s
        numbers, not a draft-night snapshot, so they move as values move.
      </p>

      <p className="mb-2 figure text-meta text-secondary">
        Class: {fmtValue(classTotals.value)} value against{" "}
        {fmtValue(classTotals.cost)} slot cost ·{" "}
        <DeltaValue n={classTotals.value - classTotals.cost} /> over slot
        {unpriced > 0 && ` · ${unpriced} unpriced`}
      </p>

      <ul className="grid gap-1.5">
        {teams.map((t) => (
          <li key={t.rosterId}>
            <Card className="p-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="min-w-0 text-body font-semibold leading-tight text-ink">
                  {t.name}
                </h3>
                <span className="shrink-0 text-meta">
                  <DeltaValue n={t.surplus} />
                  <span className="text-secondary"> over slot</span>
                </span>
              </div>
              <p className="mt-0.5 figure text-meta text-secondary">
                {t.count} {t.count === 1 ? "pick" : "picks"}
                {t.firsts > 0 && ` · ${t.firsts} in round 1`} ·{" "}
                {fmtValue(t.valueAdded)} value vs {fmtValue(t.cost)} slot cost
              </p>
              <ul className="mt-1 space-y-0.5">
                {t.picks.map((p) => (
                  <li
                    key={p.pickNo}
                    className="flex items-baseline justify-between gap-3 text-meta"
                  >
                    <span className="min-w-0 text-muted">
                      <span className="figure text-secondary">#{p.pickNo}</span>{" "}
                      {p.playerName ?? "-"}
                      {p.position ? ` · ${p.position}` : ""}
                    </span>
                    {p.unpriced ? (
                      <span className="shrink-0 text-secondary">unpriced</span>
                    ) : (
                      <span className="shrink-0">
                        <DeltaValue n={p.surplus} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ul>

      <MoverList
        title="Taken later than their value rank"
        note="by value rank within this class, today"
        picks={biggestFallers}
      />
      <MoverList
        title="Taken earlier than their value rank"
        note="by value rank within this class, today"
        picks={biggestReaches}
      />

      {marketAgreement && marketAgreement.rho !== null && (
        <p className="mt-2 text-meta leading-relaxed text-muted">
          The room&rsquo;s order agreed with Sleeper&rsquo;s dynasty market at{" "}
          <span className="figure font-semibold text-ink">
            &rho; = {marketAgreement.rho.toFixed(2)}
          </span>{" "}
          across {marketAgreement.n} picks.
        </p>
      )}
    </section>
  );
}

/**
 * Fallers / reaches. "Ahead of the market" is the brief's label; what is measured is
 * slot position against the class's MODEL value rank (`slotDelta`), and the note line
 * says so rather than letting the title overclaim.
 */
function MoverList({ title, note, picks }) {
  if (!picks.length) return null;
  return (
    <div className="mt-3">
      <h3 className="text-meta font-semibold uppercase tracking-[0.16em] text-muted">
        {title}
      </h3>
      <p className="mb-1 text-meta text-secondary">{note}</p>
      <ul className="flex flex-wrap gap-1.5">
        {picks.map((p) => (
          <li key={p.pickNo}>
            <Tag>
              <span className="figure">#{p.pickNo}</span> {p.playerName} ·
              value rank {p.classRank}
            </Tag>
          </li>
        ))}
      </ul>
    </div>
  );
}
