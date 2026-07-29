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
