/**
 * THE SURFACE REGISTRY. Every static route lives under one of four tabs or the
 * utility menu, and the Desk, the tab hubs and the e2e suites all read this list.
 */
export const TABS = [
  { id: "week", href: "/", label: "This Week" },
  { id: "team", href: "/roster", label: "Team" },
  { id: "trade", href: "/trade", label: "Trade" },
  { id: "league", href: "/league", label: "League" },
];

export const ALL_SURFACES = [
  // ------------------------------------------------------------ the four tabs
  {
    href: "/",
    label: "This Week",
    short: "This Week",
    sub: "Your seven slots, deadlines ahead, what needs doing",
    tab: "week",
    primary: true,
  },
  {
    href: "/roster",
    label: "Team",
    short: "Team",
    sub: "Direction, roster and picks",
    tab: "team",
    primary: true,
  },
  {
    href: "/trade",
    label: "Trade",
    short: "Trade",
    sub: "Find a deal, check a deal, look up a value",
    tab: "trade",
    primary: true,
  },
  {
    href: "/league",
    label: "League",
    short: "League",
    sub: "Standings, the record and the history",
    tab: "league",
    primary: true,
  },
  // ---------------------------------------------------------------- This Week
  {
    href: "/lockin",
    label: "Lock or hold",
    sub: "Every slot and player this week, with charts and the model's lean",
    tab: "week",
  },
  {
    href: "/lab/pulse",
    label: "League pulse",
    sub: "What moved across the league since your last visit",
    tab: "week",
  },
  // ---------------------------------------------------------------- Team
  {
    href: "/plan",
    label: "Game plan",
    sub: "The full plan: direction, moves and caveats",
    tab: "team",
  },
  {
    href: "/lab/regret",
    label: "Week by week",
    sub: "What each lock-in week banked against what was there",
    tab: "team",
  },
  {
    href: "/lab/counterfactual",
    label: "The roster you never kept",
    sub: "Your picks and startup haul, resolved to today",
    tab: "team",
  },
  // ---------------------------------------------------------------- Trade
  {
    href: "/trade/finder",
    label: "Trade finder",
    sub: "Named packages, priced both ways",
    tab: "trade",
  },
  {
    href: "/values",
    label: "Asset values",
    sub: "Players and picks, one model",
    tab: "trade",
  },
  {
    href: "/managers",
    label: "Partners",
    sub: "Every manager's dossier",
    tab: "trade",
  },
  {
    href: "/managers/compare",
    label: "Manager compare",
    sub: "Any two managers, side by side",
    tab: "trade",
  },
  {
    href: "/lab/leverage",
    label: "Where you can deal from",
    sub: "Your value by position against the league's mix",
    tab: "trade",
  },
  {
    href: "/rank",
    label: "Your own ranking",
    sub: "Blend your own board against the field's",
    tab: "trade",
  },
  // ---------------------------------------------------------------- League
  {
    href: "/ledger",
    label: "Decision ledger",
    sub: "Your reasoning, captured per move",
    tab: "league",
    section: "Record",
  },
  {
    href: "/deals",
    label: "Every deal",
    sub: "One page per trade, valued today",
    tab: "league",
    section: "Record",
  },
  {
    href: "/recap",
    label: "Season recap",
    sub: "Last season, from what actually happened",
    tab: "league",
    section: "History",
  },
  {
    href: "/awards",
    label: "League awards",
    sub: "Who's who, statistically",
    tab: "league",
    section: "History",
  },
  {
    href: "/drafts",
    label: "Drafts and pick lineage",
    sub: "Every draft, and what each pick became",
    tab: "league",
    section: "History",
  },
  {
    href: "/drafts/grades",
    label: "Draft report cards",
    sub: "Value over slot, class by class",
    tab: "league",
    section: "History",
  },
  // ---------------------------------------------------------------- utility menu
  {
    href: "/settings",
    label: "Settings and search",
    sub: "Search, and every page in the menu",
    tab: "utility",
  },
  {
    href: "/teams",
    label: "Switch team",
    sub: "Run the app as any manager in the league",
    tab: "utility",
  },
  {
    href: "/about",
    label: "How it works",
    sub: "What Parquet is and why nothing gets a grade",
    tab: "utility",
  },
  {
    href: "/methodology",
    label: "Methodology",
    sub: "How the values and indexes are built",
    tab: "utility",
  },
  {
    href: "/commissioner",
    label: "Commissioner tools",
    sub: "League health checks and an audit log",
    tab: "utility",
  },
  {
    href: "/design",
    label: "Design system",
    sub: "Every component and its variants, for reviewers",
    tab: "utility",
  },
];

