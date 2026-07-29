import { PageHeader } from "@/components/ui";
import { AnalystChat } from "@/components/AnalystChat";

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
    </div>
  );
}
