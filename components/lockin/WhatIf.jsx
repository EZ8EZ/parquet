import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { Chip, Disclosure, List, SectionHeader } from "@/components/ui";
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
    <span className={`flex items-center gap-3 px-3 py-2.5 ${r.above ? "bg-surface-2" : ""}`}>
      <span className="flex shrink-0 -space-x-3">
        {face(r.playerId)}
        {r.forPlayerId ? face(r.forPlayerId) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-note font-semibold text-ink">
          {r.text}
          {r.deadlineFallback && <LocalWhen at={r.deadline} fallback={r.deadlineFallback} prefix=" before " />}
        </span>
        {r.above && (
          <Chip size="sm" tone="info" icon={ArrowUpRight} className="mt-1">
            Higher than the model&apos;s plan
          </Chip>
        )}
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
 * "What moves your win chance": the win chance if you follow the model's calls, then
 * what each deviation from that plan does to it (the win chance after it and the signed
 * change). A row that beats the plan is marked in words and tone; changes within the
 * simulation's noise read "no real difference" and sort last. compact (Home): each
 * player's first row, top three. Tapping a row opens the player's sheet.
 */
export function WhatIf({ desk, compact = false, moreHref = "/lockin" }) {
  const v = whatIfView(desk, compact ? { limit: 3, distinct: true } : {});
  if (!v || !v.rows.length) return null;
  const faces = new Map((desk.cards || []).map((c) => [c.playerId, c]));
  return (
    <section aria-labelledby="whatif-title" data-whatif={compact ? "compact" : "full"}>
      <SectionHeader id="whatif-title" title="What moves your win chance" className={compact ? "mt-5" : "mt-2"} />
      <p className="mb-2 text-note text-muted" data-whatif-plan>
        Your win chance: <span className="figure font-bold text-ink">{v.followPct}</span> if you follow the model&apos;s calls. Doing something else:
      </p>
      <List>
        {v.rows.map((r) => (
          <li key={r.id} data-whatif-row={r.noise ? "noise" : r.above ? "above" : "real"}>
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
          <p>Each row is the chance to win this matchup if you take that one action and follow the model&apos;s calls for everything else, against following them all ({v.basePct}). The bar runs from that line.</p>
          {v.noiseText && <p className="mt-1">{v.noiseText}</p>}
          {v.doNothingPct && <p className="mt-1">If you made no further move this week: {v.doNothingPct}.</p>}
        </Disclosure>
      )}
    </section>
  );
}
