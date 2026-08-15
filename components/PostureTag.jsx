import { Circle, Diamond, Hexagon, Square, Triangle } from "lucide-react";
import { Tag } from "./ui";
import { cn } from "@/lib/ui";
/*
 * POSTURE IS A CATEGORY, NOT A GRADE.
 *
 * Six copies of the same map had grown across the app, all of them spelling posture
 * as a semantic tone:
 *
 *   contending: "accent", ascending: "positive", rebuilding: "info",
 *   straddling: "negative"
 *
 * Two things are wrong with that, and both of them are decisions this app already
 * made in writing.
 *
 * D6 says the app grades nothing - it states theses, not verdicts. `--color-negative`
 * is a pass/fail token: it is the colour of a number below zero, of an injury, of an
 * armed destructive button. Painting `straddling` with it asserts that a straddling
 * roster is BAD. The app does not believe that and its own copy says the opposite:
 * straddling is a roster whose assets disagree about when they win, which is a
 * position, not a failure. `ascending` in green makes the matching claim in reverse.
 * A reader learns the grade from the colour in half a second and never reads the
 * sentence underneath that refuses to give one.
 *
 * The second problem is that gold means "you" everywhere else in this app - the whole
 * accent-wash system exists to say viewer-owned - so `contending: accent` spends the
 * one reserved hue on a category that has nothing to do with the viewer.
 *
 * The replacement is deliberately colourless. All five postures render in the neutral
 * tone, and the distinction is carried by a GLYPH plus the word itself, which was
 * always printed beside the pill anyway. Pure geometry, chosen because none of these
 * shapes carries a valence: nobody reads a square as worse than a triangle. It also
 * survives every form of colour blindness and the paper theme for free, and it needs
 * no new tokens, so there is nothing new to measure. The neutral tone is the already
 * measured `bg-elevated` / `text-muted` pair.
 */
const POSTURE_GLYPH = {
  contending: Circle,
  ascending: Triangle,
  rebuilding: Square,
  straddling: Diamond,
  balanced: Hexagon,
};
/** The bare glyph, for the places that print the posture word inline without a pill. */
export function PostureGlyph({ posture, className }) {
  const Icon = posture ? POSTURE_GLYPH[posture] : undefined;
  if (!Icon) return null;
  return (
    <Icon
      size={9}
      aria-hidden={true}
      className={cn("inline-block shrink-0 align-baseline", className)}
    />
  );
}
/**
 * A posture pill. `children` overrides the label for the one caller that prints a TCI
 * figure in the pill and the posture word beside it.
 */
export function PostureTag({ posture, children, className }) {
  return (
    <Tag tone="neutral" className={className}>
      <PostureGlyph posture={posture} />
      {children ?? posture ?? "unread"}
    </Tag>
  );
}
