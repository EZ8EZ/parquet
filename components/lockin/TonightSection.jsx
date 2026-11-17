import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight, Info } from "lucide-react";
import { Card, Chip, Disclosure, List, SectionHeader } from "@/components/ui";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { fmt } from "@/lib/lockin/view";
import { swapScale, tonightView } from "@/lib/lockin/tonightView";
import { DeckTrigger } from "./PlayerDeck";
import { Countdown, Deadline } from "./TonightClock";

function Face({ id, v, size = "sm" }) {
  const p = v.players[id];
  return <PlayerAvatar name={p?.name ?? id} team={p?.team} playerId={id} size={size} decorative />;
}

function Listing({ p }) {
  if (!p?.listing) return null;
  return (
    <Chip tone={p.listing.assumed === "listed_out" ? "negative" : "warn"} size="sm" icon={AlertTriangle}>
      {p.listing.status}
    </Chip>
  );
}

const nameOf = (v, id) => v.players[id]?.name ?? `Player ${id}`;

/** Threshold and the starter's points so far on one scale; facts only, no projection. */
function SwapBar({ a, v }) {
  const early = v.players[a.earlyId];
  const line = early?.line ?? null;
  const sc = swapScale(a.threshold, line);
  const live = early?.status === "in_game";
  const final = early?.status === "complete";
  return (
    <div className="mt-2">
      <div className="relative h-3 rounded-full bg-elevated" aria-hidden="true">
        {sc.pointsPct != null && <span className="absolute inset-y-0 left-0 rounded-full bg-secondary" style={{ width: `${sc.pointsPct}%` }} />}
        {sc.thresholdPct != null && <span className="absolute -inset-y-1 w-0.5 rounded-full bg-accent" style={{ left: `${sc.thresholdPct}%` }} />}
      </div>
      <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-meta text-secondary">
        <span>
          {line ? (
            <>
              <span className="figure font-semibold text-ink">{fmt(line.fpSoFar)}</span> pts, {fmt(line.minutesSoFar)} min
              {line.usualMinutes != null ? ` of his usual ${fmt(line.usualMinutes)}` : ""}
              {final ? " (final)" : live ? " so far" : ""}
            </>
          ) : (
            `${nameOf(v, a.earlyId)}'s game has not started`
          )}
        </span>
        <span>
          swap line <span className="figure font-semibold text-accent-text">{fmt(a.threshold)}</span>
        </span>
      </p>
      {a.below != null && a.belowInputs && (
        <p className="mt-1 text-meta text-secondary">
          Model estimate: <span className="font-semibold text-ink">{a.below ? "under" : "over"} the swap line</span>{" "}
          {a.belowInputs.final != null ? `(final ${fmt(a.belowInputs.final)} vs ${fmt(a.belowInputs.threshold)})` : `(projected final ${fmt(a.belowInputs.projectedFinal)} vs ${fmt(a.belowInputs.threshold)} at this point)`}
        </p>
      )}
    </div>
  );
}

