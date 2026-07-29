import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight, Target } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildGamePlan } from "@/lib/gameplan";
import { getPrincipals } from "@/lib/principals";
import { leagueTimelines } from "@/lib/metrics/duration";
import { Tag } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { CopyBlock } from "@/components/CopyBlock";
import { cn, fmtValue } from "@/lib/ui";

export const dynamic = "force-dynamic";

const DIR_LABEL: Record<
  string,
  { label: string; tone: "accent" | "info" | "warn" | "positive" }
> = {
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
        <Link href="/teams" className="text-accent underline">
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
  const DIR_TO_POSTURE: Record<string, string> = {
    contend: "contending",
    ascend: "ascending",
    rebuild: "rebuilding",
  };
  const timelineAgrees =
    tl != null &&
    tl.posture !== "straddling" &&
    (dx.direction === "retool" || DIR_TO_POSTURE[dx.direction] === tl.posture);

  /** Team identity for a partner roster, for the target row's logo. */
  const teamOf = (id: number) => {
    const r = h.rostersById.get(id);
    const u = r?.ownerId ? h.usersById.get(r.ownerId) : undefined;
    return { name: u?.teamName ?? u?.displayName ?? `Roster ${id}`, user: u };
  };

  return (
    <div>
      <header className="mb-2 flex items-start gap-2.5">
        <TeamAvatar
          name={h.me.teamName ?? h.me.displayName}
          avatarId={myUser?.avatar}
          teamLogoUrl={myUser?.teamLogoUrl}
          size="md"
          isMe
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              Game plan
            </p>
            <Link
              href="/roster"
              className="-my-2 inline-flex min-h-11 items-center gap-1 text-[11px] font-semibold text-muted transition-colors hover:text-accent"
            >
              your roster
              <ChevronRight size={12} aria-hidden="true" />
            </Link>
          </div>
          <h1 className="font-display text-[24px] font-semibold leading-[1.12] text-ink">
            How to improve this team
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] tnum text-faint">
            <span className="truncate">{h.me.teamName ?? h.me.displayName}</span>
            <span aria-hidden="true">·</span>
            <span>
              #{dx.valueRank} of {dx.teams} by asset value
            </span>
          </div>
        </div>
      </header>

      {/* The verdict, up top - the one thing that must be readable on landing. */}
      <section className="rounded-[--radius] border border-border bg-surface/80 p-2.5">
        <div className="mb-1 flex items-center gap-2">
          <Tag tone={dir.tone}>{dir.label}</Tag>
          <span className="text-[11px] uppercase tracking-wide text-faint">
            recommended direction
          </span>
        </div>
        <h2 className="font-display text-[20px] font-semibold leading-tight text-ink">
          {dx.headline}
        </h2>
        <ul className="mt-1.5 space-y-1">
          {dx.because.map((b, i) => (
            <li key={i} className="flex gap-1.5 text-[12.5px] leading-snug">
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
      <div className="mt-1.5 flex items-stretch divide-x divide-border rounded-[--radius] border border-border bg-surface/60">
        {[
          { v: dx.starCount, l: "stars", s: "cornerstone+", tone: "text-ink" },
          {
            v: fmtValue(dx.pickTotal),
            l: "pick value",
            s: dx.extraFirsts >= 0 ? `+${dx.extraFirsts} extra 1sts` : `${dx.extraFirsts} 1sts`,
            tone: dx.extraFirsts >= 0 ? "text-positive" : "text-negative",
          },
          { v: dx.deadWeight, l: "fringe", s: "roster clogs", tone: "text-ink" },
        ].map((s) => (
          <div key={s.l} className="flex-1 px-1.5 py-1.5 text-center">
            <div
              className={cn(
                "font-mono text-[17px] font-semibold leading-tight tnum",
                s.tone,
              )}
            >
              {s.v}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-faint">{s.l}</div>
            <div className="text-[11px] leading-tight text-muted">{s.s}</div>
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
                ? "border-border bg-surface/60"
                : "border-warn/30 bg-warn/[0.05]"
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Timeline check
            </span>
            <Link
              href="/league"
              className="font-mono text-[11px] tnum text-faint underline-offset-2 hover:text-accent hover:underline"
            >
              TCI {tl.tci} · value ~{tl.rosterDuration.toFixed(1)}s out
            </Link>
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-ink/85">
            {tl.posture === "straddling"
              ? `Your assets do not agree about when you win: ${Math.round(
                  tl.nowShare * 100,
                )}% of your value pays off inside two seasons while ${Math.round(
                  tl.laterShare * 100,
                )}% arrives four or more out. Every move below should pull the roster onto ONE timeline - a move that adds value but widens the spread makes this worse.`
              : timelineAgrees
                ? `Your assets already agree with the ${dir.label.toLowerCase()} call - value is concentrated around ${tl.rosterDuration.toFixed(
                    1,
                  )} seasons out. Protect that alignment: do not add pieces dated far from it.`
                : `The plan says ${dir.label.toLowerCase()}, but your value is dated like a ${tl.posture} roster (${tl.rosterDuration.toFixed(
                    1,
                  )} seasons out, TCI ${tl.tci}). One of them is wrong. Each move below should shift the timeline toward the plan, or the plan should change.`}
          </p>
        </div>
      )}

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
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          {plan.moves.length} moves to consider
        </h2>
        <Link
          href="/trade"
          className="-my-2 inline-flex min-h-11 items-center gap-1 text-[11px] font-semibold text-accent"
        >
          price one out
          <ChevronRight size={12} aria-hidden="true" />
        </Link>
      </div>

      <div className="space-y-2">
        {plan.moves.map((m, i) => {
          const partner = m.partnerRosterId != null ? teamOf(m.partnerRosterId) : null;
          return (
            <article
              key={m.id}
              className="rounded-[--radius] border border-border bg-surface/70 p-2.5"
            >
              <div className="flex items-baseline gap-2">
                <span
                  aria-hidden="true"
                  className="shrink-0 font-mono text-[11px] font-semibold text-accent"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="min-w-0 flex-1 font-display text-[17px] font-semibold leading-tight text-ink">
                  {m.title}
                </h3>
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-ink/85">{m.detail}</p>

              {/* Send / target side by side even at 390px: the comparison is the point. */}
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <div className="rounded-[--radius-sm] border border-border bg-bg/40 px-2 py-1.5">
                  <div className="text-[11px] uppercase tracking-wide text-negative/80">
                    You send
                  </div>
                  <div className="text-[12px] leading-snug text-ink">
                    {m.give.join(", ") || "-"}
                  </div>
                </div>
                <div className="rounded-[--radius-sm] border border-border bg-bg/40 px-2 py-1.5">
                  <div className="text-[11px] uppercase tracking-wide text-positive/80">
                    You target
                  </div>
                  <div className="text-[12px] leading-snug text-ink">
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
                  <Target size={13} aria-hidden="true" className="shrink-0 text-info" />
                  <TeamAvatar
                    name={partner.name}
                    avatarId={partner.user?.avatar}
                    teamLogoUrl={partner.user?.teamLogoUrl}
                    size="xs"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-ink">
                      Try {m.partnerName}
                    </span>
                    {m.partnerRationale && (
                      <span className="block truncate text-[11px] leading-tight text-muted">
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

              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-warn">
                <AlertTriangle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold">The cost:</span> {m.cost}
                </span>
              </p>

              {/* Collapsed by default: the pitch text is ~90px of monospace that most
                  visits never need, but it is one tap away and unchanged. */}
              <details className="group mt-1.5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                  <ChevronRight
                    size={13}
                    aria-hidden="true"
                    className="transition-transform group-open:rotate-90"
                  />
                  Pitch text for Sleeper
                </summary>
                <div className="pb-0.5">
                  <CopyBlock text={m.copyable} label="Ready to paste" />
                </div>
              </details>
            </article>
          );
        })}
      </div>

      {plan.caveats.length > 0 && (
        <>
          <h2 className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Read this before you act
          </h2>
          <ul className="space-y-1">
            {plan.caveats.map((c, i) => (
              <li
                key={i}
                className="rounded-[--radius-sm] border border-warn/25 bg-warn/[0.05] px-2.5 py-1.5 text-[12px] leading-snug text-ink/85"
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
            className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface/60 px-3 text-[12px] font-semibold text-ink transition-colors hover:border-border-strong hover:bg-surface-2"
          >
            {a.label}
          </Link>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        Parquet can&apos;t execute trades - copy a pitch and send it from Sleeper.
      </p>
    </div>
  );
}
