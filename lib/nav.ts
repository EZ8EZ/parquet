/**
 * THE SURFACE REGISTRY - one list of every real destination in the app.
 *
 * Candidate 53's whole point: Home's "Go deeper" grid and League's pill row used to
 * be two independently hand-maintained arrays claiming to be "the deeper pages," and
 * they had already silently diverged - neither included Manager Compare or `/rank`,
 * a fact nobody noticed because there was no single place that would have caught it.
 * This file is that place. Home and League both render their curated shortcuts by
 * filtering THIS array (see `curated: true` below) rather than keeping their own
 * lists, so the two can no longer drift apart, and `/more` renders the whole thing
 * as the one page that promises completeness.
 *
 * Deliberately plain data, no icons: this file has to stay importable from a Server
 * Component and a plain data module alike without pulling in `lucide-react` (see
 * `components/nav-icons.tsx` for the href -> icon side of this, kept separate on
 * purpose - lib/ never imports a UI library anywhere else in this app either).
 *
 * The five bottom-nav tabs are included for completeness (a registry that quietly
 * excluded them would be lying about being the full list) but flagged `primary` so
 * a renderer can de-emphasize "you already have a tab for this."
 */
export interface NavSurface {
  href: string;
  label: string;
  sub: string;
  group: "Primary" | "Your team" | "The league" | "Trading" | "Drafts & values" | "The app";
  /** Already one tap away from anywhere via the bottom tab bar. */
  primary?: true;
  /** Also shown in Home's and League's shortcut lists - see the file header. */
  curated?: true;
}

export const ALL_SURFACES: NavSurface[] = [
  // ---------------------------------------------------------------- primary tabs
  { href: "/", label: "Home", sub: "Today's stat line and what changed", group: "Primary", primary: true },
  { href: "/roster", label: "Roster", sub: "Your own team, valued and tiered", group: "Primary", primary: true },
  { href: "/plan", label: "Plan", sub: "How to improve this team", group: "Primary", primary: true },
  { href: "/trade", label: "Trade", sub: "Build and evaluate a deal", group: "Primary", primary: true },
  { href: "/league", label: "League", sub: "Standings, timelines, everyone's window", group: "Primary", primary: true },

  // ---------------------------------------------------------------- your team
  { href: "/recap", label: "Season recap", sub: "Last season, recapped from what actually happened", group: "Your team", curated: true },
  { href: "/ledger", label: "Decision ledger", sub: "Capture your reasoning at the moment of conviction", group: "Your team", curated: true },

  // ---------------------------------------------------------------- the league
  { href: "/managers", label: "Dossiers", sub: "Scout your rivals", group: "The league", curated: true },
  { href: "/managers/compare", label: "Manager Compare", sub: "Any two managers, side by side", group: "The league", curated: true },
  { href: "/awards", label: "League awards", sub: "Who's who, statistically", group: "The league", curated: true },
  { href: "/commissioner", label: "Commissioner tools", sub: "League health checks and an audit log", group: "The league" },

  // ---------------------------------------------------------------- trading
  { href: "/trade/finder", label: "Trade Finder", sub: "Auto-suggested packages, priced both ways", group: "Trading" },
  { href: "/web", label: "Trade web", sub: "Every trade in the league, connected", group: "Trading", curated: true },

  // ---------------------------------------------------------------- drafts & values
  { href: "/drafts", label: "Draft history", sub: "What your picks became", group: "Drafts & values", curated: true },
  { href: "/drafts/grades", label: "Draft report cards", sub: "Grade every past draft class", group: "Drafts & values" },
  { href: "/values", label: "Asset values", sub: "Players and picks, one model", group: "Drafts & values", curated: true },
  { href: "/rank", label: "Build your own ranking", sub: "Blend your own board against the field's", group: "Drafts & values" },

  // ---------------------------------------------------------------- the app
  { href: "/analyst", label: "The Analyst", sub: "Audit your own thinking", group: "The app", curated: true },
  { href: "/about", label: "What this is", sub: "The premise, both indexes, and why nothing gets a grade", group: "The app" },
  { href: "/methodology", label: "Methodology", sub: "How the values and both indexes actually work", group: "The app" },
  { href: "/settings", label: "Settings", sub: "Theme, and how you view the app", group: "The app" },
  // The front door, and until now the one real surface this registry did not list -
  // which made /more's "if it isn't listed below, it doesn't exist" false about the
  // very page a first-time visitor is now routed to (see lib/auth/entry.ts).
  { href: "/teams", label: "Switch team", sub: "Run the whole app as any manager in the league", group: "The app" },
];

/** Home's and League's shared shortcut set - see the file header for why this is a
 *  filter over the one registry rather than its own list. */
export function curatedSurfaces(): NavSurface[] {
  return ALL_SURFACES.filter((s) => s.curated);
}

/** Everything worth putting on the full index, grouped in registry order. */
export function groupedSurfaces(): { group: NavSurface["group"]; items: NavSurface[] }[] {
  const order: NavSurface["group"][] = [
    "Primary",
    "Your team",
    "The league",
    "Trading",
    "Drafts & values",
    "The app",
  ];
  return order
    .map((group) => ({ group, items: ALL_SURFACES.filter((s) => s.group === group) }))
    .filter((g) => g.items.length > 0);
}
