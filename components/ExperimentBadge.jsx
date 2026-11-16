import { FlaskConical } from "lucide-react";
import { Chip } from "@/components/ui";
/**
 * The Lab's marker. Every experimental surface wears one, in the house idiom
 * (a warn `Chip` with its icon, sentence case) rather than inventing a new visual language for
 * being unfinished.
 *
 * Its own component rather than a shared "beta" one: the trade web's `BetaBadge` was
 * the precedent, but it belongs to a component that is on its way out, and a badge
 * that says EXPERIMENT is making a stronger claim than one that says Beta. Beta means
 * "rough". This means "may be wrong, may vanish".
 */
export function ExperimentBadge() {
  return (
    <Chip tone="warn" icon={FlaskConical}>
      Experiment
    </Chip>
  );
}
