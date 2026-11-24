import { TrendingDown, TrendingUp } from "lucide-react";
import { Chip } from "@/components/ui";
import { CHART_ACCENT, CHART_INK, CHART_MARK } from "@/lib/chart-colors";
import { fmt } from "@/lib/lockin/view";
import { profileView } from "@/lib/lockin/matchupView";

/**
 * Boom/bust profile: a small range bar (8 in 10 games between p10 and p90, the median
 * as a tick, the score on the table as a violet tick when there is one), then boom
 * and bust as labelled chips with their thresholds and n. The printed numbers carry
 * every value; colour only marks which tick is the score now.
 */
export function ProfileBar({ profile, x = null, compact = false }) {
  const v = profileView(profile, { x });
  if (!v.ok) return <p className="text-meta text-secondary">{v.missing}</p>;
  return (
    <div data-profile>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-meta text-secondary">
        <span>
          Next game, 8 in 10: <span className="figure font-semibold text-ink">{v.rangeText}</span>, median <span className="figure font-semibold text-ink">{fmt(v.p50)}</span>
        </span>
        {v.x != null && (
          <span>
            now <span className="figure font-semibold text-accent-text">{fmt(v.x)}</span>
          </span>
        )}
      </p>
      <div className="relative mt-1.5 h-2 rounded-full bg-elevated" aria-hidden="true">
        <span className="absolute inset-y-0 rounded-full" style={{ left: `${v.pos.lo}%`, width: `${Math.max(v.width, 1)}%`, background: CHART_MARK, opacity: 0.6 }} />
        <span className="absolute -inset-y-1 w-[3px] -translate-x-1/2 rounded-full" style={{ left: `${v.pos.mid}%`, background: CHART_INK }} />
        {v.pos.now != null && <span className="absolute -inset-y-1.5 w-[3px] -translate-x-1/2 rounded-full" style={{ left: `${v.pos.now}%`, background: CHART_ACCENT }} />}
      </div>
      <p className={`flex flex-wrap items-center gap-1.5 ${compact ? "mt-2" : "mt-2.5"}`}>
        {v.boom && (
          <Chip size="sm" tone="positive" icon={TrendingUp}>
            {v.boom.text}
            {v.boom.threshold && !compact ? ` · ${v.boom.threshold}` : ""}
          </Chip>
        )}
        {v.bust && (
          <Chip size="sm" tone="negative" icon={TrendingDown}>
            {v.bust.text}
            {v.bust.threshold && !compact ? ` · ${v.bust.threshold}` : ""}
          </Chip>
        )}
        <span className="text-meta text-secondary">{v.nText}</span>
      </p>
    </div>
  );
}
