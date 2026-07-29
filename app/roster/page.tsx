import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { analyzeRoster } from "@/lib/roster";
import { valuePlayers } from "@/lib/valuation";
import { Card, Tag } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { ValueAssetRow } from "@/components/ValuesList";
import { AgeStrip, BarChart } from "@/components/charts";
import { fmtValue } from "@/lib/ui";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperTeamUrl } from "@/lib/sleeperLinks";

export const dynamic = "force-dynamic";

const WINDOW_COPY: Record<
  string,
  { tone: "info" | "accent" | "positive"; label: string; note: string }
> = {
  rebuilding: {
    tone: "info",
    label: "Rebuilding / ascending",
    note: "Your core skews young - time is on your side.",
  },
  "win-now": {
    tone: "accent",
    label: "Win-now window",
    note: "Your core is aging - the window is open now, not later.",
  },
  balanced: {
    tone: "positive",
    label: "Balanced",
    note: "A mixed-age core - you can pivot either direction.",
  },
};

export default async function RosterPage() {
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;
  if (rosterId == null) {
    return <p className="text-muted">Couldn&apos;t identify your roster.</p>;
  }
  const a = analyzeRoster(h, rosterId);
  const win = WINDOW_COPY[a.window];
  const ages = a.valued.map((v) => v.age).filter((x): x is number => x != null);
  const posData = a.byPosition.map((p) => ({ label: p.pos, value: Math.round(p.value) }));
  const posCounts = a.byPosition.map((p) => `${p.pos} ${p.count}`).join(" · ");

  // The multiplier chain per player, so every roster row can explain its own number
  // without a round trip. Same call analyzeRoster makes; memoised by Next's cache.
  const breakdowns = valuePlayers([...h.players.values()], h.currentLeague.scoringSettings);

  const user = h.rostersById.get(rosterId)?.ownerId
    ? h.usersById.get(h.rostersById.get(rosterId)!.ownerId!)
    : undefined;

  const top5 = a.valued.slice(0, 5).reduce((s, v) => s + v.value, 0);
  const top5Share = a.playerValue ? Math.round((top5 / a.playerValue) * 100) : 0;
  const injured = a.valued.filter((v) => v.injuryStatus).length;

  return (
    <div>
      {/* Identity, record, window and core age in one block - what used to be a
          header plus a separate window card. min-w-0 lets long names truncate
          instead of pushing the Sleeper link off a 390px screen. */}
      <header className="mb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <TeamAvatar
              name={a.teamName ?? a.ownerName}
              avatarId={user?.avatar}
              teamLogoUrl={user?.teamLogoUrl}
              size="md"
              isMe
            />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                {a.teamName ?? "Your team"}
              </p>
              <h1 className="truncate font-display text-[26px] font-semibold leading-tight text-ink">
                {a.ownerName}
              </h1>
            </div>
          </div>
          <OpenInSleeper
            href={sleeperTeamUrl(h.currentLeague.leagueId, rosterId)}
            label="Sleeper"
            className="shrink-0"
          />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* One string, so a wrap never leaves a dangling separator. */}
          <span className="font-mono text-[11px] tnum text-faint">
            <span className="font-semibold text-ink">
              {a.record.wins}-{a.record.losses}
            </span>{" "}
            · {a.valued.length} players · {a.picks.picks.length} picks · core age{" "}
            <span className="font-semibold text-ink">{a.coreAge ?? "-"}</span>
            {injured > 0 && (
              <>
                {" "}
                ·{" "}
                <span className="whitespace-nowrap text-negative">
                  {injured} flagged
                </span>
              </>
            )}
          </span>
          <Tag tone={win.tone}>{win.label}</Tag>
        </div>
        <p className="mt-1 text-xs leading-snug text-muted">{win.note}</p>
      </header>

      {/* Stat rail: one card, hairline dividers, every cell a destination. */}
      <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface/60">
        <StatCell
          href="/values"
          label="Total value"
          value={fmtValue(a.totalValue)}
          sub={`${fmtValue(a.playerValue)} players`}
        />
        <StatCell
          href="/drafts"
          label="Pick capital"
          value={fmtValue(a.picks.total)}
          sub={`${a.picks.firsts} firsts${
            a.picks.extraFirsts === 0
              ? " at baseline"
              : ` (${a.picks.extraFirsts > 0 ? "+" : ""}${a.picks.extraFirsts})`
          }`}
          tone={a.picks.extraFirsts >= 0 ? "positive" : "negative"}
        />
        <StatCell
          href="/plan"
          label="Top 5 share"
          value={`${top5Share}%`}
          sub="of player value"
        />
      </div>

      {/* Pick capital - in dynasty, picks are assets, so they get real estate.
          One row per season instead of one card per season. */}
      <SectionTitle
        title={`Draft capital - ${a.picks.picks.length} picks`}
        href="/drafts"
        cta="lineage"
      />
      {a.picks.picks.length === 0 ? (
        <Card className="p-3">
          <p className="text-sm text-muted">
            No draft picks owned. Every future pick has been traded away - that
            caps how much this roster can change.
          </p>
        </Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface/60">
          {a.picks.seasons.map((season) => {
            const forSeason = a.picks.picks.filter((p) => p.season === season);
            if (!forSeason.length) return null;
            return (
              <li key={season}>
                {/* Season label and total on one line, chips using the FULL width
                    below it - attribution ("via X") is long, and giving the chips
                    the whole row costs fewer lines than an inline column. */}
                <Link
                  href="/drafts"
                  className="block min-h-11 px-2.5 py-2 transition-colors hover:bg-surface-2"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[13px] font-semibold tnum text-ink">
                      {season}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[11px] tnum text-muted">
                      {forSeason.length} picks ·{" "}
                      {fmtValue(forSeason.reduce((s, p) => s + p.value, 0))}
                      <ChevronRight size={13} aria-hidden="true" className="text-faint" />
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {forSeason.map((p) => (
                      <Tag
                        key={`${p.season}-${p.round}-${p.originalRoster}`}
                        tone={p.round === 1 ? "accent" : "neutral"}
                      >
                        {p.round === 1 ? "1st" : p.round === 2 ? "2nd" : `${p.round}rd`}
                        {p.acquired && p.fromName ? ` via ${p.fromName}` : ""}
                      </Tag>
                    ))}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Both shape charts in one card - two section headers and two card
          paddings for the same information was pure vertical cost. */}
      <SectionTitle title="Roster shape" />
      <Card className="p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            Age curve
          </span>
          <span className="font-mono text-[11px] tnum text-muted">
            {ages.length} ages · core {a.coreAge ?? "-"}
          </span>
        </div>
        <AgeStrip ages={ages} height={58} />
        <p className="text-center text-[11px] text-faint">
          Each dot is a rostered player. The dashed line is your average.
        </p>
        <div className="rule my-2.5" />
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            Positional value
          </span>
          <span className="truncate font-mono text-[11px] tnum text-muted">
            {posCounts}
          </span>
        </div>
        <BarChart data={posData} height={112} format={(n) => fmtValue(n)} />
      </Card>

      <SectionTitle
        title="Roster - by value"
        href="/values"
        cta="all values"
      />
      <p className="-mt-1 mb-1.5 font-mono text-[11px] tnum text-faint">
        {a.valued.length} players · bar = share of {fmtValue(a.playerValue)} player
        value · tap for multipliers
      </p>
      <ul className="space-y-1">
        {a.valued.map((v) => {
          const b = breakdowns.get(v.playerId);
          return (
            <ValueAssetRow
              key={v.playerId}
              name={v.name}
              team={v.team}
              position={v.position}
              age={v.age}
              value={v.value}
              tier={v.tier}
              playerId={v.playerId}
              injuryStatus={v.injuryStatus}
              share={a.playerValue ? v.value / a.playerValue : 0}
              breakdown={
                b
                  ? {
                      base: b.base,
                      age: b.ageMultiplier,
                      injury: b.injuryMultiplier,
                      role: b.roleMultiplier,
                      position: b.positionMultiplier,
                    }
                  : undefined
              }
            />
          );
        })}
      </ul>
    </div>
  );
}

function SectionTitle({
  title,
  href,
  cta,
}: {
  title: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="mb-1.5 mt-4 flex items-center justify-between gap-2">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
        {title}
      </h2>
      {href && cta && (
        <Link
          href={href}
          className="-mr-2 inline-flex min-h-11 items-center gap-0.5 px-2 text-[11px] font-semibold text-accent"
        >
          {cta}
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function StatCell({
  href,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  href: string;
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const color =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-ink";
  return (
    <Link
      href={href}
      className="flex min-h-11 min-w-0 flex-col justify-center px-2.5 py-2 transition-colors hover:bg-surface-2"
    >
      <span className="truncate text-[11px] uppercase tracking-wide text-faint">
        {label}
      </span>
      <span
        className={`truncate font-mono text-lg font-semibold leading-tight tnum ${color}`}
      >
        {value}
      </span>
      <span className="truncate text-[11px] leading-tight text-muted">{sub}</span>
    </Link>
  );
}
