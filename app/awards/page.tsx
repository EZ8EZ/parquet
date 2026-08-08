import Link from "next/link";
import { ChevronRight, Scale, Trophy, type LucideIcon } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { AWARD_GROUPS, awardsPageData, type Award, type AwardEntrant } from "@/lib/superlatives";
import { Tag, Disclosure, EmptyState, SectionHeader } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { AwardBadge, GROUP_TONE, iconForAward, type BadgeTone } from "@/components/AwardBadge";
import type { LeagueUser } from "@/lib/providers/types";
import { cn } from "@/lib/ui";
import { Onward } from "@/components/Onward";

export const dynamic = "force-dynamic";

const PLACE = ["2nd", "3rd", "4th"];

/** Entrant -> the league user behind it, for team imagery. */
type UserLookup = (entrant: AwardEntrant) => LeagueUser | undefined;

/**
 * Links an entrant to their dossier. A departed manager now has their own dossier
 * route, keyed by owner id rather than the roster they no longer hold - that roster's
 * `/managers/{id}` page describes their successor instead. Only the (theoretical)
 * case of a former entrant with no recorded owner id falls back to plain text, since
 * there is nothing to build a route from.
 */
function EntrantLink({
  entrant,
  className,
  ariaLabel,
  children,
}: {
  entrant: AwardEntrant;
  className: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  if (entrant.isFormer) {
    if (!entrant.ownerId) {
      return (
        <div className={className} aria-label={ariaLabel}>
          {children}
        </div>
      );
    }
    return (
      <Link
        href={`/managers/former/${entrant.ownerId}`}
        aria-label={ariaLabel}
        className={className}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link href={`/managers/${entrant.rosterId}`} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  );
}

/**
 * Sentence one, then the rest.
 *
 * Splits on a full stop followed by whitespace and a capital, which is what keeps
 * "taking the consensus number one at 1.01" in one piece - a naive split on "." breaks
 * that subtitle mid-clause, and it is one of the ones this exists to rescue.
 */
function firstSentence(text: string): [string, string] {
  const m = /(?<=[.!?])\s+(?=[A-Z])/.exec(text);
  if (!m) return [text, ""];
  return [text.slice(0, m.index), text.slice(m.index + m[0].length)];
}

/**
 * THE AWARD SUBTITLE, which used to be `line-clamp-2`.
 *
 * Two lines is the worst of both worlds at this length: it cost 514px across the
 * twenty cards on this page AND cut seven of them off mid-sentence, so the honesty
 * caveats D23 puts in these subtitles - "Hindsight pricing", "the number cannot tell
 * them apart", "a torn-down roster has little to lose" - were the exact words being
 * thrown away. They are the point of the subtitle, not the overflow.
 *
 * So: the claim stays on the card, always, unclamped. Everything after the first
 * sentence is one tap away in the house disclosure rather than deleted by CSS. Awards
 * whose subtitle is a single sentence render as a plain paragraph and pay no chrome at
 * all, which is most of the behavioural half of this page.
 */
function AwardSubtitle({ text }: { text: string }) {
  const [head, rest] = firstSentence(text);
  if (!rest) {
    return <p className="mt-0.5 text-meta leading-snug text-muted">{text}</p>;
  }
  return (
    <details className="group mt-0.5">
      <summary className="cursor-pointer list-none py-1 text-meta leading-snug text-muted">
        {head}{" "}
        <span className="whitespace-nowrap font-semibold text-accent-text">
          more
          <ChevronRight
            size={11}
            aria-hidden="true"
            className="inline align-[-1px] transition-transform group-open:rotate-90"
          />
        </span>
      </summary>
      <p className="pb-1 text-meta leading-snug text-muted">{rest}</p>
    </details>
  );
}

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
    !w.isFormer &&
    (w.rosterId === meRosterId || w.partnerRosterId === meRosterId);
  const user = userOf(w);
  const icon = iconForAward(award.id);
  const tone = GROUP_TONE[award.group];

  return (
    <article
      className={cn(
        "rounded-[--radius] border p-2.5",
        isMe ? "border-accent-edge bg-accent-wash" : "border-border bg-surface",
      )}
    >
      {/* Title and the winning number share a line: the figure is the headline. */}
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 flex-1 font-display text-lede font-semibold leading-tight text-ink">
          {award.title}
        </h3>
        <span className="shrink-0 figure text-note font-semibold text-accent-text">
          {award.statLine}
        </span>
      </div>
      <AwardSubtitle text={award.subtitle} />

      <EntrantLink
        entrant={w}
        ariaLabel={w.isFormer ? `Former manager: ${w.label}` : `Dossier: ${w.label}`}
        className={cn(
          "mt-1.5 flex min-h-11 items-center gap-2 rounded-[--radius-sm] border px-2 py-1.5 transition-colors",
          isMe
            ? "border-accent-edge bg-accent-wash hover:border-accent"
            : "border-border-strong bg-surface-2 hover:bg-elevated",
        )}
      >
        <AwardBadge icon={icon} tone={tone} rank="winner" />
        <TeamAvatar
          name={w.label}
          avatarId={user?.avatar}
          teamLogoUrl={user?.teamLogoUrl}
          size="xs"
          isMe={isMe}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="min-w-0 truncate text-body font-semibold text-ink">
              {w.label}
            </span>
            {isMe ? (
              <Tag tone="accent">you</Tag>
            ) : w.isFormer ? (
              <Tag>former{w.tenureLabel ? ` ${w.tenureLabel}` : ""}</Tag>
            ) : (
              <span className="min-w-0 shrink truncate text-meta text-secondary">
                {w.displayName}
              </span>
            )}
          </span>
        </span>
        {!w.isFormer && (
          <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-faint" />
        )}
      </EntrantLink>

      {w.partnerRosterId != null && (
        <Link
          href={`/managers/${w.partnerRosterId}`}
          className="-my-1 flex min-h-11 items-center gap-1 px-2 text-meta font-semibold text-accent-text"
        >
          also see {w.partnerLabel}
          <ChevronRight size={12} aria-hidden="true" />
        </Link>
      )}

      {award.runnersUp.length > 0 && (
        <ol className="mt-1 divide-y divide-border/70">
          {/* Keyed on the owner, not the roster: two principals share a roster id
              across a handover and can both place in the same award. */}
          {award.runnersUp.map((r, i) => (
            <li key={`${r.ownerId ?? r.rosterId}-${r.partnerRosterId ?? ""}`}>
              <RunnerUpRow
                entrant={r}
                place={PLACE[i] ?? `${i + 2}th`}
                meRosterId={meRosterId}
                user={userOf(r)}
                icon={icon}
                tone={tone}
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
  icon,
  tone,
}: {
  entrant: AwardEntrant;
  place: string;
  meRosterId: number | null;
  user: LeagueUser | undefined;
  icon: LucideIcon;
  tone: BadgeTone;
}) {
  const isMe =
    meRosterId != null &&
    !entrant.isFormer &&
    (entrant.rosterId === meRosterId || entrant.partnerRosterId === meRosterId);
  return (
    <EntrantLink
      entrant={entrant}
      ariaLabel={`${place}: ${entrant.label}, ${entrant.stat}`}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-[--radius-sm] px-1.5 transition-colors",
        isMe ? "bg-accent-wash" : "hover:bg-surface-2",
      )}
    >
      <span
        aria-hidden="true"
        className="w-3 shrink-0 figure text-meta text-faint"
      >
        {place.replace(/\D/g, "")}
      </span>
      <AwardBadge icon={icon} tone={tone} rank="runner-up" size={18} />
      <TeamAvatar
        name={entrant.label}
        avatarId={user?.avatar}
        teamLogoUrl={user?.teamLogoUrl}
        size="xs"
        isMe={isMe}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-note",
          isMe ? "font-semibold text-accent-text" : "text-muted",
        )}
      >
        {entrant.label}
      </span>
      {entrant.tenureLabel && (
        <span className="shrink-0 text-micro text-faint">
          {entrant.tenureLabel}
        </span>
      )}
      {/* `shrink-0 truncate` is self-contradictory: truncate needs a shrinkable
          box and shrink-0 forbids one, so a long stat string refused to compress,
          crushed the team name beside it to a single character ("6...", "5..."),
          and still pushed the page 79px past the viewport on every iPhone. The
          name is what this page is FOR, so the stat yields first. */}
      <span className="min-w-0 shrink truncate figure text-meta text-secondary">
        {entrant.stat}
      </span>
    </EntrantLink>
  );
}

export default async function AwardsPage() {
  const h = await getLeagueHistory();
  const { awards, summary } = await awardsPageData(h);
  const meRosterId = h.me.rosterId;

  // A departed manager shares a roster id with whoever took the team over, so keying
  // imagery off the roster would put the current owner's logo on the former owner's
  // award. Resolve by owner id and let the avatar fall back to a monogram.
  const userOf: UserLookup = (entrant) => {
    if (entrant.ownerId) return h.usersById.get(entrant.ownerId);
    const r = h.rostersById.get(entrant.rosterId);
    return r?.ownerId ? h.usersById.get(r.ownerId) : undefined;
  };

  const mine = awards.filter(
    (a) =>
      meRosterId != null &&
      !a.winner.isFormer &&
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
          <p className="text-meta font-semibold uppercase tracking-[0.18em] text-accent-text">
            League awards
          </p>
          <Link
            href="/league"
            className="-my-2 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
          >
            the league
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        </div>
        <h1 className="font-display text-display font-semibold leading-[1.1] text-ink">
          The Superlatives
        </h1>
        <p className="mt-0.5 text-note leading-snug text-muted">
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
          <div className="flex items-stretch divide-x divide-border rounded-[--radius] border border-border bg-surface">
            {[
              { v: awards.length, l: "awards", t: undefined as string | undefined },
              {
                v: summary.managers,
                l: "managers",
                // Not the number of teams: a team that changed hands contributes two
                // managers, and the one who left is still eligible for their seasons.
                // This used to be an asterisk pointing at a 30-word footnote at the
                // bottom of a very long page - a permanent tax on every reader to
                // explain one number to the reader who wondered. It is a definition,
                // so it lives on the definition, and /about carries the long form.
                t:
                  summary.formerManagers > 0
                    ? `${summary.managers} managers across ${summary.managers - summary.formerManagers} teams: ${summary.formerManagers} team${summary.formerManagers === 1 ? " has" : "s have"} changed hands, and each manager is judged only on the seasons they actually ran.`
                    : undefined,
              },
              { v: summary.trades, l: "trades", t: undefined },
              { v: summary.moves.toLocaleString(), l: "moves", t: undefined },
            ].map((s, i) => (
              <div key={s.l} className="flex-1 px-1 py-1.5 text-center">
                <div
                  className={cn(
                    "figure text-lede font-semibold leading-tight",
                    i === 0 ? "text-accent-text" : "text-ink",
                  )}
                >
                  {s.v}
                </div>
                <div className="text-meta uppercase tracking-wide text-secondary">
                  {s.t ? (
                    <abbr
                      title={s.t}
                      className="cursor-help underline decoration-dotted underline-offset-2"
                    >
                      {s.l}
                    </abbr>
                  ) : (
                    s.l
                  )}
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
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-note font-medium text-ink transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                {g.label}
                <span className="figure text-meta text-secondary">
                  {g.items.length}
                </span>
              </a>
            ))}
          </nav>

          {mine.length > 0 && (
            <p className="mt-2 rounded-[--radius] border border-accent-edge bg-accent-wash px-2.5 py-1.5 text-meta leading-snug text-muted">
              <span className="font-semibold text-ink">Your mantel:</span>{" "}
              {mine.map((a) => a.title).join(", ")}.
            </p>
          )}

          {groups.map((g) => (
            <section key={g.id} id={g.id} className="scroll-mt-3">
              <SectionHeader title={g.label} />
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

          {/* The rules of the competition, which every reader needs exactly once and
              no reader needs on the way past. Collapsed into the house idiom rather
              than deleted: a page that hands out thirteen verdicts owes the reader a
              way to check how ties and blanks were settled. */}
          <Disclosure
            summary="How these are settled"
            icon={<Scale size={12} />}
            className="mt-4"
          >
            <p>
              Derived from {summary.moves.toLocaleString()} recorded transactions across{" "}
              {summary.seasons} seasons. Ties break to the lower roster number. Awards
              with no real signal behind them are left unawarded rather than handed to
              the least-bad entrant.
            </p>
            {summary.formerManagers > 0 && (
              <p className="mt-2">
                {summary.managers} managers across{" "}
                {summary.managers - summary.formerManagers} teams:{" "}
                {summary.formerManagers} team
                {summary.formerManagers === 1 ? " has" : "s have"} changed hands, and
                each manager is judged only on the seasons they actually ran. A former
                manager keeps their own dossier, because the roster they left now
                describes their successor.
              </p>
            )}
          </Disclosure>
        </>
      )}
      <Onward from="/awards" />
    </div>
  );
}
