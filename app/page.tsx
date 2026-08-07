import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Repeat, ScrollText, Settings } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getStrategyReport } from "@/lib/strategy";
import { getLedgerSummary } from "@/lib/ledger";
import { loadDigest } from "@/lib/digest";
import { currentFormByRoster } from "@/lib/roster";
import { ordinal } from "@/lib/derive/describe";
import { liveStreaks } from "@/lib/streaks";
import { curatedSurfaces } from "@/lib/nav";
import { canCapture, readSeat } from "@/lib/auth/server";
import { iconForSurface } from "@/components/nav-icons";
import { DigestPanel } from "@/components/DigestPanel";
import { StreakPanel } from "@/components/StreakPanel";
import { Wordmark } from "@/components/Brand";
import { Card, Tag, DeltaValue, SectionHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const h = await getLeagueHistory();
  const report = getStrategyReport(h);
  const ledger = getLedgerSummary(h);
  // "27 decisions to capture" is a to-do list, and a to-do list addressed to someone
  // who is not allowed to do any of it is just an accusation. In legacy mode this is
  // always true and the badge behaves exactly as it always has.
  const mayCapture = canCapture(await readSeat(), h.me.userId);
  const p = report.profile;
  const roster = h.rostersById.get(p.rosterId);
  const form = (await currentFormByRoster(h)).get(p.rosterId);
  const digest = await loadDigest(h);

  // The clock is read inside lib/streaks (see its `opts.now`), which hands back the
  // instant it used so the panel's stamp and its numbers describe the same moment.
  const { streaks, countedAt } = liveStreaks(h, p.rosterId);

  const holdYears =
    p.avgHoldingDays != null ? (p.avgHoldingDays / 365).toFixed(1) : null;
  const partners = p.tradePartners.slice(0, 3);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <Wordmark tagline="Dynasty memory" />
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Who am I? - switch teams / enter a username. */}
          <Link
            href="/teams"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Repeat size={13} aria-hidden="true" />
            <span className="max-w-[7rem] truncate">
              {h.me.teamName ?? h.me.displayName}
            </span>
          </Link>
          {/* The display escape hatch. Icon-only so it costs almost no width on the
              one row every visit starts from - two taps from anywhere in the app. */}
          <Link
            href="/settings"
            aria-label="Settings"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Settings size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Loud, not subtle: synthetic data that looks plausible is the most dangerous
          failure this app can have, so it must be impossible to mistake for real. */}
      {h.provider === "fixture" && (
        <div className="mb-3 rounded-[--radius] border border-warn/40 bg-warn/[0.08] p-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
            <div>
              <div className="text-sm font-semibold text-warn">
                Synthetic demo data, not your league
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Every name, trade and value below is invented. Remove{" "}
                <span className="font-mono">LEAGUE_PROVIDER=fixture</span> to load the
                real league.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Unannotated decisions badge - a to-do to clear, not paperwork. One line. */}
      {mayCapture && ledger.unannotatedNotable > 0 && (
        <Link
          href="/ledger"
          className="mb-3 flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border border-accent/30 bg-accent/10 px-2.5 py-2 transition-colors hover:border-accent/60"
        >
          <ScrollText size={15} aria-hidden="true" className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
              {ledger.unannotatedNotable} decision
              {ledger.unannotatedNotable > 1 ? "s" : ""} to capture
            </span>
            <span className="block truncate text-[11px] leading-tight text-muted">
              Log why you made them - while you still remember.
            </span>
          </span>
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-accent" />
        </Link>
      )}

      {/* Revealed strategy - the headline, first thing on the screen. The kicker
          names WHOSE strategy, because "You said win-now. You sold." only lands when
          the reader knows who "you" is - obvious to the manager in their own seat,
          not to a leaguemate seeing this app (or this seat) for the first time. */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
        Revealed strategy · {p.teamName ?? p.displayName}
      </p>
      <h1 className="mt-0.5 font-display text-[25px] font-semibold leading-[1.12] text-ink">
        {report.headline}
      </h1>

      {report.contradictions.length > 0 ? (
        <div className="mt-3 space-y-2">
          {report.contradictions.slice(0, 2).map((c) => (
            <Card key={c.id} className="border-negative/30 bg-negative/[0.06] p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <AlertTriangle size={15} className="text-negative" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-negative">
                  Stated vs revealed
                </span>
              </div>
              <p className="text-sm leading-relaxed text-ink">{c.narrative}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Tag tone="neutral">said: {c.statedSeason}</Tag>
                <Tag tone="neutral">did: {c.revealedSeason}</Tag>
                <Link
                  href="/ledger"
                  className="inline-flex min-h-11 items-center text-xs font-semibold text-accent underline-offset-2 hover:underline"
                >
                  see the moves
                  <ChevronRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      ) : report.statedPostures.length > 0 ? (
        // Quiet, not silent: the owner has captured reasoning with nothing to
        // contradict it, and rendering nothing here would be honest about the
        // outcome but not about the record - the app's whole premise is memory
        // serving self-knowledge, and "here's what you said, it still holds" is
        // part of that memory, not just the moments it catches you out. Kept
        // visually calm and clearly not a warning: no red, no AlertTriangle.
        <div className="mt-3 rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} aria-hidden="true" className="shrink-0 text-positive" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Stated vs revealed
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink/90">
            You&apos;ve captured reasoning on {report.statedPostures.length} decision
            {report.statedPostures.length > 1 ? "s" : ""}, and nothing in your record
            contradicts it yet.{" "}
            <Link
              href="/ledger"
              className="font-semibold text-accent underline-offset-2 hover:underline"
            >
              See what you said
            </Link>
          </p>
        </div>
      ) : null}

      {/* Headline figures. Four numbers, four destinations, one card's worth of
          height instead of four stacked boxes. */}
      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-[--radius-sm] border border-border bg-surface/60">
        <Figure
          href="/league"
          label="Record"
          value={
            form ? `${form.wins}-${form.losses}` : `${roster?.settings.wins ?? 0}-${roster?.settings.losses ?? 0}`
          }
          sub={
            form
              ? `${form.isLive ? form.season : `${form.season} final`}, ${ordinal(form.rank)} of ${form.teams}`
              : `${h.currentLeague.season} season`
          }
          className="border-b border-r border-border"
        />
        <Figure
          href="/ledger"
          label="Trades made"
          value={`${p.trades}`}
          sub={`${p.tradesInitiated} you started`}
          className="border-b border-border"
        />
        <Figure
          href="/drafts"
          label="Pick capital"
          value={<DeltaValue n={p.picks.net} />}
          sub={`${p.picks.firstsAcquired} firsts in / ${p.picks.firstsSpent} out`}
          className="border-r border-border"
        />
        <Figure
          href={`/managers/${p.rosterId}`}
          label="Avg acq. age"
          value={`${p.acquisitions.avgAge ?? "-"}`}
          sub={p.overpaysForAge ? "leans veteran" : "leans young"}
        />
      </div>

      {/* Activity tape - the rest of the derived profile, previously unsurfaced. */}
      <Link
        href="/ledger"
        className="mt-1.5 block rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-2 transition-colors hover:border-border-strong hover:bg-surface-2"
      >
        <div className="grid grid-cols-4 gap-1">
          <Micro label="moves" value={`${p.totalTransactions}`} />
          <Micro label="waivers" value={`${p.waivers}`} />
          <Micro label="free ag." value={`${p.freeAgents}`} />
          {/* "0b/0s" was cryptic even for a prosumer; spell out the flow. */}
          <Micro
            label="deadline"
            value={`${p.deadline.buys} in/${p.deadline.sells} out`}
          />
        </div>
        {/* "completed" is load-bearing: avgHoldingDays averages holds that ENDED
            (mostly churned waiver adds), while the streak panel below shows the
            longest hold still OPEN. Side by side, "avg hold 0.2y" next to
            "3y+ still running" reads as a contradiction unless this says which
            population it measures. The metric itself is untouched - it feeds The
            Tortoise/Hot Potato and the dossiers, which have their own context. */}
        <p className="mt-1 font-mono text-[11px] leading-snug tnum text-faint">
          {holdYears ? `avg completed hold ${holdYears}y · ` : ""}
          {p.acquisitions.count} in / {p.disposals.count} out ·{" "}
          {ledger.annotated}/{ledger.notable} annotated
        </p>
      </Link>

      {/* What moved while you were gone - the memory the rest of the page cannot give,
          because every other figure here describes a state rather than a change. */}
      <SectionHeader title="Since your last visit" />
      <DigestPanel digest={digest} />

      {/* The natural sibling of the digest, and the other half of the same question:
          that panel is what CHANGED while you were gone, this one is what is still
          running right now. Both are about the present; neither is a ranking. */}
      <SectionHeader title="Still running" href="/awards" cta="vs. settled awards" />
      <StreakPanel streaks={streaks} countedAt={countedAt} />

      {/* Findings */}
      {report.findings.length > 0 && (
        <>
          <SectionHeader title="What your record shows" />
          <ul className="space-y-1.5">
            {report.findings.map((f, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug">
                <span
                  aria-hidden="true"
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                />
                <span className="text-ink/90">{f}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Trade partners - the people behind the numbers, each a dossier. */}
      {partners.length > 0 && (
        <>
          <SectionHeader title="Who you deal with" href="/managers" cta="all dossiers" />
          <div className="scroll-x flex gap-1.5">
            {partners.map((tp) => (
              <Link
                key={tp.rosterId}
                href={`/managers/${tp.rosterId}`}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-surface/60 px-3 transition-colors hover:border-accent"
              >
                <span className="max-w-[8rem] truncate text-xs font-semibold text-ink">
                  {tp.displayName}
                </span>
                <span className="font-mono text-[11px] tnum text-accent">
                  {tp.count}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Explore - rendered from lib/nav.ts's curated set, not a hand-kept list of
          its own. That registry is also what League's pill row and the /more index
          read, which is the actual fix behind round 6's candidate 53: this grid and
          League's used to be two independently maintained lists that had already
          silently diverged (neither included Manager Compare or /rank). One shared
          source means they can't drift apart again. */}
      <SectionHeader title="Go deeper" />
      <div className="grid grid-cols-2 gap-1.5">
        {curatedSurfaces().map((s) => {
          const Icon = iconForSurface(s.href);
          return (
            <HomeLink
              key={s.href}
              href={s.href}
              icon={<Icon size={15} />}
              title={s.label}
              sub={s.href === "/ledger" ? `${ledger.annotated}/${ledger.notable} annotated` : s.sub}
            />
          );
        })}
      </div>
      <Link
        href="/more"
        className="mt-1.5 flex min-h-11 items-center justify-center gap-1 rounded-[--radius-sm] border border-dashed border-border text-[12px] font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
      >
        See everything
        <ChevronRight size={13} aria-hidden="true" />
      </Link>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-faint">
        Parquet advises; it can&apos;t act. Sleeper has no write API - a trade ends
        at a one-tap link to your league&apos;s trade centre, and a pitch ends at
        text you send yourself.
      </p>
      <p className="text-center text-[11px] leading-relaxed text-faint">
        First time here?{" "}
        <Link
          href="/about"
          className="inline-flex min-h-11 items-center font-semibold text-muted underline-offset-2 hover:text-accent hover:underline"
        >
          What this is, and what the numbers mean
        </Link>
      </p>
    </div>
  );
}


function Figure({
  href,
  label,
  value,
  sub,
  className,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  sub: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-11 min-w-0 flex-col justify-center px-2.5 py-2 transition-colors hover:bg-surface-2 ${className ?? ""}`}
    >
      <span className="truncate text-[11px] uppercase tracking-wide text-faint">
        {label}
      </span>
      <span className="truncate font-mono text-xl font-semibold leading-tight tnum text-ink">
        {value}
      </span>
      <span className="truncate text-[11px] leading-tight text-muted">{sub}</span>
    </Link>
  );
}

function Micro({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] uppercase tracking-wide text-faint">
        {label}
      </div>
      <div className="truncate font-mono text-[13px] font-semibold tnum text-ink">
        {value}
      </div>
    </div>
  );
}

function HomeLink({
  href,
  icon,
  title,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 min-w-0 flex-col justify-center rounded-[--radius-sm] border border-border bg-surface/70 px-2.5 py-2 transition-colors hover:border-accent/50 hover:bg-surface-2"
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="shrink-0 text-accent">
          {icon}
        </span>
        <span className="truncate text-[13px] font-semibold leading-tight text-ink">
          {title}
        </span>
      </span>
      <span className="mt-0.5 truncate text-[11px] leading-tight text-faint">
        {sub}
      </span>
    </Link>
  );
}
