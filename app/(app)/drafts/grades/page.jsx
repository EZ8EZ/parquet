import Link from "next/link";
import { ChevronLeft, GraduationCap } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getPrincipals } from "@/lib/principals";
import { seasonDraftGrades } from "@/lib/metrics/draftGrades";
import { Disclosure, PageHeader, EmptyState } from "@/components/ui";
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
        className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-note font-semibold text-secondary transition-colors hover:text-accent-text"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Drafts
      </Link>

      <PageHeader
        kicker="Draft report cards"
        title="How every draft graded"
        subtitle="Each pick against the players still on the board"
      />
      <Disclosure summary="Hindsight pricing">
        Every completed draft, graded pick by pick against the players still on the board when each pick was made,
        valued at today&apos;s numbers, not what was knowable on draft day.
      </Disclosure>

      {grades.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={28} />}
          title="No drafts to grade yet"
        >
          {!h.currentLeague
            ? "This data source doesn't expose drafts."
            : "No completed draft has enough picks behind it to grade yet."}
        </EmptyState>
      ) : (
        <div className="mt-2 space-y-3">
          {grades.map((g) => (
            <DraftReportCard
              key={g.draftId}
              h={h}
              principals={principals}
              grade={g}
            />
          ))}
        </div>
      )}
      <Onward from="/drafts/grades" />
    </div>
  );
}
