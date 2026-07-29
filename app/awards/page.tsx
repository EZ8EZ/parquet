import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import {
  AWARD_GROUPS,
  awardsSummary,
  computeAwards,
  type Award,
  type AwardEntrant,
} from "@/lib/superlatives";
import { Tag, EmptyState } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import type { LeagueUser } from "@/lib/providers/types";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";

const PLACE = ["2nd", "3rd", "4th"];

/** Roster -> the league user behind it, for team imagery. */
type UserLookup = (rosterId: number) => LeagueUser | undefined;

function AwardCard({
  award,
  meRosterId,
  userOf,
}: {
  award: Award;
  meRosterId: number | null;
  userOf: UserLookup;
}) {
  const w = award.winner;
  const isMe =
    meRosterId != null &&
    (w.rosterId === meRosterId || w.partnerRosterId === meRosterId);
  const user = userOf(w.rosterId);

  return (
    <article
      className={cn(
        "rounded-[--radius] border p-2.5",
        isMe ? "border-accent/40 bg-accent/[0.06]" : "border-border bg-surface/70",
      )}
    >
      {/* Title and the winning number share a line: the figure is the headline. */}
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 flex-1 font-display text-[17px] font-semibold leading-tight text-ink">
          {award.title}
        </h3>
        <span className="shrink-0 font-mono text-[12px] font-semibold tnum text-accent">
          {award.statLine}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">
        {award.subtitle}
      </p>

      <Link
        href={`/managers/${w.rosterId}`}
        aria-label={`Dossier: ${w.label}`}
        className={cn(
          "mt-1.5 flex min-h-11 items-center gap-2 rounded-[--radius-sm] border px-2 py-1.5 transition-colors",
          isMe
            ? "border-accent/40 bg-accent/[0.07] hover:bg-accent/[0.11]"
            : "border-border-strong bg-surface-2 hover:bg-elevated",
        )}
      >
        <Trophy
          size={13}
          aria-hidden="true"
          className={cn("shrink-0", isMe ? "text-accent" : "text-faint")}
        />
        <TeamAvatar
          name={w.label}
          avatarId={user?.avatar}
          teamLogoUrl={user?.teamLogoUrl}
          size="xs"
          isMe={isMe}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
              {w.label}
            </span>
            {isMe ? (
              <Tag tone="accent">you</Tag>
            ) : (
              <span className="shrink-0 truncate text-[11px] text-faint">
                {w.displayName}
              </span>
            )}
          </span>
        </span>
        <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-faint" />
      </Link>

      {w.partnerRosterId != null && (
        <Link
          href={`/managers/${w.partnerRosterId}`}
          className="-my-1 flex min-h-11 items-center gap-1 px-2 text-[11px] font-semibold text-accent"
        >
          also see {w.partnerLabel}
          <ChevronRight size={12} aria-hidden="true" />
        </Link>
      )}

      {award.runnersUp.length > 0 && (
        <ol className="mt-1 divide-y divide-border/70">
          {award.runnersUp.map((r, i) => (
            <li key={`${r.rosterId}-${r.partnerRosterId ?? ""}`}>
              <RunnerUpRow
                entrant={r}
                place={PLACE[i] ?? `${i + 2}th`}
                meRosterId={meRosterId}
                user={userOf(r.rosterId)}
              />
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function RunnerUpRow({
  entrant,
  place,
  meRosterId,
  user,
}: {
  entrant: AwardEntrant;
  place: string;
  meRosterId: number | null;
  user: LeagueUser | undefined;
}) {
  const isMe =
    meRosterId != null &&
    (entrant.rosterId === meRosterId || entrant.partnerRosterId === meRosterId);
  return (
    <Link
      href={`/managers/${entrant.rosterId}`}
      aria-label={`${place}: ${entrant.label}, ${entrant.stat}`}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-[--radius-sm] px-1.5 transition-colors",
        isMe ? "bg-accent/[0.05]" : "hover:bg-surface-2",
      )}
    >
      <span
        aria-hidden="true"
        className="w-3 shrink-0 font-mono text-[11px] tnum text-faint"
      >
        {place.replace(/\D/g, "")}
      </span>
      <TeamAvatar
        name={entrant.label}
        avatarId={user?.avatar}
        teamLogoUrl={user?.teamLogoUrl}
        size="xs"
        isMe={isMe}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[12px]",
          isMe ? "font-semibold text-accent" : "text-muted",
        )}
      >
        {entrant.label}
      </span>
      <span className="shrink-0 truncate font-mono text-[11px] tnum text-faint">
        {entrant.stat}
      </span>
    </Link>
  );
}

export default async function AwardsPage() {
  const h = await getLeagueHistory();
  const awards = computeAwards(h);
  const summary = awardsSummary(h);
  const meRosterId = h.me.rosterId;

  const userOf: UserLookup = (rosterId) => {
    const r = h.rostersById.get(rosterId);
    return r?.ownerId ? h.usersById.get(r.ownerId) : undefined;
  };

  const mine = awards.filter(
    (a) =>
      meRosterId != null &&
      (a.winner.rosterId === meRosterId || a.winner.partnerRosterId === meRosterId),
  );

  const groups = AWARD_GROUPS.map((g) => ({
    ...g,
    items: awards.filter((a) => a.group === g.id),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <header className="mb-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            League awards
          </p>
          <Link
            href="/league"
            className="-my-2 inline-flex min-h-11 items-center gap-1 text-[11px] font-semibold text-muted transition-colors hover:text-accent"
          >
            the league
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        </div>
        <h1 className="font-display text-[26px] font-semibold leading-[1.1] text-ink">
          The Superlatives
        </h1>
        <p className="mt-0.5 text-[12px] leading-snug text-muted">
          Earned, not voted. Judged purely on what they actually did.
        </p>
      </header>

      {awards.length === 0 ? (
        <EmptyState
          icon={<Trophy size={22} aria-hidden />}
          title="Not enough history yet"
          cta={{ href: "/league", label: "See the league" }}
        >
          There aren&rsquo;t enough recorded transactions to hand out awards. Come
          back once the league has some deals on the books.
        </EmptyState>
      ) : (
        <>
          {/* Figures inline, hairline-separated: three cards cost 90px for four numbers. */}
          <div className="flex items-stretch divide-x divide-border rounded-[--radius] border border-border bg-surface/60">
            {[
              { v: awards.length, l: "awards" },
              { v: summary.managers, l: "managers" },
              { v: summary.trades, l: "trades" },
              { v: summary.moves.toLocaleString(), l: "moves" },
            ].map((s, i) => (
              <div key={s.l} className="flex-1 px-1 py-1.5 text-center">
                <div
                  className={cn(
                    "font-mono text-[17px] font-semibold leading-tight tnum",
                    i === 0 ? "text-accent" : "text-ink",
                  )}
                >
                  {s.v}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-faint">
                  {s.l}
                </div>
              </div>
            ))}
          </div>

          {/* Jump rail: 13 awards is a long page - let people land on a category. */}
          <nav aria-label="Award categories" className="mt-2 flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <a
                key={g.id}
                href={`#${g.id}`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface/60 px-2.5 text-[12px] font-medium text-ink transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                {g.label}
                <span className="font-mono text-[11px] tnum text-faint">
                  {g.items.length}
                </span>
              </a>
            ))}
          </nav>

          {mine.length > 0 && (
            <p className="mt-2 rounded-[--radius] border border-accent/30 bg-accent/[0.06] px-2.5 py-1.5 text-[11.5px] leading-snug text-muted">
              <span className="font-semibold text-ink">Your mantel:</span>{" "}
              {mine.map((a) => a.title).join(", ")}.
            </p>
          )}

          {groups.map((g) => (
            <section key={g.id} id={g.id} className="scroll-mt-3">
              <h2 className="mb-1.5 mt-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                {g.label}
              </h2>
              <div className="space-y-1.5">
                {g.items.map((a) => (
                  <AwardCard
                    key={a.id}
                    award={a}
                    meRosterId={meRosterId}
                    userOf={userOf}
                  />
                ))}
              </div>
            </section>
          ))}

          <p className="mt-4 text-[11px] leading-relaxed text-faint">
            Derived from {summary.moves.toLocaleString()} recorded transactions across{" "}
            {summary.seasons} seasons. Ties break to the lower roster number. Awards
            with no real signal behind them are left unawarded. Tap any team for their
            dossier.
          </p>
        </>
      )}
    </div>
  );
}
