import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fmt, leanView } from "@/lib/lockin/view";

/** A further live decision on Home: one line, opens the full card. */
export function LiveRow({ card, href }) {
  const v = leanView(card.lean);
  const hazard = card.hazards[0];
  return (
    <li>
      <Link href={href} className="flex min-h-11 items-center gap-2 px-3 py-2 hover:bg-surface-2">
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold leading-snug text-ink">
            {card.slotLabel && <span className="mr-1.5 font-mono text-micro text-faint">{card.slotLabel}</span>}
            {card.name}
          </span>
          <span className="block text-micro leading-snug text-muted">
            {hazard ? hazard.text : card.decision.text}
            {v ? ` · leans ${v.value}, ${v.confidence}` : ""}
          </span>
        </span>
        {card.banked != null && <span className="figure shrink-0 text-lede font-semibold text-ink">{fmt(card.banked)}</span>}
        <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-faint" />
      </Link>
    </li>
  );
}
