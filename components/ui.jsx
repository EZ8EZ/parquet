import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/ui";
/**
 * THE PAGE HEADER, NOW ACTUALLY SHARED.
 *
 * This component was already exact and already correct. Seventeen routes hand-rolled
 * it anyway, and the copies drifted the way copies do: four h1 leadings
 * (`tight`/`[1.1]`/`[1.12]`/`[1.15]`), three bottom margins (`mb-3`/`mb-2.5`/`mb-2`),
 * the gold kicker class string retyped verbatim in twelve files, and one `text-[26px]`
 * h1 that had wandered off the six-step scale entirely.
 *
 * The props below are the structural shapes those seventeen headers actually needed,
 * and nothing more - the rule for this pass was to extend the one component rather
 * than let any route stay hand-rolled and fork the pattern a third way:
 *
 *   leading       an avatar or player crest to the left of the whole block
 *                 (roster, plan, trade/finder, lineage, both manager dossiers)
 *   kickerAction  a small "go here instead" link on the KICKER's line
 *                 (awards, drafts, drafts/[season], plan, managers)
 *   action        a control on the TITLE's line (values' methodology pill) - the
 *                 prop that already existed, unchanged
 *   aside         a control aligned to the top of the whole block, clearing both
 *                 rows (league and roster's Sleeper links)
 *   children      the meta line under the subtitle: counts, tags, dates. Deliberately
 *                 outside `subtitle`, which stays a <p> and so cannot hold a <div>.
 *   below         the same, but spanning the FULL header width rather than the column
 *                 beside the avatar. Not a cosmetic distinction: roster's record line
 *                 is long enough that indenting it behind a 44pt crest costs a whole
 *                 extra wrapped line at 375px, which is the density this app just
 *                 spent two rounds buying back.
 *
 * One leading, one margin, one kicker, one place to change any of them.
 */
