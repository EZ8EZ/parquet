import Link from "next/link";
import { AlertTriangle, CalendarDays, ChevronRight } from "lucide-react";
import { Disclosure, EmptyState, List, ListRow, SectionHeader, StatTile, Tabs } from "@/components/ui";
import { loadLockDesk } from "@/lib/lockin/source";
import { compactLive, firstUp, gapLines, groupCards, playerSubtitle, resultLine, shortDate, weekGrid } from "@/lib/lockin/view";
import { DeckTrigger, PlayerDeck } from "./PlayerDeck";
import { PlayerPanel } from "./PlayerDetail";
import { SlotCells } from "./SlotCells";
import { DecisionHero } from "./DecisionHero";
import { PlayerRow } from "./PlayerRow";
import { WeekGrid } from "./WeekGrid";
import { MethodNote } from "./MethodNote";

function Gaps({ desk }) {
  const lines = gapLines(desk);
  if (!lines.length) return null;
  return (
    <div role="status" className="mb-3 rounded-control bg-warn-wash px-3 py-2 text-note text-ink">
      <p className="flex items-center gap-2">
        <AlertTriangle size={16} aria-hidden="true" className="shrink-0 text-warn" />
        Incomplete Sleeper data; what loaded is shown.
      </p>
      <Disclosure summary="What is missing" bodyClassName="bg-transparent p-0">
        <ul className="list-disc pl-4">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Disclosure>
    </div>
  );
}

function FirstUp({ fu, title, tappable = false, className }) {
  if (!fu) return null;
  const shown = fu.players.slice(0, 4);
  const more = fu.players.length - shown.length;
  return (
    <>
      <SectionHeader className={className} title={title ?? (fu.tonight ? "First up tonight" : `First up ${fu.day} ${shortDate(fu.date)}`)} />
      <List>
        {shown.map((p) => {
          const row = <ListRow as={tappable ? "span" : undefined} chevron={tappable} leading={p.slotLabel ?? "BN"} title={p.name} meta={`${p.away ? "at" : "vs"} ${p.opponent ?? "unknown"}`} />;
          return tappable ? (
            <li key={p.playerId}>
              <DeckTrigger playerId={p.playerId} label={`${p.name}. Show details`}>
                {row}
              </DeckTrigger>
            </li>
          ) : (
            <li key={p.playerId}>{row}</li>
          );
        })}
        {more > 0 && <li><ListRow title={`${more} more on ${fu.day}`} meta="All on the Players tab" /></li>}
      </List>
    </>
  );
}

function BetweenWeeks({ desk }) {
  const bw = desk.betweenWeeks;
  const line = resultLine(bw);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label={`Week ${desk.week}`} value={bw?.result ? bw.result.outcome : "Final"} sub={line ? line.replace(/^Week \d+: \w+ /, "") : "result not loaded"} />
        <StatTile label={`Week ${desk.nextWeek.week} starts`} value={shortDate(desk.nextWeek.start)} />
      </div>
      {bw?.firstGames && <FirstUp fu={{ ...bw.firstGames, tonight: false, players: bw.firstGames.players.map((p) => ({ ...p, slotLabel: null })) }} title={`First up ${bw.firstGames.day} ${shortDate(bw.firstGames.date)}`} />}
    </div>
  );
}

function panelsFor(desk, methodHref) {
  const byId = new Map(desk.cards.map((c) => [c.playerId, c]));
  const order = desk.slotPressure?.rowOrder ?? desk.cards.map((c) => c.playerId);
  const slotFirst = [...desk.slots.map((s) => s.playerId).filter(Boolean), ...order];
  return [...new Set(slotFirst)]
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((c) => ({
      id: c.playerId,
      title: c.name,
      subtitle: playerSubtitle(c),
      content: <PlayerPanel card={c} today={desk.today} record={desk.leanRecord} methodHref={methodHref} />,
    }));
}

/**
 * The lock-or-hold board for one roster. mode "compact" is Home's week section: the
 * seven slots, the most urgent decision in full, the other live ones as rows. mode
 * "full" is /lockin: slots, three figures, then Decide now / Nights / Players tabs.
 * Every player opens in one sheet with previous / next.
 */
