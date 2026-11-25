import { Info } from "lucide-react";
import { Disclosure } from "@/components/ui";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { cn } from "@/lib/ui";
import { winTable } from "@/lib/lockin/matchupView";
import { DeckTrigger } from "./PlayerDeck";

const COLS = [
  ["lock", "Lock now"],
  ["wait", "At the deadline"],
  ["hold", "Hold"],
];

function Cell({ c }) {
  if (!c) return <span className="flex h-12 items-center justify-center rounded-control text-meta text-faint">—</span>;
  const kind = c.plan ? "plan" : c.noise ? "noise" : c.delta > 0 ? "above" : "real";
  return (
    <span
      data-whatif-row={kind}
      className={cn(
        "flex h-12 flex-col items-center justify-center rounded-control",
        c.plan ? "bg-accent-wash ring-1 ring-inset ring-accent" : "bg-surface-2",
      )}
    >
      <span className={cn("figure text-body", c.noise && !c.plan ? "font-semibold text-muted" : "font-bold text-ink")}>{c.pct}</span>
      <span className={cn("text-micro", c.plan ? "font-semibold text-accent-text" : "text-secondary")}>
        <span aria-hidden="true">{c.plan ? "model" : c.label}</span>
        <span className="sr-only">{c.sr}</span>
      </span>
    </span>
  );
}

/**
 * The Win % tab: every live call as a row of three rough win chances (lock now, decide at
 * the deadline, hold), each changing that one call and keeping the model's plan for the
 * rest. The model's call is outlined: it rests on expected points, not on the highest
 * cell. Swaps sit apart. How far to trust the figures is one tap away.
 */
export function WinTable({ desk }) {
  const t = winTable(desk);
  if (!t) return null;
  return (
    <section aria-labelledby="wintable-title" data-whatif="full" className="pt-3">
      <h2 id="wintable-title" className="text-lede font-semibold text-ink">
        Rough win chance by call
      </h2>
      <p className="mt-1 text-note text-muted">
        Follow every call: <span className="figure font-bold text-ink">{t.basePct}</span>. Each cell changes one call and keeps the rest.
      </p>
      {t.rows.length > 0 && (
        <table className="mt-3 w-full border-separate border-spacing-x-1.5 border-spacing-y-0 overflow-hidden rounded-card bg-surface">
          <caption className="sr-only">Rough win chance if you change one call, by player</caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-2 text-left text-micro font-semibold text-secondary">
                Player
              </th>
              {COLS.map(([k, label]) => (
                <th key={k} scope="col" className="w-[64px] px-0 py-2 text-center text-micro font-semibold leading-tight text-secondary">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.playerId}>
                <th scope="row" className="border-t border-border px-1 py-2 text-left font-normal">
                  <DeckTrigger playerId={r.playerId} hint="Show details" className="flex min-h-11 items-center gap-2 rounded-control">
                    <PlayerAvatar name={r.name} team={r.team} playerId={r.playerId} size="sm" decorative />
                    <span className="min-w-0">
                      <span className="block text-note font-semibold text-ink">{r.name}</span>
                      <span className="block figure text-micro text-secondary">
                        {r.slotLabel} · {r.xText}
                        <span className="sr-only"> on the table</span>
                      </span>
                    </span>
                  </DeckTrigger>
                </th>
                {COLS.map(([k]) => (
                  <td key={k} className="border-t border-border px-0 py-2">
                    <Cell c={r.cells[k]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-micro text-secondary">Outlined: the model&apos;s call, which rests on expected points. &ldquo;≈ same&rdquo;: inside the simulation&apos;s noise.</p>

      <h3 className="mt-5 text-body font-semibold text-ink">Swaps tonight</h3>
      {t.swaps.length ? (
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-card bg-surface">
          {t.swaps.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3.5 py-2.5" data-whatif-row={s.noise ? "noise" : s.delta > 0 ? "above" : "real"}>
              <span className="min-w-0 flex-1">
                <span className="block text-note font-semibold text-ink">{s.text}</span>
                <span className="block text-micro text-secondary">{s.inPlan ? "Already in the model's plan" : "Not in the model's plan"}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block figure text-body font-bold text-ink">{s.pct}</span>
                <span className="block text-micro text-secondary">
                  <span aria-hidden="true">{s.inPlan ? "the plan" : s.label}</span>
                  <span className="sr-only">{s.inPlan ? "already in the plan" : s.sr}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-note text-muted">No swap options tonight.</p>
      )}

      <Disclosure summary="How far to trust these" className="mt-3" icon={<Info size={14} />}>
        <p>Rough: close to right near 0% and 100%, off by up to about 19 points in between.</p>
        <p className="mt-1">In backtests on 240 team-weeks, making calls by win chance did not win more matchups than the model&apos;s points lean, so the outlined cell is the model&apos;s call even when another cell is higher.</p>
        {t.doNothingPct && <p className="mt-1">If you made no further move this week: {t.doNothingPct}.</p>}
      </Disclosure>
    </section>
  );
}