function Action({ a, v, node }) {
  if (a.kind === "start") {
    return (
      <DeckTrigger playerId={a.playerId} label={`Start ${nameOf(v, a.playerId)} in ${a.slotLabel}. Show details`} className="rounded-control">
        <span className="flex items-center gap-3 py-2">
          <Face id={a.playerId} v={v} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5 text-body font-semibold text-ink">
              Start {nameOf(v, a.playerId)} in {a.slotLabel}
              <Listing p={v.players[a.playerId]} />
            </span>
            <span className="block text-meta text-secondary">
              {a.threshold != null && a.replacesPlayerId
                ? `His earlier game first; ${nameOf(v, a.replacesPlayerId)} can still come in before his ${a.laterTip ?? "later"} start`
                : a.replacesPlayerId
                  ? `${nameOf(v, a.replacesPlayerId)} has no game tonight and keeps his later games`
                  : "For his game tonight"}
            </span>
          </span>
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-faint" />
        </span>
      </DeckTrigger>
    );
  }
  if (a.kind === "swap") {
    return (
      <div className="py-2">
        <DeckTrigger playerId={a.laterId} label={`Swap ${nameOf(v, a.laterId)} in for ${nameOf(v, a.earlyId)}. Show details`} className="rounded-control">
          <span className="flex items-center gap-2">
            <Face id={a.earlyId} v={v} />
            <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-faint" />
            <Face id={a.laterId} v={v} />
            <span className="min-w-0 flex-1 pl-1">
              <span className="flex flex-wrap items-center gap-1.5 text-body font-semibold text-ink">
                Swap {nameOf(v, a.laterId)} in for {nameOf(v, a.earlyId)}
                {a.slotLabel && <Chip size="sm">{a.slotLabel}</Chip>}
                <Listing p={v.players[a.laterId]} />
              </span>
              <span className="block text-meta text-secondary">
                <Deadline at={node.at} fallback={node.atText} /> if {nameOf(v, a.earlyId)}&apos;s projected final is under the swap line
              </span>
            </span>
          </span>
        </DeckTrigger>
        <SwapBar a={a} v={v} />
      </div>
    );
  }
  return (
    <p className="py-2 text-body text-ink">
      Lock or hold {nameOf(v, a.playerId)}: {fmt(a.x)} now, {fmt(a.expectedIfHeld)} expected if held
    </p>
  );
}

function Starting({ node, v }) {
  if (!node.starting.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-secondary">
      <span className="flex -space-x-2" aria-hidden="true">
        {node.starting.slice(0, 5).map((id) => (
          <Face key={id} id={id} v={v} />
        ))}
      </span>
      <span>
        Starting then: {node.starting.map((id) => nameOf(v, id)).join(", ")}
      </span>
    </span>
  );
}

function Hero({ node, v, frozenAt }) {
  return (
    <Card pad="sm" className="space-y-2" data-tonight-next>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-lede font-bold text-ink">
          <Deadline at={node.at} fallback={node.atText} capitalize />
        </p>
        {node.at && (
          <Chip tone="accent">
            <Countdown at={node.at} frozenAt={frozenAt} />
          </Chip>
        )}
      </div>
      <Starting node={node} v={v} />
      {node.actions.length > 0 ? (
        <div className="divide-y divide-border">
          {node.actions.map((a, i) => (
            <Action key={i} a={a} v={v} node={node} />
          ))}
        </div>
      ) : (
        <p className="text-note text-secondary">Have them in their slots before then.</p>
      )}
    </Card>
  );
}

