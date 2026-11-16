import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { loadLockDesk, isFixtureDesk } from "@/lib/lockin/source";
import { compactLive, easternStamp, gapLines, groupCards, shortDate, weekGrid } from "@/lib/lockin/view";
import { WeekStrip } from "./WeekStrip";
import { SlotCells } from "./SlotCells";
import { LiveRow } from "./LiveRow";
import { HashOpener } from "./HashOpener";
import { WeekGrid } from "./WeekGrid";
import { DecisionCard, QuietCard } from "./DecisionCard";
import { MethodNote } from "./MethodNote";

function H2({ children, id }) {
  return (
    <h2 id={id} className="mb-1.5 mt-5 text-note font-semibold uppercase tracking-[0.16em] text-muted">
      {children}
    </h2>
  );
}

function Gaps({ desk }) {
  const lines = gapLines(desk);
  if (!lines.length) return null;
  return (
    <div role="status" className="mb-3 rounded-md border border-[var(--color-warn)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]">
      <p>Built on incomplete Sleeper data; what loaded is shown.</p>
      <ul className="mt-1 list-disc pl-4 text-meta text-muted">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function StateMessage({ desk }) {
  const title = { between_weeks: "Between weeks", offseason: "No lock-in week", no_matchup: "No matchup this week", unavailable: "Lock-in data unavailable" }[desk.status] || "Nothing to show";
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-4">
      <p className="font-display text-lede font-semibold text-ink">{title}</p>
      <p className="mt-1 text-body text-muted">{desk.message}</p>
    </div>
  );
}

/**
 * The lock-or-hold board for one roster. mode "full" is the /lockin page; "compact" is
 * the top of Home: the week strip, the remaining nights and the live decisions.
 * `players`: the corpus's players Map when the caller holds it. `open`: a player id
 * whose charts start expanded. `replay`: development-only recorded moment.
 */
export async function LockDeskBoard({ rosterId, mode = "full", players = null, open = null, replay = null, fullHref = "/lockin", desk: given = null, showHeader = true }) {
  const desk = given ?? (await loadLockDesk({ rosterId, players, replay }));
  const compact = mode === "compact";
  const fixture = isFixtureDesk(desk);
  const window = desk.dateWindow ? `${shortDate(desk.dateWindow.start)}-${shortDate(desk.dateWindow.end).replace(/^\w+ /, "")}` : null;
  const stamp = easternStamp(desk.generatedAt);
  const methodHref = compact ? `${fullHref}#lockin-method` : "#lockin-method";

  const header = !showHeader ? null : (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p className="text-meta text-muted">
        {desk.week != null ? <span className="font-semibold text-ink">Week {desk.week}</span> : null}
        {window ? ` · ${window}` : ""}
        {stamp ? ` · as of ${stamp}` : ""}
      </p>
      {fixture && <span className="rounded-full border border-border bg-elevated px-2 py-0.5 text-micro text-muted">Sample week, invented players</span>}
    </div>
  );

  if (desk.status !== "in_season") {
    return (
      <section aria-label="Lock-in" data-lockin-board={mode} data-status={desk.status} data-requests={`${desk.requests.count}/${desk.requests.budget}`} data-engine-ms={desk.requests.wallMs ?? ""}>
        {header}
        <div className="mt-2">
          <Gaps desk={desk} />
          <StateMessage desk={desk} />
        </div>
      </section>
    );
  }

  const groups = groupCards(desk);
  const grid = weekGrid(desk, { compact });
  const summary = desk.slotPressure?.summary;
  const card = (c, Comp) => <Comp key={c.playerId} card={c} record={desk.leanRecord} today={desk.today} open={open === c.playerId} methodHref={methodHref} />;
  const cl = compactLive(groups.live);
  const rows = (list) =>
    list.length ? (
      <ul className="divide-y divide-border rounded-[var(--radius)] border border-border bg-surface">
        {list.map((c) => (
          <LiveRow key={c.playerId} card={c} href={`${fullHref}?open=${c.playerId}#lk-${c.playerId}`} />
        ))}
      </ul>
    ) : null;

  return (
    <section aria-label="Lock-in" data-lockin-board={mode} data-status={desk.status} data-requests={`${desk.requests.count}/${desk.requests.budget}`} data-engine-ms={desk.requests.wallMs ?? ""}>
      {header}
      <div className="mt-2">
        <Gaps desk={desk} />
      </div>

      {compact ? (
        <SlotCells slots={desk.slots} />
      ) : (
        <>
          <H2 id="lk-slots">Your seven slots</H2>
          <WeekStrip slots={desk.slots} summary={summary} />
          <HashOpener />
        </>
      )}

      <H2 id="lk-live">{groups.live.length ? `Live now: ${groups.live.length}` : "Live now"}</H2>
      {groups.live.length ? (
        <div className="space-y-3">
          {compact ? (
            <>
              {rows(cl.before)}
              {card(cl.featured, DecisionCard)}
              {rows(cl.after)}
            </>
          ) : (
            groups.live.map((c) => card(c, DecisionCard))
          )}
        </div>
      ) : (
        <p className="rounded-[var(--radius)] border border-border bg-surface p-3 text-body text-muted">No score is waiting on a lock-or-hold call right now.</p>
      )}

      <H2 id="lk-grid">{compact ? "Nights left" : "Who plays when"}</H2>
      {summary && <p className="mb-2 text-meta text-ink">{summary.text}.</p>}
      <WeekGrid grid={grid} caption={compact ? "Remaining nights for players still to play" : "Every player's games this week"} />

      {compact ? (
        <Link href={fullHref} className="mt-4 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-accent-text">
          Every player, charts and method
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      ) : (
        <>
          {groups.lineup.length > 0 && (
            <>
              <H2 id="lk-lineup">Lineup calls: {groups.lineup.length}</H2>
              <div className="divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border bg-surface">{groups.lineup.map((c) => card(c, QuietCard))}</div>
            </>
          )}
          {groups.quiet.length > 0 && (
            <>
              <H2 id="lk-quiet">Nothing to decide: {groups.quiet.length}</H2>
              <div className="divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border bg-surface">{groups.quiet.map((c) => card(c, QuietCard))}</div>
            </>
          )}
          {desk.excluded.length > 0 && (
            <p className="mt-3 text-meta text-muted">
              Not counted: {desk.excluded.map((e) => `${e.name} (${e.reason === "taxi" ? "taxi" : "IR"})`).join(", ")}.
            </p>
          )}
          <MethodNote model={desk.model} record={desk.leanRecord} />
        </>
      )}
    </section>
  );
}
