import Link from "next/link";
import { ChevronRight, FlaskConical } from "lucide-react";
import { PageHeader, Card } from "@/components/ui";
import { ExperimentBadge } from "@/components/ExperimentBadge";
import { EXPERIMENTS } from "@/lib/lab";
import { Onward } from "@/components/Onward";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "The Lab - Parquet",
  description: "Experimental surfaces. Reachable, unfinished, and honest about it.",
};

export default function LabPage() {
  return (
    <div>
      <PageHeader
        kicker="The Lab"
        title="Ideas being tested"
        subtitle="Nothing here has earned a place in the app yet."
        action={<ExperimentBadge />}
      />

      <Card className="mt-1">
        <p className="text-body leading-relaxed text-muted">
          A lab is where a claim gets tried before it gets made. Everything below is
          built on real league data, and every one of them can still be wrong: the
          method may not hold, the number may not mean what it looks like, and the page
          may be deleted in the next round rather than fixed.
        </p>
        <p className="mt-2 text-body leading-relaxed text-muted">
          Each experiment names its own biggest doubt. Read the doubt first.
        </p>
      </Card>

      <div className="mt-4 space-y-2">
        {EXPERIMENTS.map((e) => (
          <Link
            key={e.slug}
            href={e.href}
            className="block rounded-[--radius] border border-border bg-surface p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2"
          >
            <div className="flex items-start gap-2.5">
              <FlaskConical
                size={16}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-accent-text"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lede font-semibold leading-tight text-ink">
                    {e.title}
                  </h2>
                  <ChevronRight
                    size={14}
                    aria-hidden="true"
                    className="mt-1 shrink-0 text-faint"
                  />
                </div>
                <p className="mt-1 text-note leading-snug text-muted">{e.premise}</p>
                <p className="mt-1.5 text-meta leading-snug text-secondary">
                  <span className="font-semibold uppercase tracking-[0.14em] text-warn">
                    Doubt
                  </span>{" "}
                  {e.doubt}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-5 text-meta leading-snug text-secondary">
        The Lab sits one tap off the main path on purpose. It has a single entry on the
        full index and appears nowhere else, so an unfinished idea cannot crowd a
        finished one.
      </p>
      <Onward from="/lab" />
    </div>
  );
}
