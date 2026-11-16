import { cn } from "@/lib/ui";
import { ButtonLink } from "./Button";

const ICON_TONES = {
  accent: "text-accent-text",
  neutral: "text-secondary",
  positive: "text-positive",
  negative: "text-negative",
  warn: "text-warn",
  info: "text-info",
};

/**
 * Nothing to show yet: an icon, one line of title, one short sentence, one action.
 * `cta` = { href, label, variant? } renders a link button; `action` takes any node
 * (a client `<Button onClick>`, two buttons in a row) when a link is not enough.
 * `tone` colours only the icon, which always sits beside the title text.
 * `as` sets the title's heading tag (h3 by default; an error or 404 page passes h1).
 */
export function EmptyState({ icon, title, children, cta, action, tone = "accent", as: Title = "h3", className }) {
  return (
    <div className={cn("rounded-card bg-surface px-5 py-8 text-center", className)}>
      {icon && <div className={cn("mb-3 flex justify-center", ICON_TONES[tone] ?? ICON_TONES.accent)}>{icon}</div>}
      <Title className="text-lede font-semibold text-ink">{title}</Title>
      {children && <div className="mx-auto mt-1.5 max-w-sm text-body text-muted">{children}</div>}
      {cta && (
        <ButtonLink href={cta.href} variant={cta.variant} className="mt-4">
          {cta.label}
        </ButtonLink>
      )}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
