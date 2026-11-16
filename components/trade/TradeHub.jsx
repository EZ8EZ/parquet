import Link from "next/link";
import { BookText, ChevronRight, Handshake, Scale } from "lucide-react";
import { TeamAvatar } from "@/components/TeamAvatar";

const JOBS = [
  {
    href: "/trade/finder",
    icon: Handshake,
    title: "Find a deal",
    sub: "Named packages, priced both ways",
  },
  {
    href: "#check",
    icon: Scale,
    title: "Check a deal",
    sub: "Put both sides on one value scale",
  },
  {
    href: "/values",
    icon: BookText,
    title: "Look up a value",
    sub: "Any player or pick, model and market",
  },
];

/** The Trade tab's first screen: the three jobs, one tap each. */
export function TradeJobs() {
  return (
    <ul aria-label="Trade jobs" className="space-y-1.5">
      {JOBS.map((j) => (
        <li key={j.title}>
          <Link
            href={j.href}
            className="card-lit flex min-h-14 items-center gap-3 rounded-[--radius] border border-border bg-surface px-3 py-2.5 transition-colors hover:border-accent-edge hover:bg-surface-2"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-accent-edge bg-accent-wash text-accent-text">
              <j.icon size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lede font-semibold leading-tight text-ink">
                {j.title}
              </span>
              <span className="block text-meta leading-snug text-secondary">{j.sub}</span>
            </span>
            <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-faint" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Every other manager as an avatar linking to their dossier. */
export function PartnersRow({ partners }) {
  if (!partners?.length) return null;
  return (
    <section aria-labelledby="partners-title" className="mt-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h2
          id="partners-title"
          className="text-note font-semibold uppercase tracking-[0.16em] text-muted"
        >
          Partners
        </h2>
        <Link
          href="/managers"
          className="-mr-2 inline-flex min-h-11 items-center gap-0.5 px-2 text-meta font-semibold text-accent-text"
        >
          All dossiers
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      </div>
      <ul className="grid grid-cols-7 gap-1">
        {partners.map((p) => (
          <li key={p.rosterId}>
            <Link
              href={`/managers/${p.rosterId}`}
              aria-label={`${p.name}: dossier`}
              title={p.name}
              className="flex min-h-11 items-center justify-center rounded-full transition-opacity hover:opacity-80"
            >
              <TeamAvatar
                name={p.name}
                avatarId={p.avatarId}
                teamLogoUrl={p.teamLogoUrl}
                size="md"
                className="rounded-full"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
