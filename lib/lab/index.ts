/**
 * THE LAB - experiments that are reachable but deliberately out of the main flow.
 *
 * Everything listed here is unfinished by construction. A lab entry is a claim the
 * app is TESTING, not one it has settled, and the copy on /lab says so in those
 * words. The registry is plain data for the same reason `lib/nav.ts` is: it has to
 * stay importable from a Server Component without dragging a UI library behind it.
 *
 * The Lab has exactly ONE entry in the surface registry (`/lab`, group "The app",
 * not curated, not primary), so it appears on /more and nowhere else. Individual
 * experiments are deliberately NOT registered there - a surface that promises
 * completeness should not be filled with things that may be wrong or may vanish.
 */

export interface Experiment {
  slug: string;
  href: string;
  title: string;
  /** One line. What it shows. */
  premise: string;
  /**
   * The single biggest reason this might be wrong. Every experiment has to name
   * one; an experiment whose author cannot think of one is not an experiment.
   */
  doubt: string;
}

export const EXPERIMENTS: Experiment[] = [
  {
    slug: "counterfactual",
    href: "/lab/counterfactual",
    title: "The roster you never kept",
    premise:
      "Your startup haul and every pick you were born with, resolved forward to today, priced against what you actually hold.",
    doubt:
      "It credits you with the player who was actually taken with your pick, not the one you would have taken.",
  },
  {
    slug: "regret",
    href: "/lab/regret",
    title: "The regret ledger",
    premise:
      "Seven lock-in slots a week. What you banked, against the best games your roster produced.",
    doubt:
      "Hindsight is not foresight. Nothing here was knowable on the night, and an unbanked game is not a mistake.",
  },
];
