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
    <div
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-[--radius-sm] border border-border bg-surface",
        className,
      )}
    >
      {sides.map((s, i) => (
        <div
          key={s.key}
          className={cn(
            "flex flex-col",
            dense ? "p-2" : "p-2.5",
            // Printed-matter rules between columns and rows, drawn on the cells
            // so a third party in a multi-team deal wraps into its own full-width
            // row of the same document rather than into a squeezed third column.
            i % 2 === 1 && "border-l border-border",
            i >= 2 && "border-t border-border",
            i === sides.length - 1 && sides.length % 2 === 1 && i >= 2
              ? "col-span-2"
              : undefined,
          )}
        >
          <p
            className={cn(
              "font-display text-body font-semibold leading-snug line-clamp-2",
              s.isMe ? "text-accent-text" : "text-ink",
            )}
          >
            {s.name}
          </p>
          {/* Plain divs, not a <ul>: a receipt's lines are rows of a document,
              and the deal index counts one <li> per DEAL (its e2e contract) with
              this whole component nested inside one of them. */}
          <div className={cn("mt-1.5 flex-1", dense ? "space-y-0.5" : "space-y-1")}>
            {s.lines.map((l) => (
              <div key={l.key}>
                <span className="flex items-baseline gap-1">
                  {/* line-clamp, never mid-word truncate, on a name (the standing
                      truncation rule - VISION kill-list #8). */}
                  <span className="min-w-0 text-meta leading-snug text-ink line-clamp-1">
                    {l.label}
                  </span>
                  <span
                    aria-hidden="true"
                    className="mb-[3px] min-w-3 flex-1 self-end border-b border-dotted border-border"
                  />
                  {l.value != null ? (
                    <span className="figure shrink-0 text-meta leading-snug text-ink">
                      {fmtValue(l.value)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-meta leading-snug text-faint">
                      <span aria-hidden="true">&mdash;</span>
                      <span className="sr-only">unpriced</span>
                    </span>
                  )}
                </span>
                {l.note && (
                  <span className="block text-meta leading-snug text-secondary line-clamp-1">
                    {l.note}
                  </span>
                )}
              </div>
            ))}
            {s.lines.length === 0 && (
              <div className="text-meta leading-snug text-secondary">
                nothing recorded incoming
              </div>
            )}
          </div>
          <div
            className={cn(
              "mt-1.5 flex items-baseline justify-between gap-1 border-t border-border-strong",
              dense ? "pt-1" : "pt-1.5",
            )}
          >
            <span className="text-micro uppercase tracking-wide text-secondary">
              today
            </span>
            <span
              className={cn(
                "figure font-semibold leading-tight text-ink",
                dense ? "text-body" : "text-lede",
              )}
            >
              {fmtValue(Math.round(s.total))}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
