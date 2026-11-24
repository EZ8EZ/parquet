import Link from "next/link";
import { AlertTriangle, CalendarDays, ChevronRight } from "lucide-react";
import { Disclosure, EmptyState, List, ListRow, SectionHeader, StatTile, Tabs } from "@/components/ui";
import { isFixtureDesk, loadLockDesk } from "@/lib/lockin/source";
import { compactLive, firstUp, gapLines, groupCards, playerSubtitle, resultLine, shortDate, stateBody, weekGrid } from "@/lib/lockin/view";
import { DeckTrigger, PlayerDeck } from "./PlayerDeck";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Opp } from "./Opp";
import { PlayerPanel } from "./PlayerDetail";
import { SlotCells, SlotLegend } from "./SlotCells";
import { Matchup, NoOpponent } from "./Matchup";
import { WhatIf } from "./WhatIf";
import { LockHistory, LockHistoryLink } from "./LockHistory";
import { matchupView } from "@/lib/lockin/matchupView";
import { slotStateKey } from "@/lib/lockin/view";
import { DecisionHero } from "./DecisionHero";
import { PlayerRow } from "./PlayerRow";
import { WeekGrid } from "./WeekGrid";
import { MethodNote } from "./MethodNote";
import { TonightSection } from "./TonightSection";
import { tonightView } from "@/lib/lockin/tonightView";

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

