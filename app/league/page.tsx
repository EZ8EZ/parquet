import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { leagueValueRanking } from "@/lib/roster";
import { DeltaValue } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { fmtValue } from "@/lib/ui";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperLeagueUrl } from "@/lib/sleeperLinks";

export const dynamic = "force-dynamic";

const WINDOW_INK = {
  rebuilding: "text-info",
  "win-now": "text-accent",
  balanced: "text-muted",
} as const;

/** League-level destinations. Every one of these routes exists. */
const DEEPER = [
  { href: "/managers", label: "Dossiers" },
  { href: "/awards", label: "Awards" },
  { href: "/web", label: "Trade web" },
  { href: "/drafts", label: "Drafts" },
  { href: "/ledger", label: "Ledger" },
] as const;

export default async function LeaguePage() {
  const h = await getLeagueHistory();
  const ranked = leagueValueRanking(h);
  const meId = h.me.rosterId;

  const contenders = ranked.filter((r) => r.window === "win-now").length;
  const rebuilders = ranked.filter((r) => r.window === "rebuilding").length;
  const balanced = ranked.length - contenders - rebuilders;

  const leaderValue = ranked[0]?.totalValue ?? 1;
  const leagueValue = ranked.reduce((s, r) => s + r.totalValue, 0);
  const median = ranked.length
    ? ranked[Math.floor(ranked.length / 2)].totalValue
    : 0;
  const myRank = meId != null ? ranked.findIndex((r) => r.rosterId === meId) + 1 : 0;

  return (
    <div>
      <header className="mb-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              {h.currentLeague.name}
            </p>
            <h1 className="font-display text-[26px] font-semibold leading-tight text-ink">
              The League
            </h1>
          </div>
          <OpenInSleeper
            href={sleeperLeagueUrl(h.currentLeague.leagueId)}
            label="Sleeper"
            className="shrink-0"
          />
        </div>
        <p className="mt-1 font-mono text-[11px] tnum text-faint">
          {h.currentLeague.totalRosters} teams · {h.chain.length} seasons ·{" "}
          {h.currentLeague.season} · {fmtValue(h.transactions.length)} transactions
        </p>
      </header>

      {/* Window split as one rail rather than three tall cards. */}
      <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface/60">
        <Split n={contenders} label="win-now" className="text-accent" />
        <Split n={balanced} label="balanced" className="text-ink" />
        <Split n={rebuilders} label="rebuilding" className="text-info" />
      </div>

      <p className="mt-1.5 font-mono text-[11px] tnum text-faint">
        league value {fmtValue(leagueValue)} · median {fmtValue(median)}
        {myRank > 0 && (
          <>
            {" "}
            · you rank{" "}
            <span className="font-semibold text-accent">
              {myRank}/{ranked.length}
            </span>
          </>
        )}
      </p>

      <nav aria-label="League sections" className="scroll-x mt-2 flex gap-1.5">
        {DEEPER.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-border bg-surface/60 px-3 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {d.label}
          </Link>
        ))}
      </nav>

      <h2 className="mb-1.5 mt-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
        Power ranking - by roster value
      </h2>

      <ul className="space-y-1">
        {ranked.map((r, i) => {
          const isMe = r.rosterId === meId;
          const ownerId = h.rostersById.get(r.rosterId)?.ownerId;
          const user = ownerId ? h.usersById.get(ownerId) : undefined;
          const pct = Math.max(3, Math.round((r.totalValue / leaderValue) * 100));
          return (
            <li key={r.rosterId}>
              {/* The whole row is the hit area - one target, one destination. */}
              <Link
                href={`/managers/${r.rosterId}`}
                className={`flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border px-2.5 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2 ${
                  isMe
                    ? "border-accent/40 bg-accent/[0.06]"
                    : "border-border bg-surface/60"
                }`}
              >
                <span className="w-4 shrink-0 text-center font-mono text-[11px] tnum text-faint">
                  {i + 1}
                </span>
                <TeamAvatar
                  name={r.teamName ?? r.ownerName}
                  avatarId={user?.avatar}
                  teamLogoUrl={user?.teamLogoUrl}
                  size="sm"
                  isMe={isMe}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold leading-tight text-ink">
                      {r.teamName ?? r.ownerName}
                    </span>
                    {isMe && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[11px] font-semibold leading-tight text-accent">
                        you
                      </span>
                    )}
                  </span>
                  <span className="mt-px block truncate font-mono text-[11px] tnum text-faint">
                    {r.ownerName} · {r.record.wins}-{r.record.losses} ·{" "}
                    <span className={WINDOW_INK[r.window]}>{r.window}</span>
                  </span>
                  <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-elevated">
                    <span
                      className={`block h-full rounded-full ${
                        isMe ? "bg-accent" : "bg-accent/45"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[13px] font-semibold leading-tight tnum text-ink">
                    {fmtValue(r.totalValue)}
                  </span>
                  <span className="block whitespace-nowrap font-mono text-[11px] leading-tight tnum text-faint">
                    1sts <DeltaValue n={r.picks.extraFirsts} />
                  </span>
                  <span className="block whitespace-nowrap font-mono text-[11px] leading-tight tnum text-faint">
                    age {r.coreAge ?? "-"}
                  </span>
                </span>
                <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-faint" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Split({
  n,
  label,
  className,
}: {
  n: number;
  label: string;
  className: string;
}) {
  return (
    <div className="px-2.5 py-1.5 text-center">
      <div className={`font-mono text-xl font-semibold leading-tight tnum ${className}`}>
        {n}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
}
