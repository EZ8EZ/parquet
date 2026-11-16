/**
 * THE TWO-SIDED RECEIPT - one deal as one printed document, N columns of the same
 * ledger (VISION M6, and Part 2's 2K lesson: a deal reads as two simultaneous
 * books, not one number).
 *
 * Each side is a column of ledger lines - asset name, dotted leader, price - over
 * a ruled total, so "what each side is worth today" reads the way a till receipt
 * does instead of the way a bar chart does. The columns are typeset identically on
 * purpose: any asymmetry of treatment between the two sides would be a verdict
 * wearing a layout (D6). The reader does the comparing; the document only prints.
 *
 * WHAT A NULL PRICE PRINTS. A pick is never priced here (D24: the totals are
 * players-only, and a commissioner deal has no pick record at all - D19), and a
 * player the model cannot price is listed rather than scored zero. Both set an em
 * dash in the price column: the gap is ON the receipt, where hiding the line would
 * have made the total look more complete than it is.
 *
 * NEUTRAL BY DEFAULT. Gold means "yours" product-wide, and a deal between two
 * OTHER managers has no "yours" side - so the only colour this component ever
 * spends is the accent on a side the viewer actually owns (`isMe`), exactly the
 * treatment their name already gets on the deal index. No court blue either: the
 * receipt is not a you-against-the-field comparison, it is a document.
 *
 * DELIBERATELY LINK-FREE and presentation-only, so it can sit inside a Link (the
 * deal index's headline card does) and so the trade evaluator's result can adopt
 * it unchanged when that wave lands (VISION M5's receipt note) - the evaluator
 * only has to build `sides` and render.
 *
 * @param {{
 *   sides: Array<{
 *     key: string|number,
 *     name: string,
 *     isMe?: boolean,
 *     lines: Array<{ key: string, label: string, value: number|null, note?: string|null }>,
 *     total: number,
 *   }>,
 *   dense?: boolean,
 *   className?: string,
 * }} props `value: null` means "listed, unpriced" - never zero. `total` is the
 *   caller's own priced sum so this component can never disagree with the page
 *   that computed it.
 */
import { cn, fmtValue } from "@/lib/ui";

export function DealReceipt({ sides, dense = false, className }) {
  if (!sides || sides.length === 0) return null;
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {sides.map((s, i) => (
        <div
          key={s.key}
          className={cn(
            "flex min-w-0 flex-col rounded-control bg-surface-2",
            dense ? "p-2.5" : "p-3",
            // A third party in a multi-team deal takes its own full-width row
            // rather than a squeezed third column.
            i === sides.length - 1 && sides.length % 2 === 1 && i >= 2 ? "col-span-2" : undefined,
          )}
        >
          <p className={cn("text-note font-semibold", s.isMe ? "text-accent-text" : "text-ink")}>{s.name}</p>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className={cn("figure font-bold text-ink", dense ? "text-body" : "text-lede")}>
              {fmtValue(Math.round(s.total))}
            </span>
            <span className="text-meta text-secondary">today</span>
          </p>
          {/* Plain divs, not a <ul>: the deal index counts one <li> per DEAL (its e2e
              contract) and this component can nest inside one of them. */}
          <div className={cn("mt-2 flex-1", dense ? "space-y-1" : "space-y-1.5")}>
            {s.lines.map((l) => (
              <div key={l.key}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 text-note text-ink">{l.label}</span>
                  {l.value != null ? (
                    <span className="figure shrink-0 text-meta text-secondary">{fmtValue(l.value)}</span>
                  ) : (
                    <span className="shrink-0 text-meta text-secondary">
                      <span aria-hidden="true">&mdash;</span>
                      <span className="sr-only">unpriced</span>
                    </span>
                  )}
                </span>
                {l.note && <span className="block text-meta text-secondary">{l.note}</span>}
              </div>
            ))}
            {s.lines.length === 0 && <div className="text-meta text-secondary">nothing recorded incoming</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
