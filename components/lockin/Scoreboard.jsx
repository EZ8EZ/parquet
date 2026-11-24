import Link from "next/link";
import { ChevronRight, Clock } from "lucide-react";
import { Sheet } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { cn } from "@/lib/ui";
import { fmt } from "@/lib/lockin/view";
import { BEAT_NOTE, assumptionLines } from "@/lib/lockin/matchupView";
import { DECIDE_BUFFER_MIN, decideBy } from "@/lib/lockin/time";
import { OpponentBody } from "./Matchup";
import { OppStrip } from "./OppStrip";
import { Countdown } from "./TonightClock";

/** What "rough" means, one tap from the win chance: calibration, what it is not, what it assumes. */
function RoughBody({ desk }) {
  const lines = assumptionLines(desk.winProb);
  return (
    <div className="space-y-3 text-note text-muted">
      <p>
        <span className="font-semibold text-ink">It is rough.</span> Checked against past weeks, the win chance is close to right near 0% and 100% and can be off by up to about 19 points in between.
      </p>
      <p>
        <span className="font-semibold text-ink">It is not the model&apos;s pick.</span> The model&apos;s leans rest on expected points. In backtests on 240 team-weeks, making calls by win chance did not win more matchups than the points lean.
      </p>
      <p>It assumes you follow every one of the model&apos;s calls this week. The win chance beside each call changes that one call and keeps the rest.</p>
      {lines.length > 0 && (
        <ul className="list-disc space-y-1 pl-4">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <p className="text-meta text-secondary">{BEAT_NOTE}</p>
    </div>
  );
}

function Side({ team, banked, sub, right = false, isMe = false }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", right && "items-end text-right")}>
      <TeamAvatar name={team.name} avatarId={team.avatarId} teamLogoUrl={team.teamLogoUrl} size="sm" isMe={isMe} />
      <span className="mt-1 text-meta font-semibold text-muted">{isMe ? "You" : team.name}</span>
      <span className="figure text-score font-bold text-ink">{banked == null ? "—" : fmt(banked)}</span>
      <span className="text-micro text-secondary">{sub}</span>
    </div>
  );
}

/**
 * The scoreboard footer: Tonight in one line when it has nothing to move (the full
 * Tonight section shows instead when it does).
 */
export function TonightFoot({ line, tz, frozenAt = null, nowMs = null, href = "/lockin?tab=tonight" }) {
  if (!line) return null;
  if (line.noGames) {
    return (
      <Link href={href} className="-mx-3.5 -mb-3.5 mt-3 flex min-h-12 items-center gap-2.5 border-t border-border px-3.5 text-note text-muted" data-tonight="none">
        <Clock size={16} aria-hidden="true" className="shrink-0 text-secondary" />
        <span className="flex-1">No games tonight{line.nextDay ? ` · next on ${line.nextDay}` : ""}</span>
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-secondary" />
      </Link>
    );
  }
  const db = line.at ? decideBy(line.at, tz, { nowMs }) : null;
  const when = db ? (db.passed ? `decide now · tips ${db.tipText}` : `by ${db.byClock} · tips ${db.tipText}`) : line.atText;
  return (
    <Link
      href={href}
      aria-label={`Tonight: ${db ? `set by ${db.byClock}, first tip ${db.tipText}` : "first tip time unknown"}, ${line.count} ${line.count === 1 ? "player" : "players"}, all in slots. Open Tonight`}
      className="-mx-3.5 -mb-3.5 mt-3 flex min-h-[52px] items-center gap-2.5 border-t border-border px-3.5 py-2"
      data-tonight="set"
    >
      <Clock size={18} aria-hidden="true" className="shrink-0 text-warn" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-note font-semibold", db?.passed ? "text-warn" : "text-ink")}>
            Tonight <span className="font-normal text-secondary">·</span> {when}
          </span>
          {line.at && <Countdown at={line.at} frozenAt={frozenAt} pill bufferMin={DECIDE_BUFFER_MIN} />}
        </span>
        <span className="mt-0.5 block text-meta text-muted">
          {line.count} {line.count === 1 ? "player" : "players"}, all in slots
        </span>
      </span>
      <span aria-hidden="true" className="flex shrink-0 -space-x-2.5">
        {line.faces.map((f) => (
          <PlayerAvatar key={f.playerId} name={f.name} team={f.team} playerId={f.playerId} size="xs" decorative className="ring-2 ring-surface" />
        ))}
      </span>
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-secondary" />
    </Link>
  );
}

/**
 * Home's scoreboard (direction A): your banked score and theirs either side of the rough
 * win chance (one tap explains "rough"), a tug bar whose soft edge says it is not
 * precise, both projected finals as means only (their range is too narrow to print;
 * it is in the opponent sheet with that caveat), your seven slot tiles and their row
 * (tap it for the opponent), then Tonight in one line. Renders [data-scoreboard], which
 * moves the status-bar scorebug aside on this page.
 */
export function Scoreboard({ v, desk, slots, record = null, footer = null }) {
  const them = v.them;
  const win = v.win;
  const pctNum = win == null ? null : Math.round(win * 100);
  const oppLabel = `${them.name}: ${v.oppSummary || "no slots"}. Show details`;
  return (
    <section aria-label="This week's matchup" data-scoreboard data-matchup={v.state} className="rounded-card bg-surface p-3.5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        <Side team={v.me} banked={v.me.banked} sub={record ? `banked · ${record}` : "banked"} isMe />
        <div className="pt-1 text-center">
          {pctNum != null ? (
            <>
              <p className="figure text-hero font-extrabold leading-none tracking-tight text-ink" data-win-prob>
                {pctNum}
                <span className="text-display font-bold">%</span>
              </p>
              <div className="mt-0.5 flex items-center justify-center gap-1 whitespace-nowrap text-note text-muted">
                <span>to win ·</span>
                <Sheet
                  trigger={<span className="text-secondary underline decoration-dotted underline-offset-4">rough</span>}
                  triggerLabel="Rough: what the win chance is and is not. Show details"
                  triggerClassName="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-accent"
                  title="A rough win chance"
                  subtitle="If you follow the model's calls"
                >
                  <RoughBody desk={desk} />
                </Sheet>
              </div>
            </>
          ) : (
            <p className="pt-2 text-note font-semibold text-muted" data-win-prob="unknown">
              Win chance
              <br />
              unknown
            </p>
          )}
        </div>
        <Side team={them} banked={them.banked} sub={them.record ? `banked · ${them.record}` : "banked"} right />
      </div>

      {pctNum != null && (
        <div role="img" aria-label={`Rough win chance ${pctNum} percent`} className="relative mt-3 h-2 overflow-hidden rounded-full bg-them">
          <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pctNum}%` }} />
          {/* a soft edge: the estimate is rough, so the boundary is not drawn sharp */}
          <span className="absolute inset-y-0 w-8 -translate-x-1/2 bg-gradient-to-r from-accent to-them blur-[3px]" style={{ left: `${pctNum}%` }} />
        </div>
      )}
      <div className="mt-1.5 flex justify-between text-meta text-secondary">
        <span>
          Projected <span className="figure font-bold text-ink">{v.me.range ? Math.round(v.me.range.mean) : "—"}</span>
        </span>
        <span>
          <span className="figure font-bold text-ink">{them.range ? Math.round(them.range.mean) : "—"}</span> projected
        </span>
      </div>

      <div className="mt-3">{slots}</div>

      <Sheet
        trigger={
          <span className="mt-2 block border-t border-border pt-2">
            <span className="mb-1 flex items-center gap-1.5 text-meta">
              <span className="min-w-0 flex-1 font-semibold text-muted">
                {them.name}
                {v.oppSummary && <span className="font-normal text-secondary"> · {v.oppSummary}</span>}
              </span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-accent-text" />
            </span>
            <OppStrip slots={v.oppSlots} />
          </span>
        }
        triggerLabel={oppLabel}
        triggerClassName="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        title={them.name}
        subtitle={[them.ownerName, them.record].filter(Boolean).join(" · ") || null}
        leading={<TeamAvatar name={them.name} avatarId={them.avatarId} teamLogoUrl={them.teamLogoUrl} size="md" />}
      >
        <OpponentBody v={v} desk={desk} />
      </Sheet>
      {footer}
    </section>
  );
}
