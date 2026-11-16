import { ButtonLink } from "./Button";

/** Nothing to show yet: an icon, one line of title, one short sentence, one action. */
export function EmptyState({ icon, title, children, cta }) {
  return (
    <div className="rounded-card bg-surface px-5 py-8 text-center">
      {icon && <div className="mb-3 flex justify-center text-accent-text">{icon}</div>}
      <h3 className="text-lede font-semibold text-ink">{title}</h3>
      {children && <div className="mx-auto mt-1.5 max-w-sm text-body text-muted">{children}</div>}
      {cta && (
        <ButtonLink href={cta.href} className="mt-4">
          {cta.label}
        </ButtonLink>
      )}
    </div>
  );
}
