import Link from "next/link";
import { TeamAvatar } from "@/components/TeamAvatar";
import { cn } from "@/lib/ui";

/**
 * The standings, one row per team: place, team, W-L, points for, and value rank. A
 * win-share bar under the record makes the pack readable at a glance; the numbers
 * carry the same facts.
 */
export function Standings({ standings }) {
  const { rows, hasRecords } = standings;
  const games = Math.max(1, ...rows.map((r) => (r.wins ?? 0) + (r.losses ?? 0)));
  return (
    <div className="overflow-hidden rounded-[--radius] border border-border bg-surface">
      <div
        aria-hidden="true"
        className="flex items-center gap-2 border-b border-border px-2.5 py-1 text-micro font-semibold uppercase tracking-wide text-secondary"
      >
        <span className="w-5 text-right">#</span>
        <span className="flex-1">Team</span>
        <span className="w-12 text-right">W-L</span>
        <span className="w-12 text-right">PF</span>
        <span className="w-10 text-right">Value</span>
      </div>
      <ol>
        {rows.map((r, i) => (
          <li key={r.rosterId} className="border-b border-border last:border-b-0">
            <Link
              href={`/managers/${r.rosterId}`}
              className={cn(
                "flex min-h-11 items-center gap-2 px-2.5 py-1.5 transition-colors hover:bg-surface-2",
                r.isMe && "bg-accent-wash",
              )}
            >
              <span className="w-5 shrink-0 text-right figure text-meta font-semibold text-secondary">
                {hasRecords ? (r.rank ?? "–") : i + 1}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <TeamAvatar
                  name={r.name}
                  avatarId={r.avatarId}
                  teamLogoUrl={r.teamLogoUrl}
                  size="xs"
                  className="shrink-0 rounded-full"
                />
                <span
                  className={cn(
                    "min-w-0 text-body leading-snug break-words",
                    r.isMe ? "font-semibold text-ink" : "text-ink",
                  )}
                >
                  {r.name}
                  {r.isMe && <span className="sr-only"> (you)</span>}
                </span>
              </span>
              <span className="w-12 shrink-0 text-right">
                <span className="block figure text-body font-semibold text-ink">
                  <span className="sr-only">record </span>
                  {r.wins != null ? `${r.wins}-${r.losses}` : "–"}
                </span>
                {r.wins != null && (
                  <span aria-hidden="true" className="mt-0.5 ml-auto block h-1 w-10 rounded-full bg-border">
                    <span
                      className="block h-1 rounded-full bg-secondary"
                      style={{ width: `${Math.round((r.wins / games) * 100)}%` }}
                    />
                  </span>
                )}
              </span>
              <span className="w-12 shrink-0 text-right figure text-meta text-secondary">
                <span className="sr-only">points for </span>
                {r.pointsFor != null ? Math.round(r.pointsFor).toLocaleString() : "–"}
              </span>
              <span className="w-10 shrink-0 text-right figure text-meta text-secondary">
                <span className="sr-only">value rank </span>#{r.valueRank}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