function FirstUp({ fu, title, tappable = false, className, moreHref = null }) {
  if (!fu) return null;
  const shown = fu.players.slice(0, 4);
  const more = fu.players.length - shown.length;
  return (
    <>
      <SectionHeader className={className} title={title ?? (fu.tonight ? "First up tonight" : `First up ${fu.day} ${shortDate(fu.date)}`)} />
      <List>
        {shown.map((p) => {
          const row = <ListRow as={tappable ? "span" : undefined} chevron={tappable} leading={p.slotLabel ?? "BN"} avatar={<PlayerAvatar name={p.name} team={p.team} playerId={p.playerId} size="sm" decorative />} title={p.name} meta={<Opp team={p.opponent} away={p.away} />} />;
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
        {more > 0 && <li>{moreHref ? <ListRow href={moreHref} title={`${more} more ${fu.tonight ? "tonight" : `on ${fu.day}`}`} meta="Every player and night" /> : <ListRow title={`${more} more ${fu.tonight ? "tonight" : `on ${fu.day}`}`} meta="All on the Players tab" />}</li>}
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
      leading: <PlayerAvatar name={c.name} team={c.team} playerId={c.playerId} size="md" decorative />,
      subtitle: playerSubtitle(c),
      content: <PlayerPanel card={c} today={desk.today} record={desk.leanRecord} methodHref={methodHref} calibration={desk.model?.calibration?.pLaterBeatsIfPlays} winProb={desk.winProb ?? null} />,
    }));
}

/**
 * The lock-or-hold board for one roster. mode "compact" is Home's week section: the
 * seven slots, the most urgent decision in full, the other live ones as rows. mode
 * "full" is /lockin: slots, three figures, then Decide now / Nights / Players tabs.
 * Every player opens in one sheet with previous / next.
 */
export async function LockDeskBoard({ rosterId, mode = "full", players = null, open = null, replay = null, fullHref = "/lockin", desk: given = null, methodOpen = false, me = null, them = null, tab = null }) {
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
          <EmptyState icon={<CalendarDays size={28} aria-hidden="true" />} title={{ offseason: "No lock-in week", no_matchup: "No matchup this week", unavailable: "Lock-in data unavailable" }[desk.status] ?? "Nothing to show"}>
            {stateBody(desk)}
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
  const winProb = desk.winProb ?? null;

  // Head-to-head: the matchup (win chance, both ranges, both slot strips) replaces the
  // bare slot cells when there is an opponent; without one, one quiet line and the slots.
  const mv = matchupView(desk, { me, them });
  const slotsBlock =
    mv && mv.state !== "none" ? (
      <Matchup v={mv} desk={desk} mySlots={<SlotCells slots={desk.slots} legend={false} />} legend={<SlotLegend keys={[...desk.slots.map(slotStateKey), ...mv.oppSlots.map((s) => s.key)]} className="" />} />
    ) : (
      <>
        {mv?.state === "none" && <NoOpponent />}
        <SlotCells slots={desk.slots} />
      </>
    );

  // Tonight: listed starts as deadlines (lib/lockin/tonightView.js). The countdown runs
  // from the board's own moment for the fixture and recorded replays.
  const tv = tonightView(desk);
  const tonightGames = tv?.status === "games";
  const frozenAt = isFixtureDesk(desk) || replay ? desk.generatedAt : null;
  const tonight = tv ? <TonightSection desk={desk} compact fullHref={fullHref} frozenAt={frozenAt} /> : null;
  const tonightFull = tv ? <TonightSection desk={desk} fullHref={fullHref} frozenAt={frozenAt} inTab /> : null;

  if (compact) {
    const cl = compactLive(groups.live);
    // Home keeps hazard rows (a listed-out or last-game warning); other live decisions
    // are counted on the link to /lockin, where each has its card.
    const rows = [...cl.before, ...cl.after].filter((c) => c.hazards.length > 0);
    const moreLive = cl.featured?.stopping ? cl.before.length + cl.after.length - rows.length : 0;
    return (
      <PlayerDeck panels={panels} initialOpen={open}>
        <section aria-label="Lock-in" {...common}>
          <Gaps desk={desk} />
          {slotsBlock}
          {tonight}
          <WhatIf desk={desk} compact moreHref={`${fullHref}${fullHref.includes("?") ? "&" : "?"}tab=options`} />
          {cl.featured ? (
            <>
              <SectionHeader title={groups.live.length > 1 ? `Decide now · ${groups.live.length}` : "Decide now"} />
              <div className="space-y-2">
                {cl.featured.stopping ? <DecisionHero card={cl.featured} winProb={winProb} compact /> : null}
                {(cl.featured.stopping ? rows : groups.live).length > 0 && <List>{(cl.featured.stopping ? rows : groups.live).map((c) => <PlayerRow key={c.playerId} card={c} />)}</List>}
              </div>
            </>
          ) : tonightGames ? null : (
            <FirstUp fu={fu} tappable moreHref={fullHref} />
          )}
          <LockHistoryLink history={desk.history} href={`${fullHref.split("?")[0]}#lock-history`} />
          <Link href={fullHref} className="mt-3 flex min-h-11 items-center justify-between rounded-card bg-surface px-4 text-note font-semibold text-accent-text">
            <span>
              All players and nights
              {moreLive > 0 && <span className="font-normal text-muted"> · {moreLive} more {moreLive === 1 ? "decision" : "decisions"}</span>}
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </PlayerDeck>
    );
  }

  const decide = (
    <div className="space-y-3 pt-3">
      <h2 className="sr-only">Decide now</h2>
      {hazardOnly.length > 0 && <List>{hazardOnly.map((c) => <PlayerRow key={c.playerId} card={c} />)}</List>}
      {heroes.map((c) => (
        <DecisionHero key={c.playerId} card={c} winProb={winProb} />
      ))}
      {!groups.live.length && (fu ? <FirstUp fu={fu} tappable className="mt-2" /> : <EmptyState icon={<CalendarDays size={28} aria-hidden="true" />} title="Nothing to decide">No score is waiting on a lock-or-hold call.</EmptyState>)}
    </div>
  );
  const nights = (
    <div className="pt-3">
      <h2 className="sr-only">Nights</h2>
      {summary && <p className="mb-2 text-note text-muted">{summary.text}.</p>}
      <WeekGrid grid={weekGrid(desk)} caption="Every player's games this week" triggers />
    </div>
  );
  const everyone = (
    <div className="pt-3">
      <h2 className="sr-only">Players</h2>
      <List>{[...groups.live, ...groups.lineup, ...groups.quiet].map((c) => <PlayerRow key={c.playerId} card={c} />)}</List>
      {desk.excluded.length > 0 && <p className="mt-2 text-meta text-secondary">Not counted: {desk.excluded.map((e) => `${e.name} (${e.reason === "taxi" ? "taxi" : "IR"})`).join(", ")}.</p>}
    </div>
  );

  return (
    <PlayerDeck panels={panels} initialOpen={open}>
      <section aria-label="Lock-in" {...common}>
        <Gaps desk={desk} />
        {slotsBlock}
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
          defaultId={tab === "options" && desk.whatIf ? "options" : tv?.next ? "tonight" : "decide"}
          items={[
            ...(tv ? [{ id: "tonight", label: "Tonight", count: tv.toDecide || undefined, content: <div className="pt-1">{tonightFull}</div> }] : []),
            { id: "decide", label: tv ? "Decide" : "Decide now", count: groups.live.length, content: decide },
            ...(desk.whatIf ? [{ id: "options", label: "Win %", content: <div className="pt-1"><WhatIf desk={desk} /></div> }] : []),
            { id: "nights", label: "Nights", content: nights },
            { id: "players", label: "Players", count: desk.cards.length, content: everyone },
          ]}
        />
        <LockHistory history={desk.history} season={desk.season} />
        <MethodNote model={desk.model} record={desk.leanRecord} open={methodOpen} />
      </section>
    </PlayerDeck>
  );
}
