import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ScrollText,
} from "lucide-react";
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
import { DigestBeacon } from "@/components/DigestBeacon";
import { Wordmark } from "@/components/Brand";
import {
  Card,
  Tag,
  DeltaValue,
  PageHeader,
  SectionHeader,
} from "@/components/ui";
export const dynamic = "force-dynamic";
/**
 * A FRONT-PAGE LEAD (VISION.md M2, replacing the HomeFold accordions the
 * approved kill list retired). One real sentence from one story, open on the
 * page, with its destination inline at the end - the newspaper convention of
 * printing the section's best sentence on the front page instead of the
 * section's name on a grey bar. Deliberately NO card, NO uppercase label and
 * NO chrome: after a cover panel and a stat grid, the third register on this
 * page is plain set prose, which is what makes the first two read as designed
 * rather than as three more boxes.
 */
function Lead({ href, cta, children }) {
  return (
    <p className="text-body leading-relaxed text-ink/90">
      {children}
      {href && cta && (
        <>
          {" "}
          <Link
            href={href}
            className="inline-flex min-h-11 items-center gap-0.5 whitespace-nowrap align-middle text-meta font-semibold text-accent-text"
          >
            {cta}
            <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </>
      )}
    </p>
  );
}
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
  const { streaks } = liveStreaks(h, p.rosterId);
  const holdYears =
    p.avgHoldingDays != null ? (p.avgHoldingDays / 365).toFixed(1) : null;
  const partners = p.tradePartners.slice(0, 3);
  // The cover's hero fact (and the same strings the four-numbers grid prints in
  // its Record cell - the cover states the score as identity, the grid as one of
  // four linked tiles; a program's front page and its box score both carry the
  // score, and that is the one restatement this page keeps on purpose).
  const recordValue = form
    ? `${form.wins}-${form.losses}`
    : `${roster?.settings.wins ?? 0}-${roster?.settings.losses ?? 0}`;
  const recordSub = form
    ? `${form.isLive ? form.season : `${form.season} final`}, ${ordinal(form.rank)} of ${form.teams}`
    : `${h.currentLeague.season} season`;
  // The lead from the streaks story: the first streak the panel itself would show
  // (same worth-showing rule StreakPanel applies - idle AND zero is anti-information).
  const topStreak = streaks.find((s) => !(s.state === "idle" && s.value === 0));
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
                <span className="font-mono">LEAGUE_PROVIDER=fixture</span> to
                load the real league.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Unannotated decisions badge - a to-do to clear, not paperwork. One line. */}
      {mayCapture && ledger.unannotatedNotable > 0 && (
        <Link
          href="/ledger"
          className="card-lit mb-3 flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border border-accent-edge bg-accent-wash px-2.5 py-2 transition-colors hover:border-accent"
        >
          <ScrollText
            size={15}
            aria-hidden="true"
            className="shrink-0 text-accent-text"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-semibold leading-tight text-ink">
              {ledger.unannotatedNotable} decision
              {ledger.unannotatedNotable > 1 ? "s" : ""} to capture
            </span>
            <span className="block truncate text-meta leading-tight text-muted">
              Log why you made them - while you still remember.
            </span>
          </span>
          <ChevronRight
            size={16}
            aria-hidden="true"
            className="shrink-0 text-accent-text"
          />
        </Link>
      )}

      {/* THE COVER (VISION.md M2): kicker → Fraunces headline → standfirst → ONE
            hero fact set as display type on the gold floor-line - the 30-for-30
            numeral move, on the app's one hero-mesh panel. The kicker names WHOSE
            strategy, because "You said win-now. You sold." only lands when the
            reader knows who "you" is. The standfirst is the season in one honest
            sentence; the hero fact is the record and standing, the one number a
            manager carries in their head all week. */}
      <section className="hero-mesh mb-3 rounded-[--radius-lg] border border-border px-4 pb-3.5 pt-4">
        <PageHeader
          kicker={`Revealed strategy · ${p.teamName ?? p.displayName}`}
          title={report.headline}
          subtitle={`A record of ${p.trades} trades and ${ledger.notable} notable decisions - ${ledger.annotated} of them with the why written down.`}
        />
        <Link
          href="/league"
          className="group -mt-1 inline-flex min-h-11 items-end gap-2.5"
        >
          <span>
            <span className="block figure text-display font-semibold leading-none text-ink">
              {recordValue}
            </span>
            {/* The gold floor-line: the typographic signature under the hero
                  numeral (The Athletic's inline lesson, via VISION.md M2). */}
            <span
              aria-hidden="true"
              className="mt-1.5 block h-[3px] w-14 rounded-full bg-accent"
            />
          </span>
          <span className="pb-px text-meta leading-tight text-secondary transition-colors group-hover:text-ink">
            {recordSub}
          </span>
        </Link>
      </section>

      {report.contradictions.length > 0 ? (
        <div className="mt-3 space-y-2">
          {report.contradictions.slice(0, 2).map((c) => (
            <Card
              key={c.id}
              className="card-lit border-negative/30 bg-negative/[0.06] p-3"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <AlertTriangle size={15} className="text-negative" />
                <span className="text-meta font-semibold uppercase tracking-wide text-negative">
                  Stated vs revealed
                </span>
              </div>
              <p className="text-body leading-relaxed text-ink">
                {c.narrative}
              </p>
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
        <div className="card-lit mt-3 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-2">
          <div className="flex items-center gap-2">
            <CheckCircle2
              size={14}
              aria-hidden="true"
              className="shrink-0 text-positive"
            />
            <span className="text-meta font-semibold uppercase tracking-wide text-muted">
              Stated vs revealed
            </span>
          </div>
          <p className="mt-1 text-body leading-relaxed text-ink/90">
            You&apos;ve captured reasoning on {report.statedPostures.length}{" "}
            decision
            {report.statedPostures.length > 1 ? "s" : ""}, and nothing in your
            record contradicts it yet.{" "}
            <Link
              href="/ledger"
              className="font-semibold text-accent-text underline-offset-2 hover:underline"
            >
              See what you said
            </Link>
          </p>
        </div>
      ) : null}

      {/* "Since your last visit" rendered here until 2026-08-10. It was shelved
            (SHELVED.md, S2) because it burned its own baseline on the first page view:
            load once and it reads "no earlier visit to compare against", reload thirty
            seconds later and it reads "nothing has moved since just now". The steady
            state for a weekly visitor was ~190px of labelled empty box, second element
            on the front page - which is the anti-information D40 already ruled against
            in StreakPanel and then let back in here.

            The beacon below renders nothing. It posts on every mount so the marker CAN
            advance, but `shouldAdvanceMarker` (lib/digest) now floors how often it
            actually does - the fix SHELVED.md named as the condition for a revival.
            `homeNext` still reads whether anything moved off the same marker, and the
            full league-wide diff - not just yours - now has its own page at
            /lab/pulse, which the floor is what makes worth visiting twice. */}
      <DigestBeacon metrics={digest.nextMetrics} />

      {/* HOW YOU DEAL, in figures - three numbers in one card's worth of height,
            every one of them a link. The Record cell that used to lead this grid
            moved up to the cover as the hero fact (VISION.md M2): the same score
            printed twice one screen apart was the restatement D61 warns about,
            so the grid keeps only the dealing profile the cover does not carry. */}
      <SectionHeader title="How you deal, in three numbers" />
      <div className="card-lit grid grid-cols-3 overflow-hidden rounded-[--radius] border border-border bg-surface">
        <Figure
          href="/ledger"
          label="Trades"
          value={`${p.trades}`}
          sub={`${p.tradesInitiated} you started`}
          className="border-r border-border"
        />
        <Figure
          href="/drafts"
          label="Pick capital"
          value={<DeltaValue n={p.picks.net} />}
          sub={`${p.picks.firstsAcquired} in / ${p.picks.firstsSpent} out`}
          className="border-r border-border"
        />
        <Figure
          href={`/managers/${p.rosterId}`}
          label="Acq. age"
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
        className="card-lit mt-1.5 block rounded-[--radius-sm] border border-border bg-surface px-2.5 py-2 transition-colors hover:border-border-strong hover:bg-surface-2"
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

      {/* THE LEADS (VISION.md M2 + kill list item 3). This page used to fold its
            other three stories into collapsed accordions - "STILL RUNNING · 5
            active", "WHAT YOUR RECORD SHOWS · 4 findings", "WHO YOU DEAL WITH ·
            top 3" - three grey bars that looked like each other and said nothing.
            A newspaper doesn't print its section names on the front page; it
            prints its best sentence from each section. So each story now leads
            with its one real sentence, open, with the destination beside it.
            The full streak panel lives behind the /awards link; the findings ARE
            sentences, so they print in full (they are a handful of one-liners,
            shorter than the accordion chrome they replace). */}
      <div className="mt-4 space-y-3 border-t border-border pt-3.5">
        {topStreak && (
          <Lead href="/awards" cta="streaks & awards">
            {topStreak.label}:{" "}
            <b className="figure font-semibold text-ink">{topStreak.display}</b>
            {topStreak.detail ? <> - {topStreak.detail}</> : "."}
          </Lead>
        )}
        {report.findings.map((f, i) => (
          <Lead key={i}>{f}</Lead>
        ))}
        {/* Skipped when the findings above already name the same partner - the
              report computes its own "most frequent partner" line from the same
              data, and one fact printed twice in one block is the exact
              restatement this block replaced the accordions to avoid. */}
        {partners.length > 0 &&
          !report.findings.some((f) =>
            f.includes(partners[0].displayName),
          ) && (
          <Lead
            href={
              partners[0].isFormer && partners[0].ownerId
                ? `/managers/former/${partners[0].ownerId}`
                : `/managers/${partners[0].rosterId}`
            }
            cta="the dossier"
          >
            Most of your business is with{" "}
            <b className="font-semibold text-ink">{partners[0].displayName}</b>{" "}
            - <b className="figure font-semibold text-ink">{partners[0].count}</b>{" "}
            deals between you.
          </Lead>
        )}
      </div>

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
function Figure({ href, label, value, sub, className }) {
  return (
    <Link
      href={href}
      className={`flex min-h-11 min-w-0 flex-col justify-center px-2.5 py-2 transition-colors hover:bg-surface-2 ${className ?? ""}`}
    >
      <span className="truncate text-meta uppercase tracking-wide text-faint">
        {label}
      </span>
      {/* `text-display`, not `lede` (D88): these four ARE the hero figures that
          anchor this page, which is precisely the job the token's own comment
          reserves display for (Stat already sets it) - and "oversized confident
          type at the key moment" was the flat-verdict fix every reference app
          agrees on. Semibold, per the house rule that numbers never take the
          headline's full bold. */}
      <span className="truncate figure text-display font-semibold leading-tight text-ink">
        {value}
      </span>
      <span className="truncate text-meta leading-tight text-muted">{sub}</span>
    </Link>
  );
}
function Micro({ label, value }) {
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
