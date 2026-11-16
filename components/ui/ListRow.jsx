import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/ui";

/** A rounded group of rows separated by hairlines. Children are <li> or ListRow. */
export function List({ children, className, as: As = "ul", ...rest }) {
  return (
    <As className={cn("divide-y divide-border overflow-hidden rounded-card bg-surface", className)} {...rest}>
      {children}
    </As>
  );
}

/**
 * One tappable row: [leading] [avatar] title / meta ... value / valueSub [chevron].
 * Names wrap, never truncate (D111). `href` makes it a link; inside a Sheet trigger
 * pass `as="span"` so it nests in the trigger button. `highlight` marks the viewer's
 * own row (accent wash + a "You" chip supplied by the caller, never colour alone).
 */
export function ListRow({
  href,
  as,
  leading,
  avatar,
  title,
  meta,
  badge,
  value,
  valueSub,
  chevron,
  highlight,
  className,
  children,
  ...rest
}) {
  const showChevron = chevron ?? Boolean(href);
  const inner = (
    <>
      {leading != null && (
        <span className="w-6 shrink-0 text-right figure text-note font-semibold text-secondary">
          {leading}
        </span>
      )}
      {avatar && <span className="shrink-0">{avatar}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="min-w-0 text-body font-semibold text-ink [overflow-wrap:normal]">
            {title}
          </span>
          {badge}
        </span>
        {meta && <span className="mt-0.5 block text-meta text-secondary">{meta}</span>}
        {children}
      </span>
      {value != null && (
        <span className="shrink-0 text-right">
          <span className="block figure text-body font-bold text-ink">{value}</span>
          {valueSub && <span className="block text-meta text-secondary">{valueSub}</span>}
        </span>
      )}
      {showChevron && <ChevronRight size={18} aria-hidden="true" className="-mr-1 shrink-0 text-faint" />}
    </>
  );
  const cls = cn(
    "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left",
    highlight && "bg-accent-wash",
    (href || as === "span") && "transition-colors hover:bg-surface-2",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls} {...rest}>
        {inner}
      </Link>
    );
  }
  const As = as ?? "div";
  return (
    <As className={cls} {...rest}>
      {inner}
    </As>
  );
}
