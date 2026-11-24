import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Disclosure, List, SectionHeader } from "@/components/ui";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { DIVERGING } from "@/lib/chart-colors";
import { whatIfView } from "@/lib/lockin/matchupView";
import { DeckTrigger } from "./PlayerDeck";
import { LocalWhen } from "./LocalWhen";

/** Signed bar from the baseline (the centre rule); the printed figure carries the value. */
function DeltaBar({ bar }) {
  return (
    <span className="relative mt-1.5 block h-1.5 rounded-full bg-elevated" aria-hidden="true">
      <span className="absolute -inset-y-0.5 left-1/2 w-px bg-border-strong" />
      {bar && <span className="absolute inset-y-0 rounded-full" style={{ left: `${bar.left}%`, width: `${Math.max(bar.width, 1)}%`, background: bar.dir === "up" ? DIVERGING.high.fill : DIVERGING.low.fill }} />}
    </span>
  );
}

function Row({ r, faces }) {
  const face = (id) => {
    const c = faces.get(id);
    return c ? <PlayerAvatar key={id} name={c.name} team={c.team} playerId={id} size="sm" decorative /> : null;
  };
  const body = (
    <span className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex shrink-0 -space-x-3">
        {face(r.playerId)}
        {r.forPlayerId ? face(r.forPlayerId) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-note font-semibold text-ink">
          {r.text}
          {r.deadlineFallback && <LocalWhen at={r.deadline} fallback={r.deadlineFallback} prefix=" before " />}
        </span>
        {!r.noise && <DeltaBar bar={r.bar} />}
      </span>
      <span className="shrink-0 text-right">
        <span className="block figure text-body font-bold text-ink">{r.winPct}</span>
        <span className={`block figure text-meta ${r.noise ? "text-secondary" : "font-semibold text-muted"}`}>
          <span aria-hidden="true">{r.deltaText}</span>
          <span className="sr-only">{r.deltaSr}</span>
        </span>
      </span>
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-secondary" />
    </span>
  );
  return r.playerId && faces.has(r.playerId) ? (
    <DeckTrigger playerId={r.playerId} label={`${r.text}: ${r.winPct} to win, ${r.deltaSr}. Show details`}>
      {body}
    </DeckTrigger>
  ) : (
    body
  );
}

/**
 * "What moves your win chance": each possible decision with the win chance after it
 * and the change from doing nothing more, real differences first, then the ones within
 * simulation noise. compact (Home): each player's best option, top three, plus all of
 * the model's calls together. Tapping a row opens the player's sheet.
 */
export function WhatIf({ desk, compact = false, moreHref = "/lockin" }) {
  const v = whatIfView(desk, compact ? { limit: 3, distinct: true } : {});
  if (!v || (!v.rows.length && !v.plan)) return null;
  const faces = new Map((desk.cards || []).map((c) => [c.playerId, c]));
  return (
    <section aria-labelledby="whatif-title" data-whatif={compact ? "compact" : "full"}>
      <SectionHeader id="whatif-title" title="What moves your win chance" className={compact ? "mt-5" : "mt-2"} />
      {v.plan && (
        <p className="mb-2 text-note text-muted" data-whatif-plan>
          All of the model&apos;s calls: <span className="figure font-bold text-ink">{v.plan.winPct}</span> · doing nothing more: <span className="figure font-bold text-ink">{v.basePct}</span>
        </p>
      )}
      <List>
        {v.rows.map((r) => (
          <li key={r.id} data-whatif-row={r.noise ? "noise" : "real"}>
            <Row r={r} faces={faces} />
          </li>
        ))}
        {compact && v.more > 0 && (
          <li>
            <Link href={moreHref} className="flex min-h-11 items-center justify-between px-3 text-note font-semibold text-accent-text">
              Every option, on Lock or hold
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </li>
        )}
      </List>
      {!compact && (
        <Disclosure summary="How these are worked out" className="mt-1">
          <p>
            Each row is the chance to win this matchup if you take that one action and leave everything else as it is, against doing nothing more ({v.basePct}).
            {v.baseText ? ` Doing nothing more: ${v.baseText.charAt(0).toLowerCase()}${v.baseText.slice(1)}.` : ""}
          </p>
          {v.noiseText && <p className="mt-1">{v.noiseText}</p>}
        </Disclosure>
      )}
    </section>
  );
}