export async function LockDeskBoard({ rosterId, mode = "full", players = null, open = null, replay = null, fullHref = "/lockin", desk: given = null, methodOpen = false }) {
  const desk = given ?? (await loadLockDesk({ rosterId, players, replay }));
  const compact = mode === "compact";
  const methodHref = `${fullHref}${fullHref.includes("?") ? "&" : "?"}method=open#lockin-method`;
  const common = { "data-lockin-board": mode, "data-status": desk.status, "data-requests": `${desk.requests.count}/${desk.requests.budget}`, "data-engine-ms": desk.requests.wallMs ?? "" };

  if (desk.status !== "in_season") {
    return (
      <section aria-label="Lock-in" {...common}>
        <Gaps desk={desk} />
        {desk.status === "between_weeks" && desk.nextWeek ? (
          <BetweenWeeks desk={desk} />
        ) : (
          <EmptyState icon={CalendarDays} title={{ offseason: "No lock-in week", no_matchup: "No matchup this week", unavailable: "Lock-in data unavailable" }[desk.status] ?? "Nothing to show"}>
            {desk.message}
          </EmptyState>
        )}
      </section>
    );
  }

  const groups = groupCards(desk);
  const panels = panelsFor(desk, methodHref);
  const summary = desk.slotPressure?.summary;
  const fu = firstUp(desk);
  const heroes = groups.live.filter((c) => c.stopping);
  const hazardOnly = groups.live.filter((c) => !c.stopping);

  if (compact) {
    const cl = compactLive(groups.live);
    const rows = [...cl.before, ...cl.after];
    return (
      <PlayerDeck panels={panels} initialOpen={open}>
        <section aria-label="Lock-in" {...common}>
          <Gaps desk={desk} />
          <SlotCells slots={desk.slots} />
          {cl.featured ? (
            <>
              <SectionHeader title={groups.live.length > 1 ? `Decide now · ${groups.live.length}` : "Decide now"} />
              <div className="space-y-2">
                {cl.featured.stopping ? <DecisionHero card={cl.featured} /> : null}
                {(cl.featured.stopping ? rows : groups.live).length > 0 && <List>{(cl.featured.stopping ? rows : groups.live).map((c) => <PlayerRow key={c.playerId} card={c} />)}</List>}
              </div>
            </>
          ) : (
            <FirstUp fu={fu} tappable />
          )}
          <Link href={fullHref} className="mt-3 flex min-h-11 items-center justify-between rounded-card bg-surface px-4 text-note font-semibold text-accent-text">
            All players and nights
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </PlayerDeck>
    );
  }

  const decide = (
    <div className="space-y-3 pt-3">
      {hazardOnly.length > 0 && <List>{hazardOnly.map((c) => <PlayerRow key={c.playerId} card={c} />)}</List>}
      {heroes.map((c) => (
        <DecisionHero key={c.playerId} card={c} />
      ))}
      {!groups.live.length && (fu ? <FirstUp fu={fu} tappable className="mt-2" /> : <EmptyState icon={CalendarDays} title="Nothing to decide">No score is waiting on a lock-or-hold call.</EmptyState>)}
    </div>
  );
  const nights = (
    <div className="pt-3">
      {summary && <p className="mb-2 text-note text-muted">{summary.text}.</p>}
      <WeekGrid grid={weekGrid(desk)} caption="Every player's games this week" triggers />
    </div>
  );
  const everyone = (
    <div className="pt-3">
      <List>{[...groups.live, ...groups.lineup, ...groups.quiet].map((c) => <PlayerRow key={c.playerId} card={c} />)}</List>
      {desk.excluded.length > 0 && <p className="mt-2 text-meta text-secondary">Not counted: {desk.excluded.map((e) => `${e.name} (${e.reason === "taxi" ? "taxi" : "IR"})`).join(", ")}.</p>}
    </div>
  );

  return (
    <PlayerDeck panels={panels} initialOpen={open}>
      <section aria-label="Lock-in" {...common}>
        <Gaps desk={desk} />
        <SlotCells slots={desk.slots} />
        {summary && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatTile size="sm" label="Open slots" value={summary.openMin === summary.openMax ? summary.openMax : `${summary.openMin}-${summary.openMax}`} sub={summary.openMin === summary.openMax ? null : `${summary.openMax - summary.openMin} unknown`} />
            <StatTile size="sm" label="To play" value={summary.playersStillToPlay} sub="players" />
            <StatTile size="sm" label="Games left" value={summary.gamesRemaining} />
          </div>
        )}
        <Tabs
          className="mt-4"
          label="Lock-in views"
          items={[
            { id: "decide", label: "Decide now", count: groups.live.length, content: decide },
            { id: "nights", label: "Nights", content: nights },
            { id: "players", label: "Players", count: desk.cards.length, content: everyone },
          ]}
        />
        <MethodNote model={desk.model} record={desk.leanRecord} open={methodOpen} />
      </section>
    </PlayerDeck>
  );
}
