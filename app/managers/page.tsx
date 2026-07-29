import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getAllDossiers } from "@/lib/dossier";
import { TeamAvatar } from "@/components/TeamAvatar";
import { signed } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function ManagersPage() {
  const h = await getLeagueHistory();
  const dossiers = getAllDossiers(h);
  const seasons = h.chain.length || 1;
  const me = h.me.rosterId;

  return (
    <div>
      {/* Compact editorial header: the kicker row doubles as a nav slot so the
          top of the page carries an action instead of dead space. */}
      <header className="mb-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Manager dossiers
          </p>
          {me != null && (
            <Link
              href={`/managers/${me}`}
              className="-my-2 inline-flex min-h-11 items-center gap-1 text-[11px] font-semibold text-muted transition-colors hover:text-accent"
            >
              your own file
              <ChevronRight size={12} aria-hidden="true" />
            </Link>
          )}
        </div>
        <h1 className="font-display text-[26px] font-semibold leading-[1.1] text-ink">
          Scout the managers
        </h1>
        <p className="mt-0.5 text-[12px] leading-snug text-muted">
          How they act, not what they hold.
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] tnum text-faint">
          <span>{dossiers.length} scouted</span>
          <span aria-hidden="true">·</span>
          <span>{seasons} seasons</span>
          <span aria-hidden="true">·</span>
          <span>{h.transactions.length.toLocaleString()} moves</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 text-warn">
            <Lock size={11} aria-hidden="true" />
            private
          </span>
        </div>
      </header>

      {/* One list, hairline-divided. Cards-with-gaps cost ~30px of pure air per
          screen and read as unrelated objects; a divided list reads as a ledger. */}
      <div className="overflow-hidden rounded-[--radius] border border-border bg-surface/60">
        <ul className="divide-y divide-border">
          {dossiers.map((d) => {
            const p = d.profile;
            const user = p.userId ? h.usersById.get(p.userId) : undefined;
            const shown = d.tags.slice(0, 3);
            const extra = d.tags.length - shown.length;
            return (
              <li key={p.rosterId}>
                <Link
                  href={`/managers/${p.rosterId}`}
                  aria-label={`Dossier: ${p.teamName ?? p.displayName}`}
                  className="flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
                >
                  <TeamAvatar
                    name={p.teamName ?? p.displayName}
                    avatarId={user?.avatar}
                    teamLogoUrl={user?.teamLogoUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="min-w-0 truncate text-[13px] font-semibold leading-tight text-ink">
                        {p.teamName ?? p.displayName}
                      </span>
                      <span className="shrink-0 truncate text-[11px] leading-tight text-faint">
                        {p.displayName}
                      </span>
                    </div>
                    {shown.length > 0 && (
                      <div className="mt-0.5 truncate text-[11px] font-medium leading-tight text-accent/85">
                        {shown.join(" · ")}
                        {extra > 0 && (
                          <span className="text-faint"> +{extra}</span>
                        )}
                      </div>
                    )}
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-[1.45] text-muted">
                      {d.read}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[11px] tnum text-faint">
                      <span className="font-semibold text-muted">
                        {p.trades} trades
                      </span>
                      <span>{d.tradesPerSeason}/szn</span>
                      <span>{p.totalTransactions} moves</span>
                      <span
                        className={
                          p.picks.net > 0
                            ? "text-positive"
                            : p.picks.net < 0
                              ? "text-negative"
                              : undefined
                        }
                      >
                        {signed(p.picks.net)} picks
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-faint"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Reads are inferred from public transactions, not stated intent. Sorted by
        total activity. Tap any manager for their approach notes, trade history and
        favorite partners.
      </p>
    </div>
  );
}
