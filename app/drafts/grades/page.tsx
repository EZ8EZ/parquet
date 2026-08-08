import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getPrincipals } from "@/lib/principals";
import { seasonDraftGrades } from "@/lib/metrics/draftGrades";
import { PageHeader, EmptyState } from "@/components/ui";
import { DraftReportCard } from "@/components/DraftReportCard";
import { Onward } from "@/components/Onward";

export const dynamic = "force-dynamic";

export default async function DraftGradesPage() {
  const h = await getLeagueHistory();
  const principals = await getPrincipals(h);
  const grades = await seasonDraftGrades(h, principals);

  return (
    <div>
      {/* Negative margin keeps the 44px tap target from adding visual space. */}
      <Link
        href="/drafts"
        className="-ml-1 -mt-3 mb-0.5 inline-flex min-h-11 items-center gap-1.5 px-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        Pick lineage
      </Link>

      <PageHeader
        kicker="Draft report cards"
        title="How every draft graded"
        subtitle="Every completed draft, graded pick by pick against the players still on the board when each pick was made. Hindsight pricing: valued at today's numbers, not what was knowable on draft day."
      />

      {grades.length === 0 ? (
        <EmptyState icon={<GraduationCap size={28} />} title="No drafts to grade yet">
          {!h.currentLeague
            ? "This data source doesn't expose drafts."
            : "No completed draft has enough picks behind it to grade yet."}
        </EmptyState>
      ) : (
        <div className="mt-3 space-y-2.5">
          {grades.map((g) => (
            <DraftReportCard key={g.draftId} h={h} principals={principals} grade={g} />
          ))}
        </div>
      )}
      <Onward from="/drafts/grades" />
    </div>
  );
}
