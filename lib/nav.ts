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
 * `primary` IS THE DESTINATION ROW. The Desk (components/Desk.tsx) renders its four
 * destination slots by filtering this array on that flag - it does not keep a list of
 * its own. It used to: `BottomNav.tsx` hand-maintained a `TABS` array, and by the time
 * the Desk replaced it that array had already drifted from this file in two directions
 * at once. This header claimed "five bottom-nav tabs" while the bar shipped six, and
 * the sixth (`/more`) was a tab that the registry did not list at all - which made
 * /more's own promise ("if it isn't listed below, it doesn't exist yet") false about
 * the very page printing it. Both are fixed here, and the second array is gone, so
 * neither can recur.
 *
 * `group === "Primary"` is the same set as `primary`, pinned by nav.test.ts: a surface
 * with a permanent slot is listed under Primary in the index and nowhere else, so the
 * drawer never advertises a destination twice.
 */
export interface NavSurface {
  href: string;
  label: string;
  sub: string;
  group: "Primary" | "Your team" | "The league" | "Trading" | "Drafts & values" | "The app";
  /** Has a permanent destination slot on the Desk. Equivalent to `group: "Primary"`. */
  primary?: true;
  /** The Desk's destination row is 1/4 of a 390pt screen wide, so a slot label has
   *  to be one short word. Only `primary` surfaces need one. */
  short?: string;
  /** Also shown in Home's and League's shortcut lists - see the file header. */
  curated?: true;
}

export const ALL_SURFACES: NavSurface[] = [
  // ------------------------------------------------------- the destination slots
  // Four, and the fourth is the ledger rather than the league. The Desk's row asks
  // "what are you here to do" - look at today, at the team, at the decision in front
  // of you, or at the record of decisions already made - and capturing reasoning is
  // the one of those the app exists for. The league standings are a thing you read,
  // not a thing you do, they change once a week at most, and Home's Record figure has
  // always linked straight there. Trade lost its slot to the same argument: it is
  // where a plan gets executed, so it is reached from /plan and from the drawer.
  { href: "/", label: "Home", short: "Today", sub: "Today's stat line and what changed", group: "Primary", primary: true },
  { href: "/roster", label: "Roster", short: "Team", sub: "Your own team, valued and tiered", group: "Primary", primary: true },
  { href: "/plan", label: "Plan", short: "Decide", sub: "How to improve this team", group: "Primary", primary: true },
  { href: "/ledger", label: "Decision ledger", short: "Record", sub: "Capture your reasoning at the moment of conviction", group: "Primary", primary: true },

  // ---------------------------------------------------------------- your team
  { href: "/recap", label: "Season recap", sub: "Last season, recapped from what actually happened", group: "Your team", curated: true },

  // ---------------------------------------------------------------- the league
  { href: "/league", label: "League", sub: "Standings, timelines, everyone's window", group: "The league" },
  { href: "/managers", label: "Dossiers", sub: "Scout your rivals", group: "The league", curated: true },
  { href: "/managers/compare", label: "Manager Compare", sub: "Any two managers, side by side", group: "The league", curated: true },
  { href: "/awards", label: "League awards", sub: "Who's who, statistically", group: "The league", curated: true },
  { href: "/commissioner", label: "Commissioner tools", sub: "League health checks and an audit log", group: "The league" },

  // ---------------------------------------------------------------- trading
  { href: "/trade", label: "Trade", sub: "Build and evaluate a deal", group: "Trading", curated: true },
  { href: "/trade/finder", label: "Trade Finder", sub: "Auto-suggested packages, priced both ways", group: "Trading" },
  // Replaces /web. The ring is gone (see lib/tradegraph's header for the measurement
  // that killed it); what a reader wanted from it was always a specific deal, and
  // every deal now has its own page underneath this index.
  { href: "/deals", label: "Every deal", sub: "One page per trade, and what each side is worth today", group: "Trading", curated: true },

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
  // The index itself, and the reason this entry exists at all: /more was a bottom tab
  // that this registry did not list, so the page telling readers "if it isn't listed
  // below, it doesn't exist yet" was omitting itself. It survives the Desk as the
  // no-JS and crawler fallback for the drawer, and as the drawer's own "see
  // everything" target.
  { href: "/more", label: "Everything in Parquet", sub: "Search, and every surface in one list", group: "The app" },
  // ONE entry for the whole Lab, and deliberately neither `primary` nor `curated`:
  // the experiments behind it are unfinished by construction and must not compete
  // with finished surfaces for a slot or a shortcut. The Lab's own index lists them;
  // this registry lists the Lab. See lib/lab/index.ts.
  { href: "/lab", label: "The Lab", sub: "Experiments. They may be wrong, and they may vanish", group: "The app" },
];

/**
 * The Desk's four destination slots, in registry order.
 *
 * The ONE list. `components/Desk.tsx` renders exactly what this returns, in exactly
 * this order, and has no array of its own - which is the whole repair described in
 * the file header. `short` is required on every entry here (nav.test.ts pins it), so
 * a future surface promoted to `primary` without a slot label fails the suite rather
 * than rendering a slot captioned "undefined".
 */
export function primarySurfaces(): NavSurface[] {
  return ALL_SURFACES.filter((s) => s.primary);
}

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
