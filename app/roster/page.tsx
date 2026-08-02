import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { leagueValueRanking, currentFormByRoster } from "@/lib/roster";
import { leagueTimelines } from "@/lib/metrics/duration";
import { Card, SectionHeader, Tag } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { ValueAssetRow } from "@/components/ValuesList";
import { AgeStrip, BarChart, PositionRadar } from "@/components/charts";
import { ageMultiplier } from "@/lib/valuation";
import { fmtValue } from "@/lib/ui";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperTeamUrl } from "@/lib/sleeperLinks";
import { ordinal } from "@/lib/derive/describe";

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

const POSTURE_TONE = {
  contending: "accent",
  ascending: "positive",
  rebuilding: "info",
  straddling: "negative",
} as const;

/** How many seasons of trajectory the sparkline shows, current season included. */
const TRAJECTORY_SEASONS = 4;

/**
 * A value-trend sparkline needs a series, and this app deliberately stores no
 * week-over-week value history (D3/D4: the valuation model is recomputed live, not
 * snapshotted - inventing a plausible-looking history would be exactly the kind of
 * fabricated-but-real-looking number this app refuses to ship). What genuinely exists
 * is the published age curve itself, so this projects THIS player's own value forward
 * on that curve, holding injury/role/position fixed - "if nothing else about this
 * player changes, here is what the model says happens as they age." That is an
 * honest, transparent trajectory, not a claim about the past.
 */
function valueTrajectory(v: { age: number | null; value: number; breakdown: { age: number } }): number[] | undefined {
  if (v.age == null || !v.breakdown.age) return undefined;
  // Back out the product of every OTHER multiplier from the already-computed value,
  // so re-walking the age curve at future ages reproduces the current value exactly
  // at offset 0 without re-deriving base/injury/role/position from scratch here.
  const restOfModel = v.value / v.breakdown.age;
  return Array.from({ length: TRAJECTORY_SEASONS }, (_, n) =>
    Math.round(restOfModel * ageMultiplier(v.age! + n)),
  );
}

