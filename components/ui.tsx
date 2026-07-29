import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui";

export function PageHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-5">
      {kicker && (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          {kicker}
        </p>
      )}
      <h1 className="font-display text-3xl font-semibold leading-tight text-ink">
        {title}
      </h1>
      {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
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
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
        {title}
      </h2>
      {action}
    </div>
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
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
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
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className={cn("font-mono text-2xl font-semibold tnum", valueColor)}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
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
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {children && (
        <div className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{children}</div>
      )}
      {cta && (
        <Link
          href={cta.href}
          className="mt-4 inline-flex items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
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
        "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
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
