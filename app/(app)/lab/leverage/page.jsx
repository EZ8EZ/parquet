import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { leagueLeverage } from "@/lib/lab/leverage";
import { CHART_NEUTRAL, divergingFill } from "@/lib/chart-colors";
import {
  Card,
  Chip,
  Disclosure,
  EmptyState,
  List,
  ListRow,
  PageHeader,
  SectionHeader,
  StatTile,
} from "@/components/ui";
import { Onward } from "@/components/Onward";
/**
 * POSITIONAL LEVERAGE (experiment). Answers "which position could I deal from, and
 * where am I exposed?": the score, the edge and the exposure first, each position's
 * share against the league's, then every roster. All figures from lib/lab/leverage.
 */
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
/** Same thresholds the old bar colours used: a real edge, a real exposure, or neither. */
const leverageWord = (l) => (l > 0.002 ? "edge" : l < -0.002 ? "exposure" : "close");
/**
 * Each position's share of your value against the league's own mix, as a centre-split
 * bar with HTML labels (DESIGN.md charts: no <text> in a scaling viewBox). Direction
 * and length carry the deviation; the printed shares and the word carry it again, so
 * the diverging hue is never the only signal.
 */
function LeverageBars({ positions }) {
  const maxAbs = Math.max(0.02, ...positions.map((p) => Math.abs(p.deviation)));
  return (
    <ul aria-label="Each position's share of your value against the league's own mix" className="space-y-3">
      {positions.map((p) => {
        const half = Math.min(50, (Math.abs(p.deviation) / maxAbs) * 50);
        const word = leverageWord(p.leverage);
        return (
          <li key={p.pos}>
            <div className="flex items-baseline justify-between gap-2 text-note">
              <span className="font-semibold text-ink">
                {p.pos} <span className="font-normal text-secondary">{word}</span>
              </span>
              <span className="figure text-muted">
                {pct(p.ownShare)} vs {pct(p.leagueShare)}
              </span>
            </div>
            <span aria-hidden="true" className="relative mt-1 block h-2 overflow-hidden rounded-full bg-elevated">
              <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
              <span
                className="absolute inset-y-0 rounded-full"
                style={{
                  [p.deviation >= 0 ? "left" : "right"]: "50%",
                  width: `${Math.max(1, half)}%`,
                  background: word === "close" ? CHART_NEUTRAL : divergingFill(p.leverage),
                }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
export default async function LeveragePage() {
  const h = await getLeagueHistory();
  const all = leagueLeverage(h);
  const header = (subtitle) => (
    <PageHeader
      kicker="Trade · Lab"
      title="Positional leverage"
      subtitle={subtitle}
      below={
        <div className="mt-2">
          <Chip tone="warn" icon={FlaskConical}>
            Experiment
          </Chip>
        </div>
      }
    />
  );
  if (all.length === 0) {
    return (
      <div>
        {header()}
        <EmptyState title="No league to read leverage from" />
      </div>
    );
  }
  const myRosterId = h.me.rosterId ?? all[0].rosterId;
  const mine = all.find((p) => p.rosterId === myRosterId) ?? all[0];
  return (
    <div>
      {header(`${mine.teamName ?? mine.ownerName} against the league's mix`)}
      {mine.score == null ? (
        <Card>
          <p className="text-body text-muted">{mine.read}</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {/* Ink, not green/red: 50 means your mix matches the league's, not average. */}
            <StatTile label="Leverage" value={`${mine.score}`} sub="50 = league mix" />
            <StatTile
              label="Edge"
              value={mine.bestPosition?.pos ?? "none"}
              sub={mine.bestPosition ? POS_LABEL[mine.bestPosition.pos] : undefined}
            />
            <StatTile
              label="Exposure"
              value={mine.worstPosition?.pos ?? "none"}
              sub={mine.worstPosition ? POS_LABEL[mine.worstPosition.pos] : undefined}
            />
          </div>
          <Card className="mt-2">
            <p className="mb-3 text-meta text-secondary">Your share vs the league&apos;s, by position</p>
            <LeverageBars positions={mine.positions} />
          </Card>
          <Disclosure className="mt-1" summary="The read">
            {mine.read}
          </Disclosure>
        </>
      )}
      <Disclosure summary="What this measures">
        <p>
          Dynasty Duration asks when your value arrives. The Fragility Index asks how much
          of it rides on a handful of assets. Neither asks where your value sits relative
          to the other thirteen rosters: which position you could deal from because the
          league is short of it and you are not, and which is a real exposure because the
          league is short of it and so are you.
        </p>
        <p className="mt-2">
          50 means your position mix matches the league&apos;s own, not that your roster is
          average. A roster with far less total value than anyone else can still read 50,
          or above it, if its value is spread across positions the same way.
        </p>
      </Disclosure>

      <SectionHeader title="Every roster" />
      <List aria-label="Every roster's leverage">
        {all.map((p) => {
          const self = p.rosterId === myRosterId;
          return (
            <li key={p.rosterId}>
              <ListRow
                href={`/managers/${p.rosterId}`}
                highlight={self}
                leading={p.score ?? "-"}
                title={p.teamName ?? p.ownerName}
                badge={
                  self ? (
                    <Chip size="sm" tone="accent">
                      You
                    </Chip>
                  ) : null
                }
                meta={`${p.bestPosition ? `Edge ${p.bestPosition.pos}` : "No edge"} · ${p.worstPosition ? `exposure ${p.worstPosition.pos}` : "no exposure"}`}
              />
            </li>
          );
        })}
      </List>

      <Disclosure className="mt-4" summary="What this cannot know">
        <ul className="space-y-2">
          <li>
            A pure supply-side read of where value already sits, not a demand signal from
            the other thirteen managers. A position can be scarce leaguewide and a specific
            manager can still have no interest in yours this week.
          </li>
          <li>
            Draft picks are not priced positionally and are excluded entirely, unlike
            Dynasty Duration and the Fragility Index. A pick-heavy, player-light roster is
            scored on its player mix alone.
          </li>
          <li>
            Two of this league&apos;s seven starting slots are UTIL and take any position;
            they are excluded from the scarcity calculation rather than credited to
            whichever position is thinnest.
          </li>
          <li>
            A snapshot of today&apos;s rostered pool. A scarce position can turn shallow the
            moment a deep rookie class lands there, and since picks are unpriced here this
            index would not see it coming.
          </li>
          <li>
            It says nothing about quality beyond what asset value already prices, and
            nothing about whether the asset carrying your edge is actually available.
          </li>
          <li>
            Positions and values come from the same model as{" "}
            <Link href="/values" className="font-semibold text-accent-text underline underline-offset-2">
              asset values
            </Link>
            . An unproven read on a real, structural question: it may not hold up, and it
            has not earned a permanent page yet.
          </li>
        </ul>
      </Disclosure>
      <Onward from="/lab/leverage" />
    </div>
  );
}
