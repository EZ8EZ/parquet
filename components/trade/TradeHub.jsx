import Link from "next/link";
import { BookText, Handshake, Scale } from "lucide-react";
import { List, ListRow, SectionHeader } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";

const JOBS = [
  { href: "/trade/finder", icon: Handshake, title: "Find a deal", sub: "Named packages, priced both ways" },
  { href: "#check", icon: Scale, title: "Check a deal", sub: "Both sides on one value scale" },
  { href: "/values", icon: BookText, title: "Look up a value", sub: "Any player or pick" },
];

/** The Trade tab's first screen: the three jobs, one tap each. */
export function TradeJobs() {
  return (
    <List aria-label="Trade jobs">
      {JOBS.map((j) => (
        <li key={j.title}>
          <ListRow
            href={j.href}
            avatar={
              <span className="flex size-10 items-center justify-center rounded-full bg-accent-wash text-accent-text">
                <j.icon size={18} aria-hidden="true" />
              </span>
            }
            title={j.title}
            meta={j.sub}
          />
        </li>
      ))}
    </List>
  );
}

/** Every other manager as an avatar linking to their dossier. */
export function PartnersRow({ partners }) {
  if (!partners?.length) return null;
  return (
    <section aria-labelledby="partners-title">
      <SectionHeader id="partners-title" title="Partners" href="/managers" cta="All dossiers" />
      <ul className="grid grid-cols-7 gap-1 rounded-card bg-surface p-2">
        {partners.map((p) => (
          <li key={p.rosterId}>
            <Link
              href={`/managers/${p.rosterId}`}
              title={p.name}
              className="flex min-h-11 items-center justify-center rounded-full transition-colors hover:bg-surface-2"
            >
              <TeamAvatar
                name={p.name}
                avatarId={p.avatarId}
                teamLogoUrl={p.teamLogoUrl}
                size="md"
                className="rounded-full"
              />
              {/* The avatar is the whole face of this link and is decorative (an
                  aria-hidden monogram or an alt="" logo), so the name is this text. */}
              <span className="sr-only">{p.name}: dossier</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
