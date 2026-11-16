import { cachedValuePlayers, slotValue } from "@/lib/valuation";
import { recapDraft } from "@/lib/draftrecap";
import { Chip, Delta, Disclosure, List, ListRow, Sheet, StatTile } from "@/components/ui";
import { fmtValue } from "@/lib/ui";

/**
 * THE CLASS, VALUED TODAY - the value-over-slot read of one completed rookie draft
 * (lib/draftrecap). Shown for a complete draft that is not the oldest in the chain
 * (the oldest is treated as the startup, where a rookie-pick curve does not apply).
 *
 * Slot cost is `slotValue(pickNo)` read with today's config and value is today's model
 * value, so the read drifts as values move; there is no draft-night snapshot. Market
 * agreement uses Sleeper dynasty ADP and is simply not printed when absent, never a
 * made-up rho. Copy is a measurement throughout (D6): value over slot, no winners.
 *
 * Layout: the class totals as tiles, one row per team opening its picks in a sheet,
 * the movers as chips, and the method one tap away.
 */
export function computeRecap(h, board) {
  const values = cachedValuePlayers(h);
  return recapDraft({
    picks: board.picks.map((p) => ({ ...p, rosterId: p.usedByRoster })),
    valueOf: (id) => (id ? (values.get(id)?.value ?? null) : null),
    slotCost: (pickNo) => Math.round(slotValue(pickNo)),
    marketRankOf: (id) => {
      const adp = id ? h.players.get(id)?.dynastyAdp : undefined;
      return typeof adp === "number" && Number.isFinite(adp) ? adp : null;
    },
    nameOfRoster: (rid) => board.picks.find((p) => p.usedByRoster === rid)?.usedByName ?? `Roster ${rid}`,
  });
}

export function DraftRecap({ recap, meRosterId }) {
  const { teams, biggestFallers, biggestReaches, marketAgreement, classTotals } = recap;
  const unpriced = recap.picks.filter((p) => p.unpriced).length;
  const over = classTotals.value - classTotals.cost;
  return (
    <section aria-label="The class, valued today">
      <div className="grid grid-cols-3 gap-2">
        <StatTile size="sm" label="Class value" value={fmtValue(classTotals.value)} sub="today" />
        <StatTile size="sm" label="Slot cost" value={fmtValue(classTotals.cost)} sub="pick curve" />
        <StatTile
          size="sm"
          label="Over slot"
          value={`${over > 0 ? "+" : ""}${fmtValue(over)}`}
          sub={unpriced > 0 ? `${unpriced} unpriced` : "whole class"}
        />
      </div>

      <h2 className="mb-2 mt-4 text-note font-semibold text-ink">By team, value over slot</h2>
      <List aria-label="Teams by value over slot">
        {teams.map((t) => {
          const mine = t.rosterId === meRosterId;
          const meta = `${t.count} ${t.count === 1 ? "pick" : "picks"}${t.firsts > 0 ? ` · ${t.firsts} in round 1` : ""}`;
          return (
            <li key={t.rosterId}>
              <Sheet
                triggerLabel={`${t.name}: ${t.surplus > 0 ? "+" : ""}${t.surplus} over slot. Show details`}
                title={t.name}
                subtitle={`${fmtValue(t.valueAdded)} value against ${fmtValue(t.cost)} slot cost`}
                trigger={
                  <ListRow
                    as="span"
                    chevron
                    highlight={mine}
                    title={t.name}
                    badge={
                      mine ? (
                        <Chip size="sm" tone="accent">
                          You
                        </Chip>
                      ) : null
                    }
                    meta={meta}
                    value={<Delta n={t.surplus} className="text-body" />}
                    valueSub="over slot"
                  />
                }
              >
                <ul className="divide-y divide-border rounded-control bg-surface-2 px-3">
                  {t.picks.map((p) => (
                    <li key={p.pickNo} className="flex items-baseline justify-between gap-3 py-2.5 text-note">
                      <span className="min-w-0 text-ink">
                        <span className="figure text-secondary">#{p.pickNo}</span> {p.playerName ?? "unknown"}
                        {p.position ? <span className="text-secondary"> · {p.position}</span> : null}
                      </span>
                      {p.unpriced ? (
                        <span className="shrink-0 text-secondary">unpriced</span>
                      ) : (
                        <Delta n={p.surplus} className="shrink-0" />
                      )}
                    </li>
                  ))}
                </ul>
              </Sheet>
            </li>
          );
        })}
      </List>

      <MoverList title="Taken later than their value rank" picks={biggestFallers} />
      <MoverList title="Taken earlier than their value rank" picks={biggestReaches} />

      {marketAgreement && marketAgreement.rho !== null && (
        <p className="mt-3 text-meta text-secondary">
          Order against Sleeper&rsquo;s dynasty market:{" "}
          <span className="figure font-semibold text-ink">&rho; = {marketAgreement.rho.toFixed(2)}</span>, n ={" "}
          <span className="figure">{marketAgreement.n}</span> picks
        </p>
      )}
      <Disclosure summary="How value over slot is measured">
        Each pick&rsquo;s value over slot is the player&rsquo;s model value today minus what the pick curve says
        that slot costs. Both are today&rsquo;s numbers, not a draft-night snapshot, so they move as values move.
        Movers rank by model value within this class, today. A difference, not a grade.
      </Disclosure>
    </section>
  );
}

function MoverList({ title, picks }) {
  if (!picks.length) return null;
  return (
    <div className="mt-4">
      <h2 className="mb-2 text-note font-semibold text-ink">{title}</h2>
      <ul className="flex flex-wrap gap-1.5">
        {picks.map((p) => (
          <li key={p.pickNo}>
            <Chip>
              <span className="figure">#{p.pickNo}</span> {p.playerName} · value rank {p.classRank}
            </Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}
