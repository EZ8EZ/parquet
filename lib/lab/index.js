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
export const EXPERIMENTS = [
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
  {
    slug: "leverage",
    href: "/lab/leverage",
    title: "Where you can actually deal from",
    premise:
      "Your value against the league's own mix, position by position: where you hold real trade leverage, and where you're exposed with nothing to offer back.",
    doubt:
      "Pure supply-side read - it has no idea whether any of the other thirteen managers actually want what you're overweight in.",
  },
  {
    slug: "pulse",
    href: "/lab/pulse",
    title: "The pulse",
    premise:
      "Every trade, every pick that resolved into a player, and every roster whose TCI or Fragility crossed a real threshold - across all 14 rosters, since you were last here.",
    doubt:
      "The baseline is your own last visit, floored at twelve hours - two managers open this at different times and see two different windows, and it can lag a real move by a few hours on purpose.",
  },
  // "The start line" (/lab/startline) sat here until the committee review of
  // 2026-08-10 shelved it - see SHELVED.md, S1. Its slot-par distribution survived
  // and now renders on /lab/regret, which already read the same lineups.
];
