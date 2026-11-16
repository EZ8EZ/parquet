import { distChart, minutesChart, opponentView, stripChart, playerWeekGrid } from "@/lib/lockin/view";
import { LastFifteenStrip } from "./LastFifteenStrip";
import { NextGameChart } from "./NextGameChart";
import { MinutesChart } from "./MinutesChart";
import { OpponentHistory } from "./OpponentHistory";
import { WeekGrid } from "./WeekGrid";

function Block({ title, sub, children }) {
  return (
    <section className="pt-3">
      <h4 className="text-micro font-semibold uppercase tracking-[0.14em] text-muted">
        {title}
        {sub && <span className="ml-1.5 font-normal normal-case tracking-normal text-faint">{sub}</span>}
      </h4>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

const Missing = ({ text }) => <p className="text-meta text-muted">{text}</p>;

/** The five charts for one player. */
export function PlayerDetail({ card, today }) {
  const strip = stripChart(card);
  const dist = distChart(card);
  const mins = minutesChart(card);
  const opp = opponentView(card);
  return (
    <div className="divide-y divide-border">
      <Block title="Last 15 games" sub={strip.ok ? "tap a game" : null}>
        {strip.ok ? <LastFifteenStrip g={strip} name={card.name} /> : <Missing text={strip.missing} />}
      </Block>
      <Block title="Next game" sub={dist.ok ? `${dist.n} equally likely outcomes` : null}>
        {dist.ok ? <NextGameChart g={dist} /> : <Missing text={dist.missing} />}
      </Block>
      <Block title="His week">
        {card.weekGames.length ? <WeekGrid grid={playerWeekGrid(card, today)} caption={`${card.name}'s games this week`} single /> : <Missing text="No games found for his team this week." />}
      </Block>
      <Block title="Minutes" sub={mins.ok ? `last ${mins.points.length}` : null}>
        {mins.ok ? <MinutesChart g={mins} /> : <Missing text={mins.missing} />}
      </Block>
      <div className="pt-3">
        <OpponentHistory v={opp} />
      </div>
    </div>
  );
}
