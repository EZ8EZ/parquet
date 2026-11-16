import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, Minus } from "lucide-react";
import { cn } from "@/lib/ui";

const VALUE_TONES = {
  neutral: "text-ink",
  accent: "text-accent-text",
  positive: "text-positive",
  negative: "text-negative",
};

/**
 * A delta beside a figure: arrow + sign + number, so direction never rides on colour
 * alone. `tone` is the caller's choice; a change is not good or bad by default.
 */
export function Delta({ n, suffix = "", tone, className }) {
  if (n == null || Number.isNaN(n)) return null;
  const Icon = n > 0 ? ArrowUp : n < 0 ? ArrowDown : Minus;
  const t = tone ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 figure text-meta font-semibold",
        t === "positive" ? "text-positive" : t === "negative" ? "text-negative" : "text-muted",
        className,
      )}
    >
      <Icon size={12} aria-hidden="true" />
      {n > 0 ? `+${n}` : `${n}`}
      {suffix}
    </span>
  );
}

/**
 * Stat tile: label, one large value, optional delta, sub-label and a small visual.
 * `size="hero"` is for the single number a screen exists to deliver (one per screen).
 * With `href` the whole tile is a link.
 */
export function StatTile({
  label,
  value,
  sub,
  delta,
  deltaSuffix,
  deltaTone,
  tone = "neutral",
  size = "md",
  visual,
  href,
  className,
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-meta font-medium text-secondary">{label}</span>
        {href && <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-faint" />}
      </span>
      <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span
          className={cn(
            "figure font-bold tracking-tight",
            size === "hero" ? "text-hero" : size === "sm" ? "text-lede" : "text-display",
            VALUE_TONES[tone] ?? VALUE_TONES.neutral,
          )}
        >
          {value}
        </span>
        {delta != null && <Delta n={delta} suffix={deltaSuffix} tone={deltaTone} />}
      </span>
      {sub && <span className="mt-0.5 block text-meta text-muted">{sub}</span>}
      {visual && <span className="mt-2 block">{visual}</span>}
    </>
  );
  const cls = cn("block min-w-0 rounded-card bg-surface p-3", className);
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-surface-2")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** The old name and props (label, value, sub, tone). */
export function Stat({ label, value, sub, tone }) {
  return <StatTile label={label} value={value} sub={sub} tone={tone} />;
}

/** Old signed figure: kept for existing call sites. Prefer `Delta`. */
export function DeltaValue({ n, suffix }) {
  const tone = n > 0 ? "text-positive" : n < 0 ? "text-negative" : "text-muted";
  return (
    <span className={cn("figure font-semibold", tone)}>
      {n > 0 ? `+${n}` : `${n}`}
      {suffix}
    </span>
  );
}