export default async function RosterPage() {
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;
  if (rosterId == null) {
    return <p className="text-muted">Couldn&apos;t identify your roster.</p>;
  }
  // Pulled from the full league ranking rather than a standalone analyzeRoster call so
  // `window` is classified against the same league-relative distribution /league uses -
  // otherwise the same team could read "win-now" on one page and "balanced" on another.
  const a = leagueValueRanking(h).find((r) => r.rosterId === rosterId)!;
  const win = WINDOW_COPY[a.window];
  const ages = a.valued.map((v) => v.age).filter((x): x is number => x != null);
  const posData = a.byPosition.map((p) => ({ label: p.pos, value: Math.round(p.value) }));
  const posCounts = a.byPosition.map((p) => `${p.pos} ${p.count}`).join(" · ");

  const user = h.rostersById.get(rosterId)?.ownerId
    ? h.usersById.get(h.rostersById.get(rosterId)!.ownerId!)
    : undefined;

  const top5 = a.valued.slice(0, 5).reduce((s, v) => s + v.value, 0);
  const top5Share = a.playerValue ? Math.round((top5 / a.playerValue) * 100) : 0;
  const injured = a.valued.filter((v) => v.injuryStatus).length;

  // Timeline profile, classified against the whole league (posture is relative).
  const timelines = leagueTimelines(h);
  const tl = timelines.find((t) => t.rosterId === rosterId);
  const tciRank = timelines.findIndex((t) => t.rosterId === rosterId) + 1;
  const longest = tl?.assets.slice(0, 3) ?? [];
  const shortest = tl ? [...tl.assets].slice(-3).reverse() : [];
  const form = (await currentFormByRoster(h)).get(rosterId);

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
              {form ? `${form.wins}-${form.losses}` : `${a.record.wins}-${a.record.losses}`}
            </span>{" "}
            {form && !form.isLive && (
              <span className="text-faint">({form.season} final, {ordinal(form.rank)} of {form.teams}) </span>
            )}
            · {a.valued.length} players · {a.picks.picks.length} picks · core age{" "}
            <span className="font-semibold text-ink">{a.coreAge ?? "-"}</span>
            {injured > 0 && (
              <>
                {" "}
                {/* Separator inside the nowrap span so a wrap never leaves it
                    stranded at the end of a line. */}
                <span className="whitespace-nowrap">
                  · <span className="text-negative">{injured} flagged</span>
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

      {/* Timeline: WHEN this roster's value arrives, and whether the assets agree.
          The read is written to be useful, not flattering - do not soften it. */}
      {tl && (
        <>
          <SectionHeader
            title="Your timeline"
            href="/methodology"
            cta="how TCI works"
          />
          <Card className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-3">
                <span>
                  <span className="font-mono text-lg font-semibold tnum text-ink">
                    {tl.rosterDuration.toFixed(1)}s
                  </span>
                  <span className="ml-1 text-[11px] uppercase tracking-wide text-faint">
                    duration
                  </span>
                </span>
                <span>
                  <span className="font-mono text-lg font-semibold tnum text-ink">
                    {tl.tci}
                  </span>
                  <span className="ml-1 text-[11px] uppercase tracking-wide text-faint">
                    TCI · {tciRank}/{timelines.length}
                  </span>
                </span>
              </div>
              <Tag tone={POSTURE_TONE[tl.posture]}>{tl.posture}</Tag>
            </div>
            <p className="mt-1 font-mono text-[11px] tnum text-faint">
              {Math.round(tl.nowShare * 100)}% of value pays off inside 2 seasons ·{" "}
              {Math.round(tl.laterShare * 100)}% arrives 4+ out · dispersion{" "}
              {tl.dispersion.toFixed(2)}s
            </p>
            <p className="mt-1.5 text-[12.5px] leading-snug text-ink/85">{tl.read}</p>
            <div className="rule my-2.5" />
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-info">
                  Longest-dated
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {longest.map((as) => (
                    <li
                      key={as.id}
                      className="flex items-baseline justify-between gap-1.5 text-[11.5px] leading-snug"
                    >
                      <span className="min-w-0 truncate text-ink/85">{as.label}</span>
                      <span className="shrink-0 font-mono text-[11px] tnum text-muted">
                        {as.duration.toFixed(1)}s
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-accent">
                  Shortest-dated
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {shortest.map((as) => (
                    <li
                      key={as.id}
                      className="flex items-baseline justify-between gap-1.5 text-[11.5px] leading-snug"
                    >
                      <span className="min-w-0 truncate text-ink/85">{as.label}</span>
                      <span className="shrink-0 font-mono text-[11px] tnum text-muted">
                        {as.duration.toFixed(1)}s
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <details className="group mt-1.5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                <ChevronRight
                  size={13}
                  aria-hidden="true"
                  className="transition-transform group-open:rotate-90"
                />
                Every asset, by duration
              </summary>
              <ul className="space-y-0.5 pb-1">
                {tl.assets.map((as) => (
                  <li
                    key={as.id}
                    className="flex items-baseline justify-between gap-2 text-[11.5px] leading-snug"
                  >
                    <span className="min-w-0 truncate text-ink/85">{as.label}</span>
                    <span className="shrink-0 font-mono text-[11px] tnum text-muted">
                      {as.duration.toFixed(1)}s · {fmtValue(as.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        </>
      )}

      {/* Pick capital - in dynasty, picks are assets, so they get real estate.
          One row per season instead of one card per season. */}
      <SectionHeader
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
      <SectionHeader title="Roster shape" />
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
        {/* Radar reads shape (balanced vs. concentrated) at a glance, which a bar
            chart can't; a roster missing 3+ distinct positions can't form a
            legible polygon, so that rare case keeps the bar chart instead. */}
        {posData.length >= 3 ? (
          <PositionRadar data={posData} format={(n) => fmtValue(n)} />
        ) : (
          <BarChart data={posData} height={112} format={(n) => fmtValue(n)} />
        )}
      </Card>

      <SectionHeader
        title="Roster - by value"
        href="/values"
        cta="all values"
      />
      <p className="-mt-1 mb-1.5 font-mono text-[11px] tnum text-faint">
        {a.valued.length} players · bar = share of {fmtValue(a.playerValue)} player
        value · line = {TRAJECTORY_SEASONS}-season age-curve trajectory · tap for
        multipliers
      </p>
      <ul className="space-y-1">
        {a.valued.map((v) => (
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
            breakdown={v.breakdown}
            trajectory={valueTrajectory(v)}
            // Young players' declining trajectory is just the age-curve premium unwinding,
            // not a warning - show it in muted color instead of red.
            trajectoryColor={v.age != null && v.age < 26 ? "var(--color-muted)" : undefined}
          />
        ))}
      </ul>
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
