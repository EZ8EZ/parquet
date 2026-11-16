import { cn } from "@/lib/ui";

/**
 * Where one rank sits in a field: one tick per team, yours taller and in the accent.
 * Height and position carry the rank, so colour is never the only cue. Decorative:
 * the rank must also be printed beside it. Up to 20 teams.
 */
export function RankStrip({ rank, of, className }) {
  if (!rank || !of || of > 20) return null;
  return (
    <span aria-hidden="true" className={cn("flex h-4 items-end gap-[3px]", className)}>
      {Array.from({ length: of }, (_, i) => (
        <span
          key={i}
          className={cn("flex-1 rounded-[2px]", i + 1 === rank ? "h-4 bg-accent" : "h-2 bg-border-strong")}
        />
      ))}
    </span>
  );
}