function NodeRow({ node, v }) {
  const main = node.actions[0];
  const id = main ? (main.kind === "swap" ? main.laterId : main.playerId) : node.starting[0];
  const summary = node.actions.length
    ? node.actions.map((a) => (a.kind === "swap" ? `swap ${nameOf(v, a.laterId)} in for ${nameOf(v, a.earlyId)} if under ${fmt(a.threshold)}` : a.kind === "start" ? `start ${nameOf(v, a.playerId)} in ${a.slotLabel}` : `lock or hold ${nameOf(v, a.playerId)}`)).join("; ")
    : `${node.starting.length} of your players start`;
  const face = (
    <span className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <span className="flex -space-x-2" aria-hidden="true">
        {(node.starting.length ? node.starting : [id]).filter(Boolean).slice(0, 3).map((pid) => (
          <Face key={pid} id={pid} v={v} />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-ink">
          <Deadline at={node.at} fallback={node.atText} capitalize />
        </span>
        <span className="block text-meta text-secondary">{summary[0].toUpperCase() + summary.slice(1)}</span>
      </span>
      {id && <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-faint" />}
    </span>
  );
  return <li>{id ? <DeckTrigger playerId={id} label={`${node.atText}: ${summary}. Show details`}>{face}</DeckTrigger> : face}</li>;
}

function HowItWorks({ record }) {
  return (
    <Disclosure summary="How tonight's order is worked out">
      <p>With more playable players than slots, the earlier tip goes in first: his line is information, and a later player can still replace him. League practice, as confirmed by the owner:</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-4">
        <li>A starter subbed out loses that game&apos;s score for good.</li>
        <li>A starter can be subbed out while his game is in progress.</li>
        <li>The incoming player must be in the slot before his game&apos;s listed start time, not the actual tip.</li>
        <li>Swaps on a slot and re-entry for a player are unlimited.</li>
      </ol>
      <p className="mt-1.5">
        Ordering players by listed start gained <span className="figure font-semibold text-ink">+{record.gain}</span> points per team-week in a backtest on final scores (n={record.n} team-weeks, 95% interval +{record.lo} to +{record.hi}, assuming early games finish within 150 minutes). There is no record yet for swaps made mid-game, and the in-game projection behind the swap line has not been measured on this league&apos;s full scoring.
      </p>
    </Disclosure>
  );
}

const RECORD = { gain: 0.88, n: 240, lo: 0.44, hi: 1.41 };

/** Tonight's listed starts as deadlines: the next one in full, the rest as a track. */
export function TonightSection({ desk, compact = false, fullHref = "/lockin", frozenAt = null, inTab = false }) {
  const v = tonightView(desk);
  // Inside /lockin's Tonight tab the tab is the title; the heading stays for screen readers.
  const heading = inTab ? (
    <h2 id="tonight-title" className="sr-only">
      Tonight
    </h2>
  ) : (
    <SectionHeader id="tonight-title" title="Tonight" />
  );
  if (!v) return null;
  if (v.status === "no_games") {
    return (
      <section aria-labelledby="tonight-title" data-tonight="no_games">
        {heading}
        <p className="rounded-card bg-surface px-4 py-3 text-body text-muted">
          No games for your players tonight{v.nextDay ? `. Next game day: ${v.nextDay.day}.` : "."}
        </p>
      </section>
    );
  }
  const uncertain = Object.values(v.players).some((p) => p.listing?.assumed === "listed_uncertain");
  return (
    <section aria-labelledby="tonight-title" data-tonight={v.next ? "open" : "passed"}>
      {heading}
      {v.notes.length > 0 && (
        <div role="status" className="mb-2 flex gap-2 rounded-control bg-surface-2 px-3 py-2 text-note text-ink">
          <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
          <ul>
            {v.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {!v.tipsKnown && <p className="mb-2 text-meta text-secondary">Start times are not published yet; the order follows each player&apos;s game.</p>}
      {v.next ? (
        <Hero node={v.next} v={v} frozenAt={frozenAt} />
      ) : (
        <p className="rounded-card bg-surface px-4 py-3 text-body text-muted">Every decision point tonight has passed.</p>
      )}
      {uncertain && <p className="mt-1.5 text-meta text-secondary">For players listed GTD or DTD, expected values assume he plays: the play rate for listed players is not measured yet.</p>}
      {v.later.length > 0 &&
        (compact ? (
          <Link href={fullHref} className="mt-2 flex min-h-11 items-center justify-between rounded-card bg-surface px-4 text-note font-semibold text-accent-text">
            {v.later.length} more {v.later.length === 1 ? "deadline" : "deadlines"} tonight
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        ) : (
          <List className="mt-2" aria-label="Later deadlines tonight">
            {v.later.map((n) => (
              <NodeRow key={n.key} node={n} v={v} />
            ))}
          </List>
        ))}
      {!compact && v.passed.length > 0 && (
        <Disclosure className="mt-1" summary={`${v.passed.length} ${v.passed.length === 1 ? "deadline" : "deadlines"} passed`}>
          <ul className="space-y-1">
            {v.passed.map((n) => (
              <li key={n.key}>
                {n.atText}: {n.starting.map((id) => nameOf(v, id)).join(", ") || n.actions.length + " decisions"}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {!compact && v.afterGames.length > 0 && (
        <Disclosure summary="After tonight's games: what holding is worth">
          <ul className="space-y-1">
            {v.afterGames.map((g) => (
              <li key={g.playerId}>
                {nameOf(v, g.playerId)}: <span className="figure font-semibold text-ink">{fmt(g.expectedIfHeld)}</span> expected if held, {g.gamesAfter} {g.gamesAfter === 1 ? "game" : "games"} left after tonight
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {!compact && <HowItWorks record={RECORD} />}
    </section>
  );
}