export function PageHeader({
  kicker,
  kickerAction,
  title,
  subtitle,
  action,
  aside,
  leading,
  truncateTitle,
  children,
  below,
}) {
  return (
    <header className="mb-3">
      <div className="flex items-start gap-3">
        {leading}
        <div className="min-w-0 flex-1">
          {(kicker || kickerAction) && (
            <div className="flex items-center justify-between gap-3">
              {kicker ? (
                // No `truncate` here on purpose: most kickers are fixed house
                // copy that must read in full, and clipping "Manager dossiers"
                // to "MANAGER DOSS..." to make room for a link is worse than
                // wrapping it. The one kicker that IS user data (league's league
                // name) passes its own truncating span.
                <p className="min-w-0 text-meta font-semibold uppercase tracking-[0.18em] text-accent-text">
                  {kicker}
                </p>
              ) : (
                <span />
              )}
              {kickerAction && <div className="shrink-0">{kickerAction}</div>}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <h1
              className={cn(
                "min-w-0 font-display text-display font-semibold leading-tight text-ink",
                truncateTitle && "truncate",
              )}
            >
              {title}
            </h1>
            {action && <div className="shrink-0">{action}</div>}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-note leading-snug text-muted">
              {subtitle}
            </p>
          )}
          {children}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {below}
    </header>
  );
}
export function Card({ children, className, as: As = "div" }) {
  return (
    <As
      className={cn(
        "rounded-[--radius] border border-border bg-surface p-4",
        className,
      )}
    >
      {children}
    </As>
  );
}
export function SectionHeader({ title, action, href, cta }) {
  return (
    <div className="mb-1.5 mt-4 flex items-center justify-between gap-2">
      <h2 className="min-w-0 text-note font-semibold uppercase tracking-[0.16em] text-muted">
        {title}
      </h2>
      {action}
      {href && cta && (
        <Link
          href={href}
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 px-2 text-meta font-semibold text-accent-text"
        >
          {cta}
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
/**
 * THE HOUSE DISCLOSURE. One faint line closed, the explanation inside.
 *
 * The app already had this idiom in four hand-rolled copies (MetricGloss, the roster
 * timeline's asset list, the commissioner's pending-picks list, the recap), and the
 * round-8 density audit found the real problem was that it was UNDER-used: paragraphs
 * that a first-time reader needs once were rendering permanently on every visit,
 * several of them for the fourth time in the same app. Editorial writing at the moment
 * of confusion is the identity (D15). The same sentence unconditionally on every
 * revisit is just unmaintained.
 *
 * Native `<details>` on purpose: no JS, no state, works before hydration, keyboard and
 * screen-reader behaviour for free, and it survives a print. `list-none` plus the
 * rotating chevron is what makes it look like this app rather than like a browser.
 */
export function Disclosure({
  summary,
  children,
  icon,
  className,
  bodyClassName,
}) {
  return (
    <details className={cn("group", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-meta font-semibold text-faint transition-colors hover:text-accent-text">
        {icon && (
          <span aria-hidden="true" className="shrink-0">
            {icon}
          </span>
        )}
        {summary}
        <ChevronRight
          size={12}
          aria-hidden="true"
          className="disclosure-chevron shrink-0 group-open:rotate-90"
        />
      </summary>
      <div
        className={cn(
          "disclosure-body mb-2 rounded-[--radius-sm] border border-border bg-surface p-2.5 text-note leading-snug text-muted",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}
/*
 * OPAQUE WASHES, not self-tints.
 *
 * `bg-positive/12 text-positive` is a colour tinting its own ground at 12% alpha, so
 * the pill's effective background is whatever happens to be painted behind it and its
 * contrast cannot be computed at all. That is why an earlier round recorded ~8 of
 * these as "unfixable". globals.css retired the pattern for `accent` and left the
 * other four behind. Each now names an opaque wash and edge composited once in the
 * token file, so every pair below is a real number in every theme.
 *
 * Text on its own wash (dark / paper / contrast):
 *   positive  6.70 / 4.81 / 8.89
 *   negative  4.66 / 5.85 / 6.00
 *   info      5.53 / 5.31 / 8.11
 *   warn      6.47 / 5.04 / 6.50
 */
const toneClasses = {
  neutral: "bg-elevated text-muted border-border",
  accent: "bg-accent-wash text-accent-text border-accent-edge",
  positive: "bg-positive-wash text-positive border-positive-edge",
  negative: "bg-negative-wash text-negative border-negative-edge",
  info: "bg-info-wash text-info border-info-edge",
  warn: "bg-warn-wash text-warn border-warn-edge",
};
export function Tag({ children, tone = "neutral", className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-meta font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
export function Stat({ label, value, sub, tone = "neutral" }) {
  const valueColor =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : tone === "accent"
          ? "text-accent-text"
          : "text-ink";
  return (
    <div className="rounded-[--radius-sm] border border-border bg-surface p-3">
      <div className="text-meta uppercase tracking-wide text-secondary">
        {label}
      </div>
      <div
        className={cn(
          "figure text-display leading-tight font-semibold",
          valueColor,
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-meta text-muted">{sub}</div>}
    </div>
  );
}
export function DeltaValue({ n, suffix }) {
  const tone = n > 0 ? "text-positive" : n < 0 ? "text-negative" : "text-muted";
  const s = n > 0 ? `+${n}` : `${n}`;
  return (
    <span className={cn("figure font-semibold", tone)}>
      {s}
      {suffix}
    </span>
  );
}
export function EmptyState({ icon, title, children, cta }) {
  return (
    <div className="rounded-[--radius] border border-dashed border-border-strong bg-surface p-6 text-center">
      {icon && (
        <div className="mb-3 flex justify-center text-accent-text">{icon}</div>
      )}
      <h3 className="font-display text-lede leading-tight font-semibold text-ink">
        {title}
      </h3>
      {children && (
        <div className="mx-auto mt-1.5 max-w-sm text-body leading-relaxed text-muted">
          {children}
        </div>
      )}
      {cta && (
        <Link
          href={cta.href}
          // min-h-11 (44px) explicitly: the global button rule keys off `button` /
          // role="button", so a bare Link would fall short of the tap-target standard.
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-4 py-2 text-body leading-relaxed font-semibold text-accent-ink"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
export function ButtonLink({ href, children, variant = "primary", className }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-body leading-relaxed font-semibold transition-colors",
        variant === "primary"
          ? "bg-accent text-accent-ink hover:bg-accent-strong"
          : "border border-border text-ink hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </Link>
  );
}
export function SkeletonLine({ className }) {
  return <div className={cn("skeleton h-4 w-full", className)} />;
}
export function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-[--radius] border border-border bg-surface p-4">
      <SkeletonLine className="h-5 w-1/2" />
      <SkeletonLine className="w-3/4" />
      <SkeletonLine className="w-2/3" />
    </div>
  );
}
