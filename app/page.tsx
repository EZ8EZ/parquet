import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, ScrollText } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getStrategyReport } from "@/lib/strategy";
import { getPrincipals } from "@/lib/principals";
import { getLedgerSummary } from "@/lib/ledger";
import { loadDigest } from "@/lib/digest";
import { currentFormByRoster } from "@/lib/roster";
import { ordinal } from "@/lib/derive/describe";
import { liveStreaks } from "@/lib/streaks";
import { homeNext } from "@/lib/nav";
import { canCapture, readSeat } from "@/lib/auth/server";
import { Onward } from "@/components/Onward";
import { DigestPanel } from "@/components/DigestPanel";
import { StreakPanel } from "@/components/StreakPanel";
import { Wordmark } from "@/components/Brand";
import { Card, Tag, DeltaValue, SectionHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const h = await getLeagueHistory();
  // Scoped to the PERSON in the seat, not the seat: see `getStrategyReport`.
  const principals = await getPrincipals(h);
  const report = getStrategyReport(h, principals);
  const ledger = getLedgerSummary(h, principals);
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
      {/* The wordmark, and nothing beside it. "Switch team" and "Settings" used to sit
          in this row's right-hand corner - the top-right of the tallest page in the
          app, which is the single hardest place to reach one-handed on a 6.7" phone.
          Both now live behind the seat chip in the Desk, which is at the bottom of
          EVERY page rather than the top of this one (D35, and components/Desk.tsx). */}
      <Wordmark tagline="Dynasty memory" />

      {/* Loud, not subtle: synthetic data that looks plausible is the most dangerous
          failure this app can have, so it must be impossible to mistake for real. */}
      {h.provider === "fixture" && (
        <div className="mb-3 rounded-[--radius] border border-warn/40 bg-warn/[0.08] p-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
            <div>
              <div className="text-body font-semibold text-warn">
                Synthetic demo data, not your league
              </div>
              <p className="mt-0.5 text-note leading-relaxed text-muted">
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
          className="mb-3 flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border border-accent-edge bg-accent-wash px-2.5 py-2 transition-colors hover:border-accent"
        >
          <ScrollText size={15} aria-hidden="true" className="shrink-0 text-accent-text" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-semibold leading-tight text-ink">
              {ledger.unannotatedNotable} decision
              {ledger.unannotatedNotable > 1 ? "s" : ""} to capture
            </span>
            <span className="block truncate text-meta leading-tight text-muted">
              Log why you made them - while you still remember.
            </span>
          </span>
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-accent-text" />
        </Link>
      )}

      {/* Revealed strategy - the headline, first thing on the screen. The kicker
          names WHOSE strategy, because "You said win-now. You sold." only lands when
          the reader knows who "you" is - obvious to the manager in their own seat,
          not to a leaguemate seeing this app (or this seat) for the first time. */}
      <p className="text-meta font-semibold uppercase tracking-[0.18em] text-accent-text">
        Revealed strategy · {p.teamName ?? p.displayName}
      </p>
      <h1 className="mt-0.5 font-display text-display font-semibold leading-[1.12] text-ink">
        {report.headline}
      </h1>

      {report.contradictions.length > 0 ? (
        <div className="mt-3 space-y-2">
          {report.contradictions.slice(0, 2).map((c) => (
            <Card key={c.id} className="border-negative/30 bg-negative/[0.06] p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <AlertTriangle size={15} className="text-negative" />
                <span className="text-meta font-semibold uppercase tracking-wide text-negative">
                  Stated vs revealed
                </span>
              </div>
              <p className="text-body leading-relaxed text-ink">{c.narrative}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Tag tone="neutral">said: {c.statedSeason}</Tag>
                <Tag tone="neutral">did: {c.revealedSeason}</Tag>
                <Link
                  href="/ledger"
                  className="inline-flex min-h-11 items-center text-note font-semibold text-accent-text underline-offset-2 hover:underline"
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
        <div className="mt-3 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} aria-hidden="true" className="shrink-0 text-positive" />
            <span className="text-meta font-semibold uppercase tracking-wide text-muted">
              Stated vs revealed
            </span>
          </div>
          <p className="mt-1 text-body leading-relaxed text-ink/90">
            You&apos;ve captured reasoning on {report.statedPostures.length} decision
            {report.statedPostures.length > 1 ? "s" : ""}, and nothing in your record
            contradicts it yet.{" "}
            <Link
              href="/ledger"
              className="font-semibold text-accent-text underline-offset-2 hover:underline"
            >
              See what you said
            </Link>
          </p>
        </div>
      ) : null}

      {/* What moved while you were gone - the memory the rest of the page cannot give,
          because every other figure here describes a state rather than a change. */}
      <SectionHeader title="Since your last visit" />
      <DigestPanel digest={digest} />

      {/* YOUR SEASON, in figures. Four numbers in one card's worth of height rather
          than four stacked boxes, and every one of them is a link. */}
      <SectionHeader title="Your season, in four numbers" />
      <div className="grid grid-cols-2 overflow-hidden rounded-[--radius-sm] border border-border bg-surface">
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
          /* The caption has to describe the number above it. It used to read off
             `overpaysForAge` - a count of 30+ acquisitions, not an average - so a
             manager whose average acquisition age is 23.5 was captioned "leans
             veteran" here while their own dossier said "Skews young - average
             acquisition age 23.5" from the same figure. */
          sub={
            p.acquisitions.avgAge == null
              ? `${p.acquisitions.count} added`
              : p.acquisitions.avgAge < 25
                ? "leans young"
                : p.acquisitions.avgAge >= 27
                  ? "leans veteran"
                  : "no age lean"
          }
        />
      </div>

      {/* Activity tape - the rest of the derived profile, previously unsurfaced. */}
      <Link
        href="/ledger"
        className="mt-1.5 block rounded-[--radius-sm] border border-border bg-surface px-2.5 py-2 transition-colors hover:border-border-strong hover:bg-surface-2"
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
        <p className="mt-1 figure text-meta leading-snug text-faint">
          {holdYears ? `avg completed hold ${holdYears}y · ` : ""}
          {p.acquisitions.count} in / {p.disposals.count} out ·{" "}
          {ledger.annotated}/{ledger.notable} annotated
        </p>
      </Link>


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
              <li key={i} className="flex gap-2 text-body leading-snug">
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
                key={tp.ownerId ?? `r${tp.rosterId}`}
                // A departed partner's file lives at their owner id - the seat they
                // used to hold now routes to whoever took it over.
                href={
                  tp.isFormer && tp.ownerId
                    ? `/managers/former/${tp.ownerId}`
                    : `/managers/${tp.rosterId}`
                }
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 transition-colors hover:border-accent"
              >
                <span className="max-w-[8rem] truncate text-note font-semibold text-ink">
                  {tp.displayName}
                </span>
                <span className="figure text-meta text-accent-text">
                  {tp.count}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}


      {/*
        WHERE NEXT, and pointedly NOT a menu.

        For one round this page ended with the whole surface registry, grouped exactly
        as the Desk's drawer groups it and exactly as /more does - three renderings of
        one index, which is the failure the registry was built to end, one layer up.
        The drawer is the index: its button says "every page in Parquet, and search",
        it is on the bottom of every screen, and it is a thumb's width from the reader
        at all times. So Home stopped being a directory and went back to being a
        landing page - what changed (the digest, above), what is outstanding (the
        capture badge at the top), and this: at most three moves that earn their place
        given what the app actually knows tonight. `homeNext` in lib/nav.ts explains
        which three facts it reads and why it reads no more than three.
      */}
      <Onward
        steps={homeNext({
          outstanding: mayCapture ? ledger.unannotatedNotable : 0,
          moved: digest.state === "changes",
          contradicted: report.contradictions.length > 0,
        })}
      />

      {/* The "Parquet advises; it can't act / Sleeper has no write API" note used to
          sit here. It is a constraint about sending trades, and /trade states it at the
          point where it actually bites (the evaluation ends at "Open Sleeper to send").
          Home is not where anyone is trying to send anything.

          /more is named here in the smallest type on the page and nowhere else on it,
          on purpose. It is no longer a feature to promote - the drawer carries the
          same index from every screen - but it IS the only path to that index for a
          reader without JavaScript, since the drawer is a client component. One quiet
          link keeps the guarantee true in the one case the drawer cannot cover. */}
      <p className="mt-5 text-center text-meta leading-relaxed text-faint">
        First time here?{" "}
        <Link
          href="/about"
          className="inline-flex min-h-11 items-center font-semibold text-muted underline-offset-2 hover:text-accent-text hover:underline"
        >
          What this is, and what the numbers mean
        </Link>
        <span className="mt-0.5 block">
          Or{" "}
          <Link
            href="/more"
            className="underline-offset-2 hover:text-accent-text hover:underline"
          >
            every page in one list
          </Link>
        </span>
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
      <span className="truncate text-meta uppercase tracking-wide text-faint">
        {label}
      </span>
      <span className="truncate figure text-lede font-semibold leading-tight text-ink">
        {value}
      </span>
      <span className="truncate text-meta leading-tight text-muted">{sub}</span>
    </Link>
  );
}

function Micro({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-meta uppercase tracking-wide text-faint">
        {label}
      </div>
      <div className="truncate figure text-body font-semibold text-ink">
        {value}
      </div>
    </div>
  );
}
