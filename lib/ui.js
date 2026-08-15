import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
/**
 * `tailwind-merge` HAS TO BE TOLD ABOUT THE TYPE SCALE, or it silently deletes it.
 *
 * The scale in globals.css is named for the job each step does (`text-body`,
 * `text-meta`, `text-display`, ...) rather than for its size. tailwind-merge resolves
 * conflicts from a built-in table it cannot extend by reading our CSS, and in that
 * table `text-<word>` is a COLOUR - so `cn("text-display", ok ? "text-positive" :
 * "text-negative")` looked like two colours to it and it dropped the size. The class
 * vanished from the output entirely: no error, no warning, just 16px where 25px was
 * asked for, and only in the call sites that use `cn` with a conditional colour.
 * (Found on the Desk's destination labels, which rendered at 16px; the same silent
 * drop was already live in TradeBuilder, StreakPanel, ui.tsx and drafts/parts.tsx.)
 *
 * Registering the six names as font sizes is the whole fix, and it belongs here
 * rather than at each call site: the alternative is remembering, forever, never to
 * put a size and a colour in the same `cn()`.
 */
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["micro", "meta", "note", "body", "lede", "display"] },
      ],
    },
  },
});
/** Merge conditional class names, de-duplicating Tailwind utilities. */
export function cn(...inputs) {
  return merge(clsx(inputs));
}
/** Compact signed number, e.g. +3 / -2 / 0. */
export function signed(n) {
  return n > 0 ? `+${n}` : `${n}`;
}
/** Format a valuation number with a thin separator. */
export function fmtValue(n) {
  return n.toLocaleString("en-US");
}
/**
 * Fold diacritics and case for matching, so "jokic" finds Jokić and "sengun"
 * finds Şengün. The one shared implementation - this had drifted into three
 * near-identical private copies (the search route, /values' filter, the trade
 * builder's picker) before being pulled up here, flagged by two integration
 * reviews in a row. Any surface that matches a typed query against a name
 * should call this, not re-fold its own: the moment two folds disagree, the
 * same query finds a player in one place and not another.
 */
export function fold(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
