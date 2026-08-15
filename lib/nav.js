export const ALL_SURFACES = [
  // -------------------------------------------------- the pinned "Go to" slots
  // Four, and the fourth is the ledger rather than the league. The "Go to" row asks
  // "what are you here to do" - look at today, at the team, at the decision in front
  // of you, or at the record of decisions already made - and capturing reasoning is
  // the one of those the app exists for. The league standings are a thing you read,
  // not a thing you do, they change once a week at most, and Home's Record figure has
  // always linked straight there. Trade lost its slot to the same argument: it is
  // where a plan gets executed, so it is reached from /plan and from the drawer.
  {
    href: "/",
    label: "Home",
    short: "Today",
    sub: "Today's stat line and what changed",
    group: "Primary",
    primary: true,
  },
  {
    href: "/roster",
    label: "Roster",
    short: "Team",
    sub: "Your own team, valued and tiered",
    group: "Primary",
    primary: true,
  },
  {
    href: "/plan",
    label: "Plan",
    short: "Decide",
    sub: "How to improve this team",
    group: "Primary",
    primary: true,
  },
  {
    href: "/ledger",
    label: "Decision ledger",
    short: "Record",
    sub: "Capture your reasoning at the moment of conviction",
    group: "Primary",
    primary: true,
  },
  // ---------------------------------------------------------------- your team
  {
    href: "/recap",
    label: "Season recap",
    sub: "Last season, recapped from what actually happened",
    group: "Your team",
  },
  // ---------------------------------------------------------------- the league
  {
    href: "/league",
    label: "League",
    sub: "Standings, timelines, everyone's window",
    group: "The league",
  },
  {
    href: "/managers",
    label: "Dossiers",
    sub: "Scout your rivals",
    group: "The league",
  },
  {
    href: "/managers/compare",
    label: "Manager Compare",
    sub: "Any two managers, side by side",
    group: "The league",
  },
  {
    href: "/awards",
    label: "League awards",
    sub: "Who's who, statistically",
    group: "The league",
  },
  {
    href: "/commissioner",
    label: "Commissioner tools",
    sub: "League health checks and an audit log",
    group: "The league",
  },
  // ---------------------------------------------------------------- trading
  {
    href: "/trade",
    label: "Trade",
    sub: "Build and evaluate a deal",
    group: "Trading",
  },
  {
    href: "/trade/finder",
    label: "Trade Finder",
    sub: "Auto-suggested packages, priced both ways",
    group: "Trading",
  },
  // Replaces /web. The ring is gone (see lib/tradegraph's header for the measurement
  // that killed it); what a reader wanted from it was always a specific deal, and
  // every deal now has its own page underneath this index.
  {
    href: "/deals",
    label: "Every deal",
    sub: "One page per trade, and what each side is worth today",
    group: "Trading",
  },
  // ---------------------------------------------------------------- drafts & values
  // "Pick lineage", not "Draft history". The registry said one thing and the page,
  // its two children and all six inbound links said the other, so the same surface
  // had two names depending on which door you came through. The six call sites won:
  // lineage is what the page actually does, and a rename here fixes all of them.
  {
    href: "/drafts",
    label: "Pick lineage",
    sub: "What your picks became",
    group: "Drafts & values",
  },
  {
    href: "/drafts/grades",
    label: "Draft report cards",
    sub: "Grade every past draft class",
    group: "Drafts & values",
  },
  {
    href: "/values",
    label: "Asset values",
    sub: "Players and picks, one model",
    group: "Drafts & values",
  },
  // A real draft board that the Trade Finder already reads - `readCustomOrder` feeds
  // every package's conviction line - so it earns its listing on work it is already
  // doing rather than on novelty.
  {
    href: "/rank",
    label: "Build your own ranking",
    sub: "Blend your own board against the field's",
    group: "Drafts & values",
  },
  // ---------------------------------------------------------------- the app
  {
    href: "/analyst",
    label: "The Analyst",
    sub: "Audit your own thinking",
    group: "The app",
  },
  {
    href: "/about",
    label: "What this is",
    sub: "The premise, both indexes, and why nothing gets a grade",
    group: "The app",
  },
  {
    href: "/methodology",
    label: "Methodology",
    sub: "How the values and both indexes actually work",
    group: "The app",
  },
  {
    href: "/settings",
    label: "Settings",
    sub: "Theme, and how you view the app",
    group: "The app",
  },
  // The front door, and until now the one real surface this registry did not list -
  // which made /more's "if it isn't listed below, it doesn't exist" false about the
  // very page a first-time visitor is now routed to (see lib/auth/entry.ts).
  {
    href: "/teams",
    label: "Switch team",
    sub: "Run the whole app as any manager in the league",
    group: "The app",
  },
  // The index itself, and the reason this entry exists at all: /more was a bottom tab
  // that this registry did not list, so the page telling readers "if it isn't listed
  // below, it doesn't exist yet" was omitting itself. It survives the Desk as the
  // no-JS and crawler fallback for the drawer, and as the drawer's own "see
  // everything" target.
  {
    href: "/more",
    label: "Everything in Parquet",
    sub: "Search, and every surface in one list",
    group: "The app",
  },
  // ONE entry for the whole Lab, and deliberately not `primary`:
  // the experiments behind it are unfinished by construction and must not compete
  // with finished surfaces for a permanent slot. The Lab's own index lists them;
  // this registry lists the Lab. See lib/lab/index.ts.
  {
    href: "/lab",
    label: "The Lab",
    sub: "Experiments. They may be wrong, and they may vanish",
    group: "The app",
  },
];
const ONWARD = {
  "/": [
    { href: "/plan", why: "So what do I do about it?" },
    { href: "/ledger", why: "Write down why, before I forget" },
    { href: "/league", why: "Where does that put me?" },
  ],
  "/roster": [
    { href: "/plan", why: "What would actually improve this?" },
    { href: "/trade/finder", why: "Who has what I am missing?" },
    {
      href: "/lab/counterfactual",
      why: "What if I had never traded?",
      label: "The counterfactual roster",
    },
  ],
  "/plan": [
    { href: "/trade/finder", why: "Find the partner for that move" },
    { href: "/trade", why: "Price a specific package" },
    { href: "/ledger", why: "Record the reasoning while it is fresh" },
  ],
  "/ledger": [
    { href: "/deals", why: "See the deals themselves" },
    { href: "/recap", why: "How did last season actually go?" },
    { href: "/analyst", why: "Argue with someone who has read all of it" },
  ],
  "/recap": [
    { href: "/ledger", why: "What was I thinking at the time?" },
    { href: "/awards", why: "How did that compare to everyone?" },
    {
      href: "/lab/regret",
      why: "What did I leave on the bench?",
      label: "The regret ledger",
    },
  ],
  "/league": [
    { href: "/managers", why: "Who are these people?" },
    { href: "/awards", why: "Who is best at what?" },
    { href: "/commissioner", why: "Is anything broken?" },
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
  "/awards": [
    { href: "/managers", why: "Read the winner's full dossier" },
    { href: "/drafts/grades", why: "How did the drafting actually grade?" },
    { href: "/methodology", why: "What is each award measuring?" },
  ],
  "/commissioner": [
    { href: "/deals", why: "Open any of those transactions" },
    { href: "/league", why: "Back to the standings" },
    { href: "/drafts", why: "Where the stuck picks came from" },
  ],
  "/trade": [
    { href: "/ledger", why: "Capture why you are doing this" },
    { href: "/trade/finder", why: "Or let the app propose one" },
    { href: "/values", why: "Check what a piece is worth" },
  ],
  "/trade/finder": [
    { href: "/trade", why: "Adjust the package by hand" },
    { href: "/rank", why: "Price it against your own board" },
    { href: "/managers", why: "Read who you are dealing with" },
  ],
  "/deals": [
    { href: "/ledger", why: "The reasoning you captured on yours" },
    { href: "/managers/compare", why: "Two managers, head to head" },
    { href: "/drafts", why: "What the picks in them became" },
  ],
  "/drafts": [
    { href: "/drafts/grades", why: "How did each class grade out?" },
    { href: "/rank", why: "Build your own board for the next one" },
    { href: "/values", why: "What are those picks worth now?" },
  ],
  "/drafts/grades": [
    { href: "/drafts", why: "Follow one pick's whole story" },
    { href: "/awards", why: "Who drafts well, across all seasons" },
    { href: "/methodology", why: "How a pick is graded" },
  ],
  "/values": [
    { href: "/rank", why: "Disagree with the model" },
    { href: "/trade", why: "Put these into a package" },
    { href: "/methodology", why: "Where does this number come from?" },
  ],
  "/rank": [
    { href: "/trade/finder", why: "Find deals priced on your board" },
    { href: "/values", why: "Compare it against the model" },
    { href: "/drafts", why: "How your last board turned out" },
  ],
  "/analyst": [
    { href: "/ledger", why: "Capture what it changed your mind about" },
    { href: "/plan", why: "Turn the argument into a move" },
    { href: "/managers", why: "Check its read on a rival" },
  ],
  "/about": [
    { href: "/methodology", why: "How the numbers are actually built" },
    { href: "/teams", why: "Run it as any manager in the league" },
    { href: "/more", why: "Everything there is" },
  ],
  "/methodology": [
    { href: "/values", why: "See the model on real players" },
    { href: "/league", why: "See both indexes on real rosters" },
    { href: "/lab", why: "What is still being tested" },
  ],
  "/settings": [
    { href: "/teams", why: "Look at someone else's team" },
    { href: "/about", why: "What this app is for" },
    { href: "/more", why: "Everything there is" },
  ],
  "/teams": [
    { href: "/league", why: "The standings first" },
    { href: "/managers", why: "Or read them before you pick" },
  ],
  "/more": [
    { href: "/about", why: "What this app is for" },
    { href: "/methodology", why: "How the numbers are built" },
  ],
  "/lab": [
    { href: "/roster", why: "Back to the real roster" },
    { href: "/methodology", why: "How the finished metrics work" },
  ],
};
/**
 * The next steps off a surface, resolved against the registry.
 *
 * Returns `[]` for an unregistered path rather than throwing - callers pass
 * `usePathname()` output, and a dynamic route (`/managers/42`) legitimately has no
 * entry of its own.
 */
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
export function homeNext(f) {
  const front = [];
  if (f.outstanding > 0) {
    // NOT the baseline's "Write down why, before I forget": when this fires, the
    // capture badge at the top of Home is already saying almost exactly that, and two
    // near-identical sentences on one page read as a stutter rather than as emphasis.
    front.push({ href: "/ledger", why: "Which decisions still have no why?" });
  }
  if (f.moved) {
    front.push({
      href: "/deals",
      why: "What were those moves actually worth?",
    });
  }
  if (f.contradicted) {
    front.push({
      href: "/analyst",
      why: "Argue with someone who has read all of it",
    });
  }
  const seen = new Set(front.map((s) => s.href));
  const rest = (ONWARD["/"] ?? []).filter((s) => !seen.has(s.href));
  return resolveSteps([...front, ...rest].slice(0, 3));
}
/** Every surface that has onward steps defined. Test-facing. */
export function surfacesWithOnward() {
  return Object.keys(ONWARD);
}
/**
 * EVERYTHING THE APP KNOWS ABOUT ONE MANAGER, AS LINKS.
 *
 * The single most repeated integration failure in this app: a surface names a
 * manager, and does not link to what the app already knows about them. Four separate
 * instances of it were catalogued - the Trade Finder unreachable from the dossier
 * that decides who to call, the dossier unreachable from the trade result naming its
 * counterparty, the ledger unreachable from a trade log, and a rival's numbers
 * unreachable from the comparison of two rivals. They are one bug, so they get one
 * fix, and it lives here rather than as markup copied to four call sites.
 *
 * The FORMER-MANAGER guard is the same one `ManagerLink` carries and for the same
 * reason (D22): a departed principal holds no roster, so there is no trade to find
 * with them and no roster page to route to. They keep the two links that are
 * genuinely about the person - their own record, and their deals.
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
    // The whole point of item one: the finder is reachable from the moment a trade
    // is being contemplated, not only from /plan and the drawer.
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
    // Item three: a trade log with no path to the reasoning captured about those
    // same trades.
    out.push({ href: "/ledger", label: "Your reasoning" });
  }
  return out;
}
/**
 * The four pinned slots of the Desk drawer's "Go to" row, in registry order.
 *
 * The ONE list. `components/Desk.tsx` renders exactly what this returns, in exactly
 * this order, and has no array of its own - which is the whole repair described in
 * the file header. `short` is required on every entry here (nav.test.ts pins it), so
 * a future surface promoted to `primary` without a slot label fails the suite rather
 * than rendering a slot captioned "undefined".
 */
export function primarySurfaces() {
  return ALL_SURFACES.filter((s) => s.primary);
}
/** Everything worth putting on the full index, grouped in registry order. */
export function groupedSurfaces() {
  const order = [
    "Primary",
    "Your team",
    "The league",
    "Trading",
    "Drafts & values",
    "The app",
  ];
  return order
    .map((group) => ({
      group,
      items: ALL_SURFACES.filter((s) => s.group === group),
    }))
    .filter((g) => g.items.length > 0);
}