/** Old paths that now redirect, and where to. next.config.mjs reads this. */
export const REDIRECTS = [
  { source: "/more", destination: "/settings" },
  { source: "/lab", destination: "/roster" },
];

// Dynamic routes have no registry entry; their tab comes from their prefix.
const PREFIX_TABS = {
  "/lineage": "league",
  "/depth": "team",
};

/** Which tab a pathname belongs to: a tab id, "utility", or null. */
export function tabOf(pathname) {
  const path = String(pathname ?? "").split(/[?#]/)[0] || "/";
  if (path === "/") return "week";
  let best = null;
  for (const s of ALL_SURFACES) {
    if (s.href === "/") continue;
    if (path === s.href || path.startsWith(s.href + "/")) {
      if (!best || s.href.length > best.href.length) best = s;
    }
  }
  if (best) return best.tab;
  for (const [prefix, tab] of Object.entries(PREFIX_TABS)) {
    if (path === prefix || path.startsWith(prefix + "/")) return tab;
  }
  return null;
}

/** The pages filed under one tab, hub excluded, in registry order. */
export function surfacesIn(tab) {
  return ALL_SURFACES.filter((s) => s.tab === tab && !s.primary);
}

/** The utility menu's entries. */
export function utilitySurfaces() {
  return surfacesIn("utility");
}

/** The four tabs of the Desk, left to right. */
export function primarySurfaces() {
  return ALL_SURFACES.filter((s) => s.primary);
}

/** Every surface, grouped by tab then utility, for a full index. */
export function groupedSurfaces() {
  const groups = [
    ...TABS.map((t) => ({ group: t.label, tab: t.id })),
    { group: "Menu", tab: "utility" },
  ];
  return groups
    .map(({ group, tab }) => ({
      group,
      items: ALL_SURFACES.filter((s) => s.tab === tab),
    }))
    .filter((g) => g.items.length > 0);
}

const ONWARD = {
  "/": [
    { href: "/roster", why: "Where does my team stand?" },
    { href: "/trade", why: "Is there a deal to make?" },
    { href: "/league", why: "Where does that put me?" },
  ],
  "/lockin": [
    { href: "/", why: "Back to this week" },
    { href: "/lab/regret", why: "How did my past weeks go?" },
  ],
  "/lab/pulse": [
    { href: "/", why: "Back to this week" },
    { href: "/deals", why: "Open the deals themselves" },
  ],
  "/roster": [
    { href: "/plan", why: "Read the full plan" },
    { href: "/trade/finder", why: "Who has what I am missing?" },
    { href: "/lab/regret", why: "How did my weeks go?" },
  ],
  "/plan": [
    { href: "/trade/finder", why: "Find the partner for that move" },
    { href: "/trade", why: "Price a specific package" },
    { href: "/roster", why: "Back to the team" },
  ],
  "/lab/regret": [
    { href: "/", why: "Back to this week" },
    { href: "/roster", why: "Back to the team" },
  ],
  "/lab/counterfactual": [
    { href: "/roster", why: "Back to the roster I do have" },
    { href: "/drafts", why: "What did those picks become?" },
  ],
  "/trade": [
    { href: "/trade/finder", why: "Let the app propose one" },
    { href: "/values", why: "Check what a piece is worth" },
    { href: "/managers", why: "Read who you are dealing with" },
  ],
  "/trade/finder": [
    { href: "/trade", why: "Start a package from scratch" },
    { href: "/rank", why: "Price it against your own board" },
    { href: "/managers", why: "Read who you are dealing with" },
  ],
  "/values": [
    { href: "/rank", why: "Disagree with the model" },
    { href: "/trade", why: "Put these into a package" },
    { href: "/methodology", why: "Where does this number come from?" },
  ],
  "/managers": [
    { href: "/managers/compare", why: "Put two of them side by side" },
    { href: "/trade/finder", why: "Which of them should I call?" },
    { href: "/deals", why: "What have they actually done?" },
  ],
  "/managers/compare": [
    { href: "/trade/finder", why: "Is there a deal between these two?" },
    { href: "/deals", why: "Every trade, in full" },
    { href: "/awards", why: "Who wins what, league-wide" },
  ],
  "/lab/leverage": [
    { href: "/trade/finder", why: "Find a deal from that surplus" },
    { href: "/trade", why: "Back to the trade desk" },
  ],
  "/rank": [
    { href: "/trade/finder", why: "Find deals priced on your board" },
    { href: "/values", why: "Compare it against the model" },
    { href: "/drafts", why: "How your last board turned out" },
  ],
  "/league": [
    { href: "/managers", why: "Who are these people?" },
    { href: "/deals", why: "Every trade on record" },
    { href: "/recap", why: "How did last season go?" },
  ],
  "/ledger": [
    { href: "/deals", why: "See the deals themselves" },
    { href: "/recap", why: "How did last season actually go?" },
    { href: "/plan", why: "Does the plan still match what I wrote?" },
  ],
  "/deals": [
    { href: "/ledger", why: "The reasoning you captured on yours" },
    { href: "/managers/compare", why: "Two managers, head to head" },
    { href: "/drafts", why: "What the picks in them became" },
  ],
  "/recap": [
    { href: "/ledger", why: "What was I thinking at the time?" },
    { href: "/awards", why: "How did that compare to everyone?" },
    { href: "/lab/regret", why: "What did I leave on the bench?" },
  ],
  "/awards": [
    { href: "/managers", why: "Read the winner's full dossier" },
    { href: "/drafts/grades", why: "How did the drafting turn out?" },
    { href: "/methodology", why: "What is each award measuring?" },
  ],
  "/drafts": [
    { href: "/drafts/grades", why: "Value over slot, class by class" },
    { href: "/rank", why: "Build your own board for the next one" },
    { href: "/values", why: "What are those picks worth now?" },
  ],
  "/drafts/grades": [
    { href: "/drafts", why: "Follow one pick's whole story" },
    { href: "/awards", why: "Who drafts well, across all seasons" },
    { href: "/methodology", why: "How a pick is measured" },
  ],
  "/design": [
    { href: "/roster", why: "See it applied to your team" },
    { href: "/league", why: "And to the standings" },
  ],
  "/settings": [
    { href: "/teams", why: "Look at someone else's team" },
    { href: "/about", why: "What this app is for" },
  ],
  "/teams": [
    { href: "/league", why: "The standings first" },
    { href: "/managers", why: "Or read them before you pick" },
  ],
  "/about": [
    { href: "/methodology", why: "How the numbers are actually built" },
    { href: "/teams", why: "Run it as any manager in the league" },
  ],
  "/methodology": [
    { href: "/values", why: "See the model on real players" },
    { href: "/league", why: "See both indexes on real rosters" },
  ],
  "/commissioner": [
    { href: "/deals", why: "Open any of those transactions" },
    { href: "/league", why: "Back to the standings" },
    { href: "/drafts", why: "Where the stuck picks came from" },
  ],
};

/** The next steps off a surface; `[]` for an unregistered path. */
export function onwardFrom(href) {
  return resolveSteps(ONWARD[href] ?? []);
}

function resolveSteps(steps) {
  return steps.map((s) => ({
    href: s.href,
    label:
      s.label ?? ALL_SURFACES.find((x) => x.href === s.href)?.label ?? s.href,
    why: s.why,
  }));
}

/** Every surface that has onward steps defined. Test-facing. */
export function surfacesWithOnward() {
  return Object.keys(ONWARD);
}

/**
 * Everything the app knows about one manager, as links. A former manager (D22)
 * holds no roster, so they keep only their record and their deals.
 */
export function managerLinks(m) {
  const out = [];
  if (m.isFormer && m.ownerId) {
    out.push({ href: `/managers/former/${m.ownerId}`, label: "Their record" });
  } else if (m.rosterId != null) {
    out.push({
      href: `/managers/${m.rosterId}`,
      label: m.isMe ? "Your dossier" : "Dossier",
    });
  }
  if (!m.isFormer && m.rosterId != null && !m.isMe) {
    out.push({
      href: `/trade/finder?with=${m.rosterId}`,
      label: "Find a trade",
    });
  }
  if (m.ownerId) {
    out.push({
      href: `/deals?manager=${encodeURIComponent(m.ownerId)}`,
      label: "Their deals",
    });
  }
  if (m.isMe) {
    out.push({ href: "/ledger", label: "Your reasoning" });
  }
  return out;
}
