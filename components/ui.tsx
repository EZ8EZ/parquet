import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/ui";

export function PageHeader({
  kicker,
  title,
  subtitle,
  action,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  /** Optional right-aligned control (e.g. a Sleeper link or methodology pill). */
  action?: ReactNode;
}) {
  return (
    <header className="mb-3">
      {kicker && (
        <p className="text-meta font-semibold uppercase tracking-[0.18em] text-accent">
          {kicker}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 font-display text-display font-semibold leading-tight text-ink">
          {title}
        </h1>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {subtitle && (
        <p className="mt-0.5 text-note leading-snug text-muted">{subtitle}</p>
      )}
    </header>
  );
}

export function Card({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <As
      className={cn(
        "rounded-[--radius] border border-border bg-surface/80 p-4",
        className,
      )}
    >
      {children}
    </As>
  );
}

export function SectionHeader({
  title,
  action,
  href,
  cta,
}: {
  title: string;
  /** Arbitrary right-side control. For the common "link with chevron" case,
   *  pass `href` + `cta` instead. */
  action?: ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="mb-1.5 mt-4 flex items-center justify-between gap-2">
      <h2 className="min-w-0 text-note font-semibold uppercase tracking-[0.16em] text-muted">
        {title}
      </h2>
      {action}
      {href && cta && (
        <Link
          href={href}
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 px-2 text-meta font-semibold text-accent"
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
}: {
  /** The one line that stays visible. Should read as a question or a topic. */
  summary: string;
  children: ReactNode;
  /** Optional leading glyph, sized ~12px, to match MetricGloss's HelpCircle. */
  icon?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <details className={cn("group", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-meta font-semibold text-faint transition-colors hover:text-accent">
        {icon && (
          <span aria-hidden="true" className="shrink-0">
            {icon}
          </span>
        )}
        {summary}
        <ChevronRight
          size={12}
          aria-hidden="true"
          className="shrink-0 transition-transform group-open:rotate-90"
        />
      </summary>
      <div
        className={cn(
          "mb-2 rounded-[--radius-sm] border border-border bg-surface/60 p-2.5 text-note leading-snug text-muted",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}

type Tone = "neutral" | "accent" | "positive" | "negative" | "info" | "warn";
const toneClasses: Record<Tone, string> = {
  neutral: "bg-elevated text-muted border-border",
  accent: "bg-accent/12 text-accent border-accent/25",
  positive: "bg-positive/12 text-positive border-positive/25",
  negative: "bg-negative/12 text-negative border-negative/25",
  info: "bg-info/12 text-info border-info/25",
  warn: "bg-warn/12 text-warn border-warn/25",
};

export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
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

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}) {
  const valueColor =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : tone === "accent"
          ? "text-accent"
          : "text-ink";
  return (
    <div className="rounded-[--radius-sm] border border-border bg-surface/60 p-3">
      <div className="text-meta uppercase tracking-wide text-faint">{label}</div>
      <div className={cn("font-mono text-display leading-tight font-semibold tnum", valueColor)}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-meta text-muted">{sub}</div>}
    </div>
  );
}

export function DeltaValue({ n, suffix }: { n: number; suffix?: string }) {
  const tone = n > 0 ? "text-positive" : n < 0 ? "text-negative" : "text-muted";
  const s = n > 0 ? `+${n}` : `${n}`;
  return (
    <span className={cn("font-mono tnum font-semibold", tone)}>
      {s}
      {suffix}
    </span>
  );
}

export function Divider() {
  return <div className="rule my-5" />;
}

export function EmptyState({
  icon,
  title,
  children,
  cta,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="rounded-[--radius] border border-dashed border-border-strong bg-surface/40 p-6 text-center">
      {icon && <div className="mb-3 flex justify-center text-accent">{icon}</div>}
      <h3 className="font-display text-lede leading-tight font-semibold text-ink">{title}</h3>
      {children && (
        <div className="mx-auto mt-1.5 max-w-sm text-body leading-relaxed text-muted">{children}</div>
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

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-body leading-relaxed font-semibold transition-colors",
        variant === "primary"
          ? "bg-accent text-accent-ink hover:bg-accent/90"
          : "border border-border text-ink hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} />;
}

export function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-[--radius] border border-border bg-surface/60 p-4">
      <SkeletonLine className="h-5 w-1/2" />
      <SkeletonLine className="w-3/4" />
      <SkeletonLine className="w-2/3" />
    </div>
  );
}
