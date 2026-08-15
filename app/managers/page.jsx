import Link from "next/link";
import { ChevronRight, Lock, Trophy } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getAllDossiers } from "@/lib/dossier";
import { titleSummariesByOwner } from "@/lib/dossier/titles";
import { getPrincipals } from "@/lib/principals";
import { PageHeader, Tag } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { signed } from "@/lib/ui";
import { Onward } from "@/components/Onward";
export const dynamic = "force-dynamic";
export default async function ManagersPage() {
  const h = await getLeagueHistory();
  const principals = await getPrincipals(h);
  const dossiers = getAllDossiers(h, principals);
  const titlesByOwnerId = titleSummariesByOwner(h, principals);
  const seasons = h.chain.length || 1;
  const me = h.me.rosterId;
  return (
    <div>
      {/* Compact editorial header: the kicker row doubles as a nav slot so the
            top of the page carries an action instead of dead space. */}
      <PageHeader
        kicker="Manager dossiers"
        kickerAction={
          <div className="flex items-center gap-3">
            <Link
              href="/managers/compare"
              className="-my-2 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
            >
              compare two
              <ChevronRight size={12} aria-hidden="true" />
            </Link>
            {me != null && (
              <Link
                href={`/managers/${me}`}
                className="-my-2 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
              >
                your own file
                <ChevronRight size={12} aria-hidden="true" />
              </Link>
            )}
          </div>
        }
        title="Scout the managers"
        subtitle="How they act, not what they hold."
      >
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 figure text-meta text-faint">
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
      </PageHeader>

      {/* One list, hairline-divided. Cards-with-gaps cost ~30px of pure air per
            screen and read as unrelated objects; a divided list reads as a ledger. */}
      <div className="overflow-hidden rounded-[--radius] border border-border bg-surface">
        <ul className="divide-y divide-border">
          {dossiers.map((d) => {
            const p = d.profile;
            const identity = d.identity;
            const isFormer = identity.kind === "former";
            // A former principal is absent from the current league's user list, so
            // their imagery comes off the principal record itself, not h.usersById.
            const principal = p.userId
              ? principals.byOwnerId.get(p.userId)
              : undefined;
            const href =
              identity.kind === "former"
                ? `/managers/former/${identity.ownerId}`
                : `/managers/${identity.rosterId}`;
            const key =
              identity.kind === "former"
                ? `former-${identity.ownerId}`
                : `current-${identity.rosterId}`;
            const shown = d.tags.slice(0, 3);
            const extra = d.tags.length - shown.length;
            // Keyed by ownerId, not rosterId - see lib/dossier/titles.ts and D22.
            const titles = p.userId ? titlesByOwnerId.get(p.userId) : undefined;
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-label={`Dossier: ${p.teamName ?? p.displayName}`}
                  className="flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
                >
                  <TeamAvatar
                    name={p.teamName ?? p.displayName}
                    avatarId={principal?.avatar}
                    teamLogoUrl={principal?.teamLogoUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    {/*
                        THIS USED TO BE ONE BASELINE ROW: team name, owner name and a
                        "former 2022-2024" tag all fighting `truncate` for the same
                        line. On the live 14-card list that cost a real bug - the one
                        former-manager row (team "Blockbuster", owner "BigTrades",
                        plus the tag) clipped BOTH names at once: "Blockbu... BigTra...".
                        Three variable-length strings sharing one truncating line will
                        always have a combination that breaks; splitting the owner name
                        (+ tag, when present) onto its own line below gives each string
                        the full card width instead of a fraction of it, which is what
                        an 11-character team name and a 9-character owner name never
                        needed to share in the first place.
                      */}
                    <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
                      {p.teamName ?? p.displayName}
                    </span>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="min-w-0 truncate text-meta leading-tight text-secondary">
                        {p.displayName}
                      </span>
                      {isFormer && d.identity.kind === "former" && (
                        <Tag className="shrink-0">
                          former {d.identity.tenureLabel}
                        </Tag>
                      )}
                    </div>
                    {titles && (
                      <div className="mt-0.5 flex items-center gap-1 text-meta font-semibold text-accent-text">
                        <Trophy
                          size={11}
                          aria-hidden="true"
                          className="shrink-0"
                        />
                        <span className="truncate">{titles.label}</span>
                      </div>
                    )}
                    {shown.length > 0 && (
                      // Was single-line `truncate`: three tags joined with " · "
                      // routinely ran past the card width and clipped the last one
                      // mid-word ("...Reactiv...", screenshotted on the live list).
                      // `line-clamp-2` wraps instead, which a three-tag line needs at
                      // most - never shrinks type, never grows the card past two lines.
                      <div className="mt-0.5 line-clamp-2 text-meta font-medium leading-tight text-accent-text">
                        {shown.join(" · ")}
                        {extra > 0 && (
                          <span className="text-secondary"> +{extra}</span>
                        )}
                      </div>
                    )}
                    <p className="mt-0.5 line-clamp-2 text-meta leading-[1.45] text-muted">
                      {d.read}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 figure text-meta text-secondary">
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

      <p className="mt-3 text-meta leading-relaxed text-secondary">
        Reads are inferred from public transactions, not stated intent. Sorted
        by total activity. Tap any manager for their approach notes, trade
        history and favorite partners.
      </p>
      <Onward from="/managers" />
    </div>
  );
}
