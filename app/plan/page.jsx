import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight, Target } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildGamePlan } from "@/lib/gameplan";
import { getPrincipals } from "@/lib/principals";
import { leagueTimelines } from "@/lib/metrics/duration";
import { leagueWindows, windowSynthesis } from "@/lib/metrics/window";
import { PageHeader, Tag } from "@/components/ui";
import { MetricGloss } from "@/components/MetricGloss";
import { TeamAvatar } from "@/components/TeamAvatar";
import { cn, fmtValue } from "@/lib/ui";
export const dynamic = "force-dynamic";
const DIR_LABEL = {
  contend: { label: "Contend", tone: "accent" },
  ascend: { label: "Ascend", tone: "positive" },
  rebuild: { label: "Rebuild", tone: "info" },
  retool: { label: "Retool", tone: "warn" },
};
export default async function PlanPage() {
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;
  if (rosterId == null) {
    return (
      <p className="text-muted">
        Couldn&apos;t identify your roster.{" "}
        <Link href="/teams" className="text-accent-text underline">
          Pick a team
        </Link>
        .
      </p>
    );
  }
  const principals = await getPrincipals(h);
  const plan = buildGamePlan(h, rosterId, principals);
  const dx = plan.diagnosis;
  const dir = DIR_LABEL[dx.direction];
  const myUser = h.usersById.get(h.me.userId);
  // Timeline check: does the roster's actual value timing agree with the plan?
  const tl = leagueTimelines(h).find((t) => t.rosterId === rosterId);
  const DIR_TO_POSTURE = {
    contend: "contending",
    ascend: "ascending",
    rebuild: "rebuilding",
  };
  const timelineAgrees =
    tl != null &&
    tl.posture !== "straddling" &&
    (dx.direction === "retool" || DIR_TO_POSTURE[dx.direction] === tl.posture);
  /*
   * THE SYNTHESIS, and the only genuinely new sentence on this page.
   *
   * Every derivation behind it already existed: the roster's own value window, the
   * other thirteen, and the arithmetic of which of them intersect (lib/metrics/window.ts).
   * Nowhere in the app were they ever joined, and the join is the thing a manager
   * actually does privately and badly - "my window is 2029; who else is bidding for
   * 2029". /plan is where it belongs because it is the one page whose subject is the
   * decision rather than the reading.
   *
   * COUNTS ONLY. It says how many rosters share the window and how many are dated
   * away from it; it does not say what to do about either, because that is the moves
   * list below, and it does not infer that anyone is a seller, because intent is not
   * something the app can see (D19).
   *
   * Rendered ONLY for a roster with a readable single window. When the viewer
   * straddles, `windowSynthesis` says so - but the timeline check directly above is
   * already saying exactly that at length, and two paragraphs making one point is the
   * density this page has repeatedly been cut back from.
   */
  const windows = leagueWindows(h);
  const windowLine =
    windows.me?.state === "window" ? windowSynthesis(windows) : null;
  /** Team identity for a partner roster, for the target row's logo. */
  const teamOf = (id) => {
    const r = h.rostersById.get(id);
    const u = r?.ownerId ? h.usersById.get(r.ownerId) : undefined;
    return { name: u?.teamName ?? u?.displayName ?? `Roster ${id}`, user: u };
  };
  return (
    <div>
      <PageHeader
        leading={
          <TeamAvatar
            name={h.me.teamName ?? h.me.displayName}
            avatarId={myUser?.avatar}
            teamLogoUrl={myUser?.teamLogoUrl}
            size="md"
            isMe
          />
        }
        kicker="Game plan"
        kickerAction={
          <Link
            href="/roster"
            className="-my-2 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
          >
            your roster
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        }
        title="How to improve this team"
      >
        <div className="flex flex-wrap items-center gap-x-2 figure text-meta text-faint">
          <span className="truncate">{h.me.teamName ?? h.me.displayName}</span>
          <span aria-hidden="true">·</span>
          <span>
            #{dx.valueRank} of {dx.teams} by asset value
          </span>
        </div>
      </PageHeader>

      {/* The verdict, up top - the one thing that must be readable on landing. */}
      <section className="rounded-[--radius] border border-border bg-surface p-2.5">
        <div className="mb-1 flex items-center gap-2">
          <Tag tone={dir.tone}>{dir.label}</Tag>
          <span className="text-meta uppercase tracking-wide text-secondary">
            recommended direction
          </span>
        </div>
        <h2 className="font-display text-lede font-semibold leading-tight text-ink">
          {dx.headline}
        </h2>
        <ul className="mt-1.5 space-y-1">
          {dx.because.map((b, i) => (
            <li key={i} className="flex gap-1.5 text-note leading-snug">
              <span
                aria-hidden="true"
                className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent"
              />
              <span className="text-ink/85">{b}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Diagnosis figures as one strip, with the position reads folded in. */}
      <div className="mt-1.5 flex items-stretch divide-x divide-border rounded-[--radius] border border-border bg-surface">
        {[
          { v: dx.starCount, l: "stars", s: "cornerstone+", tone: "text-ink" },
          {
            v: fmtValue(dx.pickTotal),
            l: "pick value",
            s:
              dx.extraFirsts >= 0
                ? `+${dx.extraFirsts} extra 1sts`
                : `${dx.extraFirsts} 1sts`,
            tone: dx.extraFirsts >= 0 ? "text-positive" : "text-negative",
          },
          {
            v: dx.deadWeight,
            l: "dead weight",
            s: "roster clogs",
            tone: "text-ink",
          },
        ].map((s) => (
          <div key={s.l} className="flex-1 px-1.5 py-1.5 text-center">
            <div
              className={cn(
                "figure text-lede font-semibold leading-tight",
                s.tone,
              )}
            >
              {s.v}
            </div>
            <div className="text-meta uppercase tracking-wide text-secondary">
              {s.l}
            </div>
            <div className="text-meta leading-tight text-muted">{s.s}</div>
          </div>
        ))}
      </div>

      {/* Timeline check - "your assets disagree about when you win" is directly
            actionable here, so it sits next to the diagnosis it qualifies. */}
      {tl && (
        <div
          className={`mt-1.5 rounded-[--radius-sm] border px-2.5 py-2 ${
            tl.posture === "straddling"
              ? "border-negative/30 bg-negative/[0.06]"
              : timelineAgrees
                ? "border-border bg-surface"
                : "border-warn/30 bg-warn/[0.05]"
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-meta font-semibold uppercase tracking-wide text-muted">
              Timeline check
            </span>
            <Link
              href="/league"
              className="figure text-meta text-secondary underline-offset-2 hover:text-accent-text hover:underline"
            >
              TCI {tl.tci} · value ~{tl.rosterDuration.toFixed(1)}s out
            </Link>
          </div>
          <p className="mt-0.5 text-note leading-snug text-ink/85">
            {tl.posture === "straddling"
              ? `Your assets do not agree about when you win: ${Math.round(tl.nowShare * 100)}% of your value pays off inside two seasons while ${Math.round(tl.laterShare * 100)}% arrives four or more out. Every move below should pull the roster onto ONE timeline - a move that adds value but widens the spread makes this worse.`
              : timelineAgrees
                ? `Your assets already agree with the ${dir.label.toLowerCase()} call - value is concentrated around ${tl.rosterDuration.toFixed(1)} seasons out. Protect that alignment: do not add pieces dated far from it.`
                : `The plan says ${dir.label.toLowerCase()}, but your value is dated like a ${tl.posture} roster (${tl.rosterDuration.toFixed(1)} seasons out, TCI ${tl.tci}). One of them is wrong. Each move below should shift the timeline toward the plan, or the plan should change.`}
          </p>
          {windowLine && (
            <p className="mt-1.5 border-t border-border pt-1.5 text-note leading-snug text-ink/85">
              {windowLine}{" "}
              <Link
                href="/league"
                className="text-meta font-semibold text-accent-text underline-offset-2 hover:underline"
              >
                see the window map
              </Link>
            </p>
          )}
        </div>
      )}
      {/* The index appears here as a bare figure - give a first-time reader the
            definition in place instead of a detour. Closed by default, one faint line. */}
      {tl && <MetricGloss metrics={["tci"]} className="mt-0.5" />}

      {(dx.weakPositions.length > 0 || dx.strengthPositions.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {dx.strengthPositions.map((p) => (
            <Tag key={`s-${p}`} tone="positive">
              strong at {p}
            </Tag>
          ))}
          {dx.weakPositions.map((p) => (
            <Tag key={`w-${p}`} tone="negative">
              thin at {p}
            </Tag>
          ))}
        </div>
      )}

      {/* The moves - the actual point of the page. */}
      <div className="mb-1.5 mt-4 flex items-baseline justify-between gap-3">
        <h2 className="text-meta font-semibold uppercase tracking-[0.16em] text-muted">
          {plan.moves.length} moves to consider
        </h2>
        <Link
          href="/trade"
          className="-my-2 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-accent-text"
        >
          price one out
          <ChevronRight size={12} aria-hidden="true" />
        </Link>
      </div>

      <div className="space-y-2">
        {plan.moves.map((m, i) => {
          const partner =
            m.partnerRosterId != null ? teamOf(m.partnerRosterId) : null;
          return (
            <article
              key={m.id}
              className="rounded-[--radius] border border-border bg-surface p-2.5"
            >
              <div className="flex items-baseline gap-2">
                <span
                  aria-hidden="true"
                  className="shrink-0 figure text-meta font-semibold text-accent-text"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="min-w-0 flex-1 font-display text-lede font-semibold leading-tight text-ink">
                  {m.title}
                </h3>
              </div>
              <p className="mt-1 text-note leading-snug text-ink/85">
                {m.detail}
              </p>

              {/* Send / target side by side even at 390px: the comparison is the point. */}
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <div className="rounded-[--radius-sm] border border-border bg-bg/40 px-2 py-1.5">
                  <div className="text-meta uppercase tracking-wide text-negative">
                    You send
                  </div>
                  <div className="text-note leading-snug text-ink">
                    {m.give.join(", ") || "-"}
                  </div>
                </div>
                <div className="rounded-[--radius-sm] border border-border bg-bg/40 px-2 py-1.5">
                  <div className="text-meta uppercase tracking-wide text-positive">
                    You target
                  </div>
                  <div className="text-note leading-snug text-ink">
                    {m.get.join(", ") || "-"}
                  </div>
                </div>
              </div>

              {m.partnerName && m.partnerRosterId != null && partner && (
                <Link
                  href={`/managers/${m.partnerRosterId}`}
                  aria-label={`Dossier: ${m.partnerName}`}
                  className="mt-1.5 flex min-h-11 items-center gap-2 rounded-[--radius-sm] border border-info/25 bg-info/[0.06] px-2 py-1.5 transition-colors hover:border-info/50 hover:bg-info/[0.1]"
                >
                  <Target
                    size={13}
                    aria-hidden="true"
                    className="shrink-0 text-info"
                  />
                  <TeamAvatar
                    name={partner.name}
                    avatarId={partner.user?.avatar}
                    teamLogoUrl={partner.user?.teamLogoUrl}
                    size="xs"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-note font-semibold text-ink">
                      Try {m.partnerName}
                    </span>
                    {m.partnerRationale && (
                      <span className="block truncate text-meta leading-tight text-muted">
                        {m.partnerRationale}
                      </span>
                    )}
                  </span>
                  <ArrowRight
                    size={13}
                    aria-hidden="true"
                    className="shrink-0 text-info"
                  />
                </Link>
              )}

              <p className="mt-1.5 flex items-start gap-1.5 text-meta leading-snug text-warn">
                <AlertTriangle
                  size={12}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                />
                <span>
                  <span className="font-semibold">The cost:</span> {m.cost}
                </span>
              </p>
            </article>
          );
        })}
      </div>

      {plan.caveats.length > 0 && (
        <>
          <h2 className="mb-1.5 mt-4 text-meta font-semibold uppercase tracking-[0.16em] text-muted">
            Read this before you act
          </h2>
          <ul className="space-y-1">
            {plan.caveats.map((c, i) => (
              <li
                key={i}
                className="rounded-[--radius-sm] border border-warn/25 bg-warn/[0.05] px-2.5 py-1.5 text-note leading-snug text-ink/85"
              >
                {c}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {[
          { href: "/trade", label: "Price a trade" },
          { href: "/values", label: "Asset values" },
          { href: "/managers", label: "Scout managers" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3 text-note font-semibold text-ink transition-colors hover:border-border-strong hover:bg-surface-2"
          >
            {a.label}
          </Link>
        ))}
      </div>

      <p className="mt-2 text-meta leading-relaxed text-secondary">
        Parquet can&apos;t execute trades - copy a pitch and send it from
        Sleeper.
      </p>
    </div>
  );
}
