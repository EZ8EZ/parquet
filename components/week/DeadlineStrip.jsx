import { List, ListRow, SectionHeader } from "@/components/ui";
import { formatDay } from "@/lib/week";

function whenText(d, window) {
  if (d.weeksAway == null) return `Week ${d.week}`;
  if (d.weeksAway === 0) {
    if (window?.state === "live" && window.daysLeft === 0) return "Tonight";
    return window?.end ? `This week, ${formatDay(window.end)}` : "This week";
  }
  if (d.weeksAway === 1) return "Next week";
  return `In ${d.weeksAway} weeks`;
}

/** League deadlines still ahead, nearest first. Renders nothing when none are ahead. */
export function DeadlineStrip({ deadlines, window }) {
  if (!deadlines?.length) return null;
  return (
    <section aria-labelledby="deadlines-title">
      <SectionHeader id="deadlines-title" title="Deadlines ahead" />
      <List>
        {deadlines.map((d) => (
          <li key={d.id}>
            <ListRow title={d.label} meta={`${d.at === "end" ? "End of week" : "Week"} ${d.week}`} value={whenText(d, window)} />
          </li>
        ))}
      </List>
    </section>
  );
}
