import Link from "next/link";
import { Disclosure, Tabs } from "@/components/ui";
import { basisText, distChart, minutesChart, opponentView, playerWeekGrid, stripChart } from "@/lib/lockin/view";
import { DecisionFigures, Hazards, LeanChip, WhenLine } from "./Decision";
import { LastFifteenStrip } from "./LastFifteenStrip";
import { NextGameChart } from "./NextGameChart";
import { MinutesChart } from "./MinutesChart";
import { OpponentHistory } from "./OpponentHistory";
import { WeekGrid } from "./WeekGrid";
import { ModelCall, WinFigures, leanPrefix } from "./WinCall";
import { BEAT_NOTE, roughen } from "@/lib/lockin/matchupView";
import { ProfileBar } from "./ProfileBar";
import { AvailabilityDots } from "./AvailabilityDots";

function Block({ title, sub, children }) {
  return (
    <section className="pt-5">
      <h3 className="text-body font-semibold text-ink">
        {title}
        {sub && <span className="ml-1.5 text-meta font-normal text-secondary">{sub}</span>}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

const Missing = ({ text }) => <p className="text-note text-muted">{text}</p>;

function Record({ record, methodHref }) {
  const pessimistic = record.rotationCaveat?.match(/falls to (\+[\d.]+)/)?.[1];
  const blind = record.availabilityCaveat?.match(/gain was (\+[\d.]+)/)?.[1];
  return (
    <Disclosure summary="The lean's record">
      <ul className="space-y-1.5">
        <li>
          <span className="figure font-semibold text-ink">+{record.gainPerTeamWeek}</span> points per team-week over what managers banked (95% interval +{record.interval95[0]} to +{record.interval95[1]}, n={record.n} team-weeks), in a backtest that knew who would play his next game.
        </li>
        {blind && (
          <li>
            Without knowing who would play: <span className="figure font-semibold text-ink">{blind}</span> for the simpler per-player rule.
          </li>
        )}
        {pessimistic && (
          <li>
            If managers could not have swapped starters mid-week: only <span className="figure font-semibold text-ink">{pessimistic}</span>.
          </li>
        )}
      </ul>
      <Link href={methodHref} className="mt-2 inline-block font-semibold text-accent-text underline underline-offset-2">
        How these numbers are made
      </Link>
    </Disclosure>
  );
}

/**
 * Everything about one player, for the sheet, in four short tabs instead of one long
 * scroll: Call (the decision, his next game against the score on the table, boom or
 * bust, chance to play, the lean's record), Form (last 15 games, minutes), Week (his
 * games this week), History (past games against this opponent, history only).
 */
export function PlayerPanel({ card, today, record, methodHref, winProb = null, tz, nowMs }) {
  const strip = stripChart(card);
  const dist = distChart(card);
  const mins = minutesChart(card);
  const opp = opponentView(card);
  const fc = card.forecast;
  const call = (
    <div>
      <div className="space-y-3 pt-3">
        <Hazards card={card} />
        <ModelCall card={card} tz={tz} today={today} nowMs={nowMs} />
        <DecisionFigures card={card} />
        <WhenLine card={card} />
        {card.lean.value !== "none" ? (
          <div className="space-y-1">
            <LeanChip lean={card.lean} prefix={leanPrefix(card)} />
            <WinFigures card={card} winProb={winProb} showReason={false} />
            <p className="text-note text-muted">{roughen(card.lean.reason)}.</p>
          </div>
        ) : (
          <p className="text-note text-muted">{card.decision.kind === "lineup" ? card.decision.text : card.lean.reason}</p>
        )}
      </div>
      <Block title="Next game" sub={dist.ok ? `${dist.n} equally likely outcomes` : null}>
        {dist.ok ? <NextGameChart g={dist} /> : <Missing text={dist.missing} />}
      </Block>
      <Block title="Boom or bust">
        <div className="space-y-3">
          <ProfileBar profile={card.profile} x={card.stopping?.x ?? null} />
          <AvailabilityDots card={card} />
        </div>
      </Block>
      <div className="space-y-1 pt-4">
        {fc && <p className="text-meta text-secondary">Forecast {basisText(fc)}.</p>}
        {card.stopping && <p className="text-meta text-secondary">{BEAT_NOTE}</p>}
        {card.lean.value !== "none" && <Record record={record} methodHref={methodHref} />}
      </div>
    </div>
  );
  const form = (
    <div>
      <Block title="Last 15 games" sub={strip.ok ? "tap a game" : null}>
        {strip.ok ? <LastFifteenStrip g={strip} name={card.name} /> : <Missing text={strip.missing} />}
      </Block>
      <Block title="Minutes" sub={mins.ok ? `last ${mins.points.length}` : null}>
        {mins.ok ? <MinutesChart g={mins} /> : <Missing text={mins.missing} />}
      </Block>
    </div>
  );
  const week = (
    <Block title="His week">
      {card.weekGames.length ? <WeekGrid grid={playerWeekGrid(card, today)} caption={`${card.name}'s games this week`} single /> : <Missing text="No games found for his team this week." />}
    </Block>
  );
  return (
    <Tabs
      label={`${card.name}: sections`}
      variant="segmented"
      items={[
        { id: "call", label: "Call", content: call },
        { id: "form", label: "Form", content: form },
        { id: "week", label: "Week", content: week },
        { id: "history", label: "History", content: <div className="pt-4"><OpponentHistory v={opp} /></div> },
      ]}
    />
  );
}
