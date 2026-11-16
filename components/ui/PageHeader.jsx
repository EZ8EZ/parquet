import { cn } from "@/lib/ui";

/**
 * The page title pattern: optional small kicker, a 28px title, at most one line of
 * subtitle. `leading` sits left of the block (an avatar), `aside` top-right (one
 * control), `children` under the subtitle inside the column, `below` full width.
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
  className,
}) {
  return (
    <header className={cn("mb-4", className)}>
      <div className="flex items-center gap-3">
        {leading}
        <div className="min-w-0 flex-1">
          {(kicker || kickerAction) && (
            <div className="flex items-center justify-between gap-3">
              {kicker ? (
                <p className="min-w-0 text-note font-medium text-secondary">{kicker}</p>
              ) : (
                <span />
              )}
              {kickerAction && <div className="shrink-0">{kickerAction}</div>}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <h1
              className={cn(
                "min-w-0 text-display font-bold tracking-tight text-ink",
                truncateTitle && "line-clamp-1",
              )}
            >
              {title}
            </h1>
            {action && <div className="shrink-0">{action}</div>}
          </div>
          {subtitle && <p className="mt-0.5 text-note text-muted">{subtitle}</p>}
          {children}
        </div>
        {aside && <div className="shrink-0 self-start">{aside}</div>}
      </div>
      {below}
    </header>
  );
}
