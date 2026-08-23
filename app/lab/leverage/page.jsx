import Link from "next/link";
import { getLeagueHistory } from "@/lib/history";
import { leagueLeverage } from "@/lib/lab/leverage";
import {
  Card,
  Disclosure,
  EmptyState,
  PageHeader,
  SectionHeader,
  Stat,
} from "@/components/ui";
import { ExperimentBadge } from "@/components/ExperimentBadge";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Positional leverage - Parquet Lab",
};
const POS_LABEL = {
  PG: "Point Guard",
  SG: "Shooting Guard",
  SF: "Small Forward",
  PF: "Power Forward",
  C: "Center",
};
const pct = (x) => `${Math.round(x * 100)}%`;
/**
 * Five diverging bars, one per position - own share of the roster's positioned
 * value against the league's own mix at that position. Hand-rolled SVG (D3),
 * integer coordinates throughout for the hydration reason charts.jsx documents.
 */
function LeverageBars({ positions }) {
  const W = 320;
  const rowH = 34;
  const H = positions.length * rowH + 8;
  const midX = Math.round(W / 2);
  const maxAbs = Math.max(0.02, ...positions.map((p) => Math.abs(p.deviation)));
  const trackHalf = Math.round(W / 2 - 70);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Each position's share of your value against the league's own mix"
    >
      <line
        x1={midX}
        y1={2}
        x2={midX}
        y2={H - 6}
        stroke="var(--color-border)"
        strokeWidth={1}
      />
      {positions.map((p, i) => {
        const y = i * rowH + 10;
        const w = Math.round((Math.abs(p.deviation) / maxAbs) * trackHalf);
        const positive = p.deviation >= 0;
        const barX = positive ? midX : midX - w;
        const fill =
          p.leverage > 0.002
            ? "var(--color-positive)"
            : p.leverage < -0.002
              ? "var(--color-negative)"
              : "var(--color-border-strong)";
        return (
          <g key={p.pos}>
            <text
              x={midX - trackHalf - 6}
              y={y + 5}
              textAnchor="end"
              fontSize="11"
              fill="var(--color-ink)"
              fontWeight="600"
            >
              {p.pos}
            </text>
            <rect
              x={barX}
              y={y - 6}
              width={Math.max(1, w)}
              height={12}
              rx={2}
              fill={fill}
            />
            <text
              x={midX + trackHalf + 6}
              y={y + 5}
              fontSize="10"
              fill="var(--color-muted)"
              className="figure"
            >
              {pct(p.ownShare)} vs {pct(p.leagueShare)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
function RosterRow({ p, self }) {
  return (
    <li
      className={`flex items-center gap-2.5 border-b border-border py-2 last:border-0 ${self ? "bg-surface-2" : ""}`}
    >
      <span className="w-9 shrink-0 text-center figure text-lede font-semibold text-ink">
        {p.score ?? "-"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-1 text-note font-semibold leading-tight text-ink">
          {p.teamName ?? p.ownerName}
          {self ? " (you)" : ""}
        </span>
        <span className="block line-clamp-1 text-micro leading-snug text-faint">
          {p.bestPosition
            ? `edge: ${p.bestPosition.pos}`
            : "no edge"}
          {" · "}
          {p.worstPosition ? `exposure: ${p.worstPosition.pos}` : "no exposure"}
        </span>
      </span>
      <Link
        href={`/managers/${p.rosterId}`}
        className="shrink-0 text-meta text-accent-text"
      >
        roster
      </Link>
    </li>
  );
}
export default async function LeveragePage() {
  const h = await getLeagueHistory();
  const all = leagueLeverage(h);
  if (all.length === 0) {
    return (
      <div>
        <PageHeader
          kicker="The Lab"
          title="Where you can actually deal from"
          action={<ExperimentBadge />}
        />
        <EmptyState title="No league to read leverage from" />
      </div>
    );
  }
  const myRosterId = h.me.rosterId ?? all[0].rosterId;
  const mine = all.find((p) => p.rosterId === myRosterId) ?? all[0];
  return (
    <div>
      <PageHeader
        kicker="The Lab"
        title="Where you can actually deal from"
        subtitle={`${mine.teamName ?? mine.ownerName}, measured against this league's own positional mix.`}
        action={<ExperimentBadge />}
      />
      <Card>
        <p className="text-body leading-relaxed text-ink">
          Dynasty Duration asks when your value arrives. The Fragility Index asks
          how much of it rides on a handful of assets. Neither asks WHERE your
          value sits relative to the other thirteen rosters - which position you
          could actually deal from because the league is short of it and you are
          not, and which position is a real exposure because the league is short
          of it and so are you.
        </p>
        <p className="mt-2 text-body leading-relaxed text-muted">
          50 means your position mix matches the league&apos;s own - not that your
          roster is average. A roster with far less total value than anyone else
          can still read 50, or even above it, if its value is spread across
          positions the same way the league&apos;s is.
        </p>
      </Card>
      {mine.score == null ? (
        <Card className="mt-3">
          <p className="text-body text-muted">{mine.read}</p>
        </Card>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat
              label="Leverage"
              value={mine.score}
              tone={
                mine.score >= 65
                  ? "positive"
                  : mine.score <= 35
                    ? "negative"
                    : "neutral"
              }
            />
            <Stat
              label="Edge"
              value={mine.bestPosition?.pos ?? "-"}
              sub={
                mine.bestPosition
                  ? POS_LABEL[mine.bestPosition.pos]
                  : undefined
              }
            />
            <Stat
              label="Exposure"
              value={mine.worstPosition?.pos ?? "-"}
              sub={
                mine.worstPosition
                  ? POS_LABEL[mine.worstPosition.pos]
                  : undefined
              }
            />
          </div>
          <div className="mt-3">
            <LeverageBars positions={mine.positions} />
            <div className="flex gap-3 text-micro text-faint">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-positive" />
                real edge
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-negative" />
                real exposure
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-border-strong" />
                close to league mix
              </span>
            </div>
          </div>
          <Card className="mt-3">
            <p className="text-body leading-relaxed text-ink">{mine.read}</p>
          </Card>
        </>
      )}
      <SectionHeader title="Every roster in the league" />
      <ul>
        {all.map((p) => (
          <RosterRow key={p.rosterId} p={p} self={p.rosterId === myRosterId} />
        ))}
      </ul>
      <div className="mt-5">
        <Disclosure summary="What this cannot know">
          <ul className="space-y-1.5">
            <li className="text-meta leading-snug text-muted">
              This is a pure supply-side read of where value already sits, not a
              demand signal from the other thirteen managers. A position can be
              scarce leaguewide and a specific manager can still have no interest
              in yours this week.
            </li>
            <li className="text-meta leading-snug text-muted">
              Draft picks are not priced positionally and are excluded entirely -
              unlike Dynasty Duration and the Fragility Index, which both price
              picks. A pick-heavy, player-light roster is scored on its player mix
              alone.
            </li>
            <li className="text-meta leading-snug text-muted">
              Two of this league&apos;s seven starting lineup slots are UTIL and
              take any position; they are excluded from the scarcity calculation
              entirely rather than credited to whichever position is thinnest.
            </li>
            <li className="text-meta leading-snug text-muted">
              This is a snapshot of today&apos;s rostered pool. A scarce position
              can turn shallow the moment a deep rookie class lands there, and
              since picks are unpriced here this index would not see it coming.
            </li>
            <li className="text-meta leading-snug text-muted">
              It says nothing about quality beyond what asset value already
              prices, and nothing about whether the asset carrying your edge is
              actually available to trade.
            </li>
          </ul>
        </Disclosure>
      </div>
      <p className="mt-2 text-meta leading-snug text-secondary">
        Positions and values come from the same model as{" "}
        <Link href="/values" className="text-accent-text">
          asset values
        </Link>
        . This is an unproven read on a real, structural question - it may not
        hold up, and unlike Dynasty Duration and the Fragility Index it has not
        earned a permanent page yet.
      </p>
    </div>
  );
}
