import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card, Chip, Disclosure, ListRow, StatTile } from "@/components/ui";
import { ordinal, rosterName } from "@/lib/derive/describe";
import { fmtValue } from "@/lib/ui";
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
function StandoutRow({ h, principals, label, g, detail }) {
  const meta = playerMeta(h, g);
  // WHO WAS ON THE CLOCK, not who holds that seat today: `GradedPick` resolves the
  // pick to a principal via `ownerAt`, so a departed manager's pick stays theirs.
  const pr = principals.byOwnerId.get(g.ownerId);
  const by = pr ? pr.teamName || pr.displayName : rosterName(h, g.rosterId);
  return (
    <li>
      <ListRow
        href={boardHref(g.season, g.pickNo)}
        avatar={<PlayerAvatar name={g.playerName} team={meta.team} playerId={g.playerId} size="sm" />}
        title={g.playerName}
        meta={
          <>
            <span className="block font-medium text-muted">{label}</span>
            {[meta.position, meta.team, meta.age != null ? `${meta.age}y` : null].filter(Boolean).join(" · ")}
            {` · pick ${g.pickNo} · ${by}`}
            {detail && <span className="block">{detail}</span>}
          </>
        }
      />
    </li>
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
    <Card pad="none" className="overflow-hidden">
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lede font-semibold text-ink">
            <span className="figure">{grade.season}</span>
            {grade.isStartup && (
              <Chip size="sm" tone="info">
                startup draft
              </Chip>
            )}
          </h2>
          <Link
            href={`/drafts/${grade.season}`}
            aria-label={`Open the ${grade.season} draft board`}
            className="-mr-2 inline-flex min-h-11 items-center gap-0.5 px-2 text-note font-semibold text-accent-text"
          >
            Board
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <StatTile
            className="bg-surface-2"
            label="Value captured"
            value={pct(grade.captureRate)}
            sub="against the board"
            tone="accent"
          />
          <StatTile
            className="bg-surface-2"
            label="Left on the board"
            value={grade.regret < 0 ? fmtValue(Math.abs(grade.regret)) : "0"}
            sub="pts"
          />
        </div>
        <p className="mt-2 figure text-meta text-secondary">
          {grade.rounds} rounds · {grade.teams} teams · {grade.gradedPicks} of {grade.totalPicks} picks graded
        </p>
      </div>
      {(grade.best || miss) && (
        <ul className="divide-y divide-border border-t border-border">
          {grade.best && (
            <StandoutRow h={h} principals={principals} label="Best value captured" g={grade.best} detail={bestDetail} />
          )}
          {miss && <StandoutRow h={h} principals={principals} label={missLabel} g={miss} detail={missDetail} />}
        </ul>
      )}
      {grade.isStartup && (
        <Disclosure className="px-4" summary="Why one stat is left off">
          One-off startup draft: graded against the board only. A {grade.rounds}-round class is not a fair
          slot-surplus comparison against a normal rookie draft.
        </Disclosure>
      )}
    </Card>
  );
}
