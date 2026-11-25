import { TeamAvatar } from "@/components/TeamAvatar";
import { PostureGlyph } from "@/components/PostureTag";
import { ButtonLink, Chip, List, ListRow, Sheet, StatTile } from "@/components/ui";
import { ordinal } from "@/lib/derive/describe";
import { fmtValue } from "@/lib/ui";

function Fact({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-note text-secondary">{label}</dt>
      <dd className="min-w-0 text-right figure text-note font-semibold text-ink">{children}</dd>
    </div>
  );
}

/**
 * The standings as tappable rows: place, team, W-L and points for. A tap opens the
 * team in a bottom sheet (record, points, value and the window reading) with the
 * dossier one button away. `details` is the power ranking's precomputed row per
 * roster id; nothing is derived here.
 */
export function Standings({ standings, details = {} }) {
  const { rows, hasRecords } = standings;
  return (
    <List>
      {rows.map((r, i) => {
        const d = details[r.rosterId];
        const record = r.wins != null ? `${r.wins}-${r.losses}` : "–";
        const place = hasRecords ? (r.rank ?? "–") : i + 1;
        return (
          <li key={r.rosterId}>
            <Sheet
              triggerHint="Show details"
              title={r.name}
              subtitle={r.ownerName}
              trigger={
                <ListRow
                  as="span"
                  chevron
                  highlight={r.isMe}
                  leading={place}
                  avatar={
                    <TeamAvatar
                      name={r.name}
                      avatarId={r.avatarId}
                      teamLogoUrl={r.teamLogoUrl}
                      size="sm"
                      className="rounded-full"
                    />
                  }
                  title={r.name}
                  badge={r.isMe ? <Chip tone="accent" size="sm">You</Chip> : null}
                  meta={`Value #${r.valueRank}`}
                  value={
                    <>
                      <span className="sr-only">record </span>
                      {record}
                    </>
                  }
                  valueSub={r.pointsFor != null ? `${r.pointsFor.toLocaleString("en-US", { maximumFractionDigits: 1 })} PF` : null}
                />
              }
            >
              <div className="grid grid-cols-3 gap-2">
                <StatTile className="bg-surface-2" size="sm" label="Record" value={record} sub={hasRecords && r.rank ? `${ordinal(r.rank)} place` : "no games"} />
                <StatTile
                  className="bg-surface-2"
                  size="sm"
                  label="Points for"
                  value={r.pointsFor != null ? r.pointsFor.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "unknown"}
                  sub={r.pfRank ? `${ordinal(r.pfRank)} most` : null}
                />
                <StatTile className="bg-surface-2" size="sm" label="Value" value={`#${r.valueRank}`} sub={d ? fmtValue(d.totalValue) : null} />
              </div>
              {d && (
                <dl className="mt-3 divide-y divide-border">
                  <Fact label="Window">{d.window ?? "unknown"}</Fact>
                  <Fact label="Posture">
                    {d.posture ? (
                      <>
                        <PostureGlyph posture={d.posture} className="mr-1" />
                        {d.posture}
                      </>
                    ) : (
                      "unknown"
                    )}
                  </Fact>
                  <Fact label="TCI">{d.tci ?? "unknown"}</Fact>
                  <Fact label="Fragility (RFI)">{d.fragility ?? "unknown"}</Fact>
                  <Fact label="Core age">{d.age.replace(/^age /, "")}</Fact>
                </dl>
              )}
              <ButtonLink href={`/managers/${r.rosterId}`} block className="mt-4">
                {r.isMe ? "Open your dossier" : "Open the dossier"}
              </ButtonLink>
            </Sheet>
          </li>
        );
      })}
    </List>
  );
}
