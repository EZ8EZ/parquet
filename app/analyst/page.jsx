import { PageHeader } from "@/components/ui";
import { AnalystChat } from "@/components/AnalystChat";
import { Onward } from "@/components/Onward";
export const dynamic = "force-dynamic";
export default function AnalystPage() {
  return (
    <div>
      <PageHeader
        kicker="The Analyst"
        title="Your adversarial auditor"
        subtitle="It has your full history in context and is built to disagree with you when the record warrants it."
      />
      <AnalystChat />
      {/* One of the four surfaces measured with zero outbound links. An argument that
            changes your mind and then leaves you nowhere to act on it was the whole
            problem: every step below is somewhere the conclusion can be spent. */}
      <Onward from="/analyst" />
    </div>
  );
}
