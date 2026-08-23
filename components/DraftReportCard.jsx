import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card, Tag } from "@/components/ui";
import { ordinal, rosterName } from "@/lib/derive/describe";
import { fmtValue, cn } from "@/lib/ui";
import { boardHref } from "@/app/drafts/parts";
/** Player display fields for a standout pick, preferring the live player universe. */
function playerMeta(h, p) {
  const player = h.players.get(p.playerId);
  return {
    team: player?.team ?? null,
    position: player?.position ?? null,
    age: player?.age ?? null,
  };
}
/** One standout-pick row: avatar, who took it, and the one sentence that explains why
 *  it is here. Shared by both the "best" and "miss" rows so the two read as a pair. */
function StandoutRow({ h, principals, label, tone, g, detail }) {
  const meta = playerMeta(h, g);
  return (
    <Link
      href={boardHref(g.season, g.pickNo)}
      className="flex min-h-11 items-start gap-2 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-2 transition-colors hover:bg-surface-2"
    >
      <PlayerAvatar
        name={g.playerName}
        team={meta.team}
        playerId={g.playerId}
        size="sm"
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[10.5px] font-semibold uppercase tracking-wide",
            tone === "positive" ? "text-positive" : "text-negative",
          )}
        >
          {label}
        </span>
        <span className="block line-clamp-1 text-[13px] font-semibold leading-tight text-ink">
          {g.playerName}
        </span>
        <span className="block line-clamp-1 text-meta leading-tight text-secondary">
          {meta.position ?? "-"}
          {meta.team ? ` · ${meta.team}` : ""}
          {meta.age != null ? ` · ${meta.age}y` : ""}
          {" · pick "}
          {g.pickNo}
          {" · "}
          {/* WHO WAS ON THE CLOCK, not who holds that seat today. `GradedPick`
            already resolves the pick to a principal via `ownerAt`; printing
            `rosterName(h, rosterId)` instead credited a departed manager's picks to
            their successor, and disagreed with /lineage about the same pick. */}
          {(() => {
            const pr = principals.byOwnerId.get(g.ownerId);
            return pr
              ? pr.teamName || pr.displayName
              : rosterName(h, g.rosterId);
          })()}
        </span>
        <span className="mt-0.5 block text-meta leading-snug text-muted">
          {detail}
        </span>
      </span>
      <ChevronRight
        size={13}
        className="mt-1 shrink-0 text-faint"
        aria-hidden="true"
      />
    </Link>
  );
}
function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}
/**
 * One season's report card. No letter grade (see the file header on
 * lib/metrics/draftGrades.ts for why) - the headline is the actual capture rate, the
 * same number "The Scout" shows on Superlatives, just scoped to one draft class.
 */
export function DraftReportCard({ h, principals, grade }) {
  const bestDetail =
    grade.best && grade.best.regret === 0
      ? "Took the best player left on the board."
      : grade.best
        ? `Left ${grade.best.bestAvailableName} (${fmtValue(grade.best.bestAvailable)}) on the board.`
        : "";
  // Rookie seasons get the slot-surplus miss (the actual "reach"); the startup draft
  // substitutes its weakest pool-capture pick instead - see lib/metrics/draftGrades.ts.
  const miss = grade.isStartup ? grade.worst : grade.bust;
  const missLabel = grade.isStartup
    ? "Weakest pick against the board"
    : "Worst slot-surplus miss";
  const missDetail = grade.isStartup
    ? miss
      ? `Left ${miss.bestAvailableName} (${fmtValue(miss.bestAvailable)}) on the board.`
      : ""
    : miss
      ? `Taken pick ${miss.pickNo}, finished as the ${ordinal(miss.valueRank)} best player in the class.`
      : "";
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-baseline gap-1.5">
          <span className="font-display text-[20px] font-semibold leading-none text-ink">
            {grade.season}
          </span>
          {grade.isStartup && <Tag tone="info">startup draft</Tag>}
        </span>
        <Link
          href={`/drafts/${grade.season}`}
          aria-label={`Open the ${grade.season} draft board`}
          className="-my-2 -mr-1 inline-flex min-h-11 items-center gap-0.5 px-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
        >
          board
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-0.5 figure text-meta text-faint">
        {grade.rounds} rd · {grade.teams} tm · {grade.gradedPicks} of{" "}
        {grade.totalPicks} picks graded
      </p>

      <div className="mt-2 flex items-end justify-between gap-2 rounded-[--radius-sm] border border-border bg-surface px-3 py-2">
        <span>
          <span className="block text-[10.5px] uppercase tracking-wide text-secondary">
            value captured against the board
          </span>
          <span className="figure text-2xl font-semibold text-accent-text">
            {pct(grade.captureRate)}
          </span>
        </span>
        {grade.regret < 0 && (
          <span className="text-right text-meta leading-snug text-muted">
            {fmtValue(Math.abs(grade.regret))} pts
            <br />
            left on the board
          </span>
        )}
      </div>

      {(grade.best || miss) && (
        <div className="mt-2 space-y-1.5">
          {grade.best && (
            <StandoutRow
              h={h}
              principals={principals}
              label="Best value captured"
              tone="positive"
              g={grade.best}
              detail={bestDetail}
            />
          )}
          {miss && (
            <StandoutRow
              h={h}
              principals={principals}
              label={missLabel}
              tone="negative"
              g={miss}
              detail={missDetail}
            />
          )}
        </div>
      )}

      {grade.isStartup && (
        <p className="mt-1.5 text-[10.5px] leading-snug text-secondary">
          One-off startup draft: graded against the board only. A {grade.rounds}
          -round class is not a fair slot-surplus comparison against a normal
          rookie draft, so that stat is left off this card.
        </p>
      )}
    </Card>
  );
}
