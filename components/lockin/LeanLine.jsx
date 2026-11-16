import { cn } from "@/lib/ui";
import { leanView } from "@/lib/lockin/view";

function Meter({ strength }) {
  return (
    <svg width="20" height="12" viewBox="0 0 20 12" aria-hidden="true" className="shrink-0">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1 + i * 6.5}
          y={8 - i * 3.5}
          width="5"
          height={3.5 + i * 3.5}
          rx="0.8"
          fill={i < strength ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

/** The policy's lean for one card: value, confidence, reason, record. */
export function LeanLine({ lean, record, methodHref = "#lockin-method" }) {
  const v = leanView(lean);
  if (!v) return null;
  const strong = v.strength >= 3;
  const pessimistic = record.rotationCaveat?.match(/falls to (\+[\d.]+)/)?.[1];
  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body leading-snug">
        <span className="text-muted">{v.conditional ? "If not already locked, model leans:" : "Model leans:"}</span>
        <span className={cn("uppercase tracking-[0.08em]", v.nearlyEven ? "font-normal text-muted" : strong ? "font-bold text-accent-text" : "font-semibold text-ink")}>{v.value}</span>
        <span className={cn("flex items-center gap-1 text-meta", v.nearlyEven ? "text-muted" : "text-ink")}>
          <Meter strength={v.strength} />
          {v.confidence}
          {v.nearlyEven ? ", close to even" : ""}
        </span>
      </p>
      <p className="mt-1 text-meta leading-snug text-muted">{lean.reason}.</p>
      <details className="group mt-1">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-meta font-semibold text-faint hover:text-accent-text">
          The lean&apos;s record
        </summary>
        <p className="mb-1 text-meta leading-snug text-muted">
          In a backtest over {record.n} active team-weeks ({record.sample}), the policy behind the lean would have banked{" "}
          <span className="figure font-semibold text-ink">+{record.gainPerTeamWeek}</span> points per team-week over what managers actually banked (95% interval +{record.interval95[0]} to +{record.interval95[1]}). {pessimistic ? `Under the most pessimistic assumption about mid-week lineup swaps, the per-player rule gains only ${pessimistic}. ` : ""}
          <a href={methodHref} className="text-accent-text underline underline-offset-2">
            How these numbers are made
          </a>
        </p>
      </details>
    </div>
  );
}
