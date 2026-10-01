import { Card, SectionHeader, Tag } from "@/components/ui";

/**
 * MODEL VS MARKET. Two short lists of where this model's priced ordinal and Sleeper's
 * market ordinal disagree (lib/marketgap). Server component. Measurements only (D6):
 * the rows say how far apart the two ordinals sit and what moved them, never who is
 * right.
 *
 * @param {{ gaps: { higher: any[], lower: any[] }, ownerName: Map<number, string>, myRosterId?: number|null }} props
 */
export function MarketGapList({ gaps, ownerName, myRosterId = null }) {
  if (!gaps.higher.length && !gaps.lower.length) return null;
  return (
    <section aria-label="Model vs market" className="mt-3">
      <SectionHeader title="Model vs market" />
      <p className="mb-2 text-note leading-snug text-muted">
        Disagreements between this model and Sleeper&apos;s market, by ordinal. A
        measurement, not advice.
      </p>
      <div className="grid gap-2">
        <GapCard
          title="Parquet prices above the market"
          rows={gaps.higher}
          ownerName={ownerName}
          myRosterId={myRosterId}
        />
        <GapCard
          title="Parquet prices below the market"
          rows={gaps.lower}
          ownerName={ownerName}
          myRosterId={myRosterId}
        />
      </div>
    </section>
  );
}

const reasonTone = {
  production: "info",
  "rookie prior": "warn",
  model: "neutral",
};

function GapCard({ title, rows, ownerName, myRosterId }) {
  return (
    <Card className="p-3">
      <h3 className="text-note font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-meta text-muted">
          No player differs by five or more places in this direction.
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {rows.map((r) => {
            const mine = myRosterId != null && r.rosteredBy === myRosterId;
            const owner =
              r.rosteredBy == null
                ? "Unrostered"
                : mine
                  ? "Your roster"
                  : (ownerName.get(r.rosteredBy) ?? `Roster ${r.rosteredBy}`);
            return (
              <li key={r.playerId} className="py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="min-w-0 text-note font-semibold text-ink">
                    {r.name}
                    <span className="font-normal text-muted">
                      {[r.team ?? "FA", r.age != null ? `${r.age}` : null]
                        .filter(Boolean)
                        .map((s) => ` · ${s}`)
                        .join("")}
                    </span>
                  </span>
                  <span className="figure shrink-0 text-meta text-muted">
                    #{r.rank} here vs #{r.marketRank} market
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Tag tone={reasonTone[r.reason]}>{r.reason}</Tag>
                  {mine ? (
                    <Tag tone="accent">{owner}</Tag>
                  ) : (
                    <span className="text-meta text-muted">{owner}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
