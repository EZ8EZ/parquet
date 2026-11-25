import { AlertTriangle, ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { fmt, playerFormRow } from "@/lib/lockin/view";
import { DeckTrigger } from "./PlayerDeck";
import { Opp } from "./Opp";

/**
 * Every player on the roster at a glance: his last 10 games as bars (a dot marks a game
 * with something unusual: a starter out, odd minutes), his season average, and each game
 * he has left this week with his average against that team (history only). Tapping a row
 * opens his sheet: next-game chart, last 15, minutes, and every past meeting.
 */
export function PlayerFormList({ desk }) {
  const slotOf = new Map((desk.slots || []).filter((s) => s.playerId).map((s) => [s.playerId, s.label]));
  const starters = (desk.slots || []).map((s) => s.playerId).filter(Boolean);
  const byId = new Map(desk.cards.map((c) => [c.playerId, c]));
  const order = [...new Set([...starters, ...desk.cards.map((c) => c.playerId)])].map((id) => byId.get(id)).filter(Boolean);
  return (
    <div className="pt-3">
      <h2 className="sr-only">Players</h2>
      <p className="mb-2 text-meta text-secondary">Last 10 games, season average, and how he has scored against each team left this week. Tap a player for every chart.</p>
      <ul className="divide-y divide-border overflow-hidden rounded-card bg-surface">
        {order.map((c) => {
          const f = playerFormRow(c);
          return (
            <li key={c.playerId}>
              <DeckTrigger playerId={c.playerId} hint="Charts and past games" className="px-3.5 py-3 transition-colors hover:bg-elevated">
                <div className="flex items-center gap-3">
                  <span className="w-9 shrink-0 text-center text-micro font-semibold text-secondary">{slotOf.get(c.playerId) ?? "BN"}</span>
                  <PlayerAvatar name={c.name} team={c.team} playerId={c.playerId} size="sm" decorative />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-note font-semibold text-ink">
                      <span>{c.name}</span>
                      {c.injury?.status && (
                        <Chip tone={/^out/i.test(c.injury.status) ? "negative" : "warn"} size="sm" icon={AlertTriangle}>
                          {c.injury.status}
                        </Chip>
                      )}
                    </p>
                    <p className="text-micro text-secondary">
                      {f.season ? (
                        <>
                          Season <span className="figure font-semibold text-ink">{fmt(f.season.mean)}</span> · n={f.season.n}
                        </>
                      ) : (
                        "No games this season"
                      )}
                    </p>
                  </div>
                  {f.n > 0 && (
                    <span className="flex h-8 w-24 shrink-0 items-end gap-[2px]" role="img" aria-label={`Last ${f.n} games: ${f.bars.map((b) => fmt(b.fp)).join(", ")}`}>
                      {f.bars.map((b) => (
                        <span key={b.date} className="relative flex-1 rounded-t-[2px] bg-secondary" style={{ height: `${b.hPct}%` }}>
                          {b.noted && <span className="absolute -top-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-warn" />}
                        </span>
                      ))}
                    </span>
                  )}
                  <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-secondary" />
                </div>
                {f.ahead.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5 pl-12" aria-label="Games left this week">
                    {f.ahead.map((a) => (
                      <li key={`${a.date}-${a.opponent}`} className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-secondary">
                        {a.day} <Opp team={a.opponent} away={a.away} />
                        {a.avg != null ? (
                          <>
                            {" "}
                            <span className="figure font-semibold text-ink">{fmt(a.avg)}</span> avg (n={a.n})
                          </>
                        ) : (
                          " · no past meetings"
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 pl-12 text-micro text-muted">No games left this week</p>
                )}
              </DeckTrigger>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-meta text-secondary">Past-meeting averages are history only and feed no number (partial correlation 0.026, n=18,812).</p>
    </div>
  );
}
