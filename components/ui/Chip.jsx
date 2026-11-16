import { cn } from "@/lib/ui";

/** Opaque wash + edge + text per tone; every pair is >= 4.5:1 (DESIGN.md). */
export const CHIP_TONES = {
  neutral: "bg-elevated text-muted border-transparent",
  accent: "bg-accent-wash text-accent-text border-accent-edge",
  positive: "bg-positive-wash text-positive border-positive-edge",
  negative: "bg-negative-wash text-negative border-negative-edge",
  info: "bg-info-wash text-info border-info-edge",
  warn: "bg-warn-wash text-warn border-warn-edge",
};

/**
 * A status chip. Colour never carries meaning alone: the chip always has a text
 * label, and status tones should pass an `icon` (a lucide component) as well.
 */
export function Chip({ children, tone = "neutral", icon: Icon, size = "md", className, title }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold",
        size === "sm" ? "px-2 py-px text-micro" : "px-2.5 py-0.5 text-meta",
        CHIP_TONES[tone] ?? CHIP_TONES.neutral,
        className,
      )}
    >
      {Icon && <Icon size={size === "sm" ? 11 : 13} aria-hidden="true" className="shrink-0" />}
      {children}
    </span>
  );
}

/** The old name. Same component. */
export const Tag = Chip;
