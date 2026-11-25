import { AlertTriangle, CalendarDays } from "lucide-react";
import { Disclosure, EmptyState, List, ListRow, SectionHeader, StatTile, Tabs } from "@/components/ui";
import { isFixtureDesk, loadLockDesk } from "@/lib/lockin/source";
import { firstUp, fmt, gapLines, groupCards, playerSubtitle, resultLine, shortDate, stateBody, weekGrid } from "@/lib/lockin/view";
import { DeckTrigger, PlayerDeck } from "./PlayerDeck";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Opp } from "./Opp";
import { PlayerPanel } from "./PlayerDetail";
import { SlotCells } from "./SlotCells";
import { NoOpponent } from "./Matchup";
import { WinTable } from "./WinTable";
import { LockHistory } from "./LockHistory";
import { matchupView } from "@/lib/lockin/matchupView";
import { slotTiles } from "@/lib/lockin/view";
import { DecisionHero } from "./DecisionHero";
import { PlayerRow } from "./PlayerRow";
import { WeekGrid } from "./WeekGrid";
import { MethodNote } from "./MethodNote";
import { TonightSection } from "./TonightSection";
import { tonightView } from "@/lib/lockin/tonightView";
import { callRows, historyView, tonightLine } from "@/lib/lockin/matchupView";
import { displayTz } from "@/lib/lockin/time";
import { Scoreboard, TonightFoot } from "./Scoreboard";
import { withChoices } from "@/lib/lockin/assumeView";
import { CallList } from "./CallList";

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
  const tips = new Map((desk.tonight?.players || []).filter((p) => p.tip).map((p) => [p.playerId, p.tip]));
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
      content: <PlayerPanel card={c} today={desk.today} record={desk.leanRecord} methodHref={methodHref} winProb={desk.winProb ?? null} tz={displayTz(desk)} nowMs={Date.parse(desk.generatedAt)} tipAt={tips.get(c.playerId) ?? null} />,
    }));
}

/**
 * The lock-or-hold board for one roster. mode "compact" is Home's week section: the
 * seven slots, the most urgent decision in full, the other live ones as rows. mode
 * "full" is /lockin: slots, three figures, then Tonight / Calls to make / Win % / Nights / Players tabs.
 * Every player opens in one sheet with previous / next.
 */
