import { Chip, List, ListRow, SectionHeader } from "@/components/ui";

/**
 * MODEL VS MARKET. Two short lists of where this model's priced ordinal and Sleeper's
 * market ordinal disagree (lib/marketgap). Server component. Measurements only (D6):
 * the rows say how far apart the two ordinals sit and what moved them, never who is
 * right. Renders nothing at all when there is no disagreement, so no empty heading.
 *
 * @param {{ gaps: { higher: any[], lower: any[] }, ownerName: Map<number, string>, myRosterId?: number|null }} props
 */
export function MarketGapList({ gaps, ownerName, myRosterId = null }) {
  if (!gaps.higher.length && !gaps.lower.length) return null;
  return (
    <section aria-labelledby="market-gap-title">
      <SectionHeader id="market-gap-title" title="Model vs market" />
      <p className="mb-2 text-note text-muted">Ordinal gaps of five or more places. Not advice.</p>
      <GapList title="Priced above the market" rows={gaps.higher} ownerName={ownerName} myRosterId={myRosterId} />
      <GapList title="Priced below the market" rows={gaps.lower} ownerName={ownerName} myRosterId={myRosterId} />
    </section>
  );
}

const reasonTone = {
  production: "info",
  "rookie prior": "warn",
  model: "neutral",
};

function GapList({ title, rows, ownerName, myRosterId }) {
  if (rows.length === 0) return null;
  return (
    <>
      <h3 className="mb-1.5 mt-3 text-note font-semibold text-ink">{title}</h3>
      <List aria-label={title}>
        {rows.map((r) => {
          const mine = myRosterId != null && r.rosteredBy === myRosterId;
          const owner =
            r.rosteredBy == null
              ? "Unrostered"
              : mine
                ? "Your roster"
                : (ownerName.get(r.rosteredBy) ?? `Roster ${r.rosteredBy}`);
          return (
            <li key={r.playerId}>
              <ListRow
                highlight={mine}
                title={r.name}
                badge={
                  <>
                    <Chip size="sm" tone={reasonTone[r.reason]}>
                      {r.reason}
                    </Chip>
                    {mine && (
                      <Chip size="sm" tone="accent">
                        You
                      </Chip>
                    )}
                  </>
                }
                meta={[r.team ?? "FA", r.age != null ? `${r.age}` : null, owner].filter(Boolean).join(" · ")}
                value={`#${r.rank}`}
                valueSub={`#${r.marketRank} market`}
              />
            </li>
          );
        })}
      </List>
    </>
  );
}
