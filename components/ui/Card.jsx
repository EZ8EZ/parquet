import { cn } from "@/lib/ui";

const TONES = {
  default: "bg-surface",
  raised: "bg-surface-2",
  accent: "bg-accent-wash",
  sunken: "bg-bg",
};
const PADS = { none: "", sm: "p-3", md: "p-4" };

/** A flat, rounded surface. Never nest a Card inside a Card; step the tone instead. */
export function Card({ children, className, as: As = "div", tone = "default", pad = "md", ...rest }) {
  return (
    <As className={cn("rounded-card", TONES[tone], PADS[pad], className)} {...rest}>
      {children}
    </As>
  );
}
