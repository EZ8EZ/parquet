import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, de-duplicating Tailwind utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Compact signed number, e.g. +3 / -2 / 0. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Format a valuation number with a thin separator. */
export function fmtValue(n: number): string {
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
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