export async function LockDeskBoard({ rosterId, mode = "full", players = null, open = null, replay = null, fullHref = "/lockin", desk: given = null, methodOpen = false, me = null, them = null, tab = null, record = null }) {
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

  // Head-to-head: the scoreboard when there is an opponent; without one, one quiet line and the slots.
  const mv = matchupView(desk, { me, them });

  // Tonight: listed starts as deadlines (lib/lockin/tonightView.js). The countdown runs
  // from the board's own moment for the fixture and recorded replays.
  const tv = tonightView(desk);
  const tonightGames = tv?.status === "games";
  const frozenAt = isFixtureDesk(desk) || replay ? desk.generatedAt : null;
  const tonight = tv ? <TonightSection desk={desk} compact fullHref={fullHref} frozenAt={frozenAt} /> : null;
  const tonightFull = tv ? <TonightSection desk={desk} fullHref={fullHref} frozenAt={frozenAt} inTab /> : null;

  if (compact) {
    // Home (direction A): the scoreboard with Tonight in its footer, then Your calls.
    const rows = callRows(desk);
    const tz = displayTz(desk);
    const line = tonightLine(desk);
    const sep = fullHref.includes("?") ? "&" : "?";
    const foot = line ? <TonightFoot line={line} tz={tz} frozenAt={frozenAt} nowMs={frozenAt ? Date.parse(frozenAt) : Date.parse(desk.generatedAt)} href={`${fullHref}${sep}tab=tonight`} /> : null;
    const tiles = <SlotCells tiles={withChoices(slotTiles(desk), desk, "mine")} />;
    const hv = historyView(desk.history);
    const anyConditional = rows.some((r) => r.conditional);
    return (
      <PlayerDeck panels={panels} initialOpen={open}>
        <section aria-label="Lock-in" {...common}>
          <Gaps desk={desk} />
          {mv && mv.state !== "none" ? (
            <Scoreboard v={mv} desk={desk} slots={tiles} record={record} footer={foot} />
          ) : (
            <div className="rounded-card bg-surface p-3.5">
              {mv?.state === "none" && <NoOpponent />}
              {tiles}
              {foot}
            </div>
          )}
          {!line && tonight}
          {rows.length > 0 ? (
            <section aria-labelledby="calls-title">
              <SectionHeader id="calls-title" title={`Your calls · ${rows.length}`} className="mt-5" href={desk.whatIf ? `${fullHref}${sep}tab=options` : null} cta={desk.whatIf ? "Win % table" : null} />
              <p className="-mt-1 mb-2.5 text-meta text-secondary">Leans rest on expected points{anyConditional ? " · if not already locked" : ""}</p>
              <CallList rows={rows} />
            </section>
          ) : tonightGames ? null : (
            <FirstUp fu={fu} tappable moreHref={fullHref} className="mt-5" />
          )}
          <List className="mt-3">
            {hv?.ok && (
              <li>
                <ListRow href={`${fullHref}${sep}tab=history`} title="Lock history" meta={`${fmt(hv.perWeek)} pts a week between banked and the best game · ${hv.nText}`} chevron />
              </li>
            )}
            <li>
              <ListRow href={fullHref} title="Every night and player" meta={desk.slotPressure?.summary ? `${desk.slotPressure.summary.playersStillToPlay} players still to play, ${desk.slotPressure.summary.gamesRemaining} games left` : null} chevron />
            </li>
          </List>
        </section>
      </PlayerDeck>
    );
  }

  // The lock board: the same scoreboard as Home (no Tonight footer: Tonight is a tab),
  // then Tonight · Calls · Win % · Week · History. Calls holds the decisions and the bench
  // moves the hero's win chance assumes (whatIf.plan "then_start"), in decide-by order.
  const allRows = callRows(desk);
  const rowsById = new Map(allRows.filter((r) => r.kind !== "start").map((r) => [r.playerId, r]));
  const starts = allRows.filter((r) => r.kind === "start");
  const heroById = new Map(heroes.map((c) => [c.playerId, c]));
  const ordered = allRows.filter((r) => r.kind === "start" || heroById.has(r.playerId));
  const calls = (
    <div className="space-y-3 pt-3">
      <h2 className="sr-only">Calls to make</h2>
      {hazardOnly.length > 0 && <List>{hazardOnly.map((c) => <PlayerRow key={c.playerId} card={c} />)}</List>}
      {ordered.map((r) =>
        r.kind === "start" ? (
          <CallList key={`start-${r.playerId}`} rows={[r]} />
        ) : (
          <DecisionHero key={r.playerId} card={heroById.get(r.playerId)} row={rowsById.get(r.playerId)} winProb={winProb} />
        ),
      )}
      {!groups.live.length && !starts.length && (fu ? <FirstUp fu={fu} tappable className="mt-2" /> : <EmptyState icon={<CalendarDays size={28} aria-hidden="true" />} title="Nothing to decide">No score is waiting on a lock-or-hold call.</EmptyState>)}
    </div>
  );
  const week = (
    <div className="pt-3">
      <h2 className="sr-only">Week</h2>
      {summary && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          <StatTile size="sm" label="Open slots" value={summary.openMin === summary.openMax ? summary.openMax : `${summary.openMin}-${summary.openMax}`} sub={summary.openMin === summary.openMax ? null : `${summary.openMax - summary.openMin} unknown`} />
          <StatTile size="sm" label="To play" value={summary.playersStillToPlay} sub="players" />
          <StatTile size="sm" label="Games left" value={summary.gamesRemaining} />
        </div>
      )}
      <WeekGrid grid={weekGrid(desk)} caption="Every player's games this week" triggers />
      {desk.excluded.length > 0 && <p className="mt-2 text-meta text-secondary">Not counted: {desk.excluded.map((e) => `${e.name} (${e.reason === "taxi" ? "taxi" : "IR"})`).join(", ")}.</p>}
    </div>
  );
  const ids = ["tonight", "calls", "options", "week", "history"];
  const wanted = tab === "decide" ? "calls" : tab === "nights" ? "week" : tab;
  const start = ids.includes(wanted) && (wanted !== "tonight" || tv) && (wanted !== "options" || desk.whatIf) ? wanted : tv?.next ? "tonight" : "calls";
  const board =
    mv && mv.state !== "none" ? (
      <Scoreboard v={mv} desk={desk} slots={<SlotCells tiles={withChoices(slotTiles(desk), desk, "mine")} />} />
    ) : (
      <div className="rounded-card bg-surface p-3.5">
        {mv?.state === "none" && <NoOpponent />}
        <SlotCells tiles={withChoices(slotTiles(desk), desk, "mine")} />
      </div>
    );

  return (
    <PlayerDeck panels={panels} initialOpen={open}>
      <section aria-label="Lock-in" {...common}>
        <Gaps desk={desk} />
        {board}
        <Tabs
          className="mt-4"
          label="Lock-in views"
          defaultId={start}
          items={[
            ...(tv ? [{ id: "tonight", label: "Tonight", count: tv.toDecide || undefined, content: <div className="pt-1">{tonightFull}</div> }] : []),
            { id: "calls", label: "Calls", count: groups.live.length + starts.length, content: calls },
            ...(desk.whatIf ? [{ id: "options", label: "Win %", content: <WinTable desk={desk} /> }] : []),
            { id: "week", label: "Week", content: week },
            { id: "history", label: "History", content: <div className="pt-1"><LockHistory history={desk.history} season={desk.season} inTab /></div> },
          ]}
        />
        <MethodNote model={desk.model} record={desk.leanRecord} open={methodOpen} />
      </section>
    </PlayerDeck>
  );
}
