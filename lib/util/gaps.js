/**
 * DATA GAPS - what failed to load, recorded instead of swallowed.
 *
 * Before this, a failed transaction week became `[]`, a failed season was skipped and a
 * failed market fetch silently repriced the league. Each of those reads, on the page, as
 * a true fact ("no trades that week"). A gap is the record that it is not: which
 * endpoint, which season, which week, and why. The corpus carries its own (`h.gaps`);
 * loaders that run outside the corpus (principals, season rosters, the draft index, the
 * regret ledger) publish theirs here per source, replaced on every assembly, so the root
 * layout can say once, plainly, that the current view is built on incomplete data.
 *
 * @typedef {Object} Gap
 * @property {string} endpoint  e.g. "transactions", "traded_picks", "market"
 * @property {string|null} season
 * @property {number|null} week
 * @property {string|null} id   league / draft / player id the request was for
 * @property {string} reason    "timeout" | "http" | "network" | "invalid" | "error"
 */

/**
 * @param {unknown} err
 * @param {{ endpoint: string, season?: string|null, week?: number|null, id?: string|null }} where
 * @returns {Gap}
 */
export function gapFrom(err, { endpoint, season = null, week = null, id = null }) {
  const kind = /** @type {{ kind?: string }} */ (err)?.kind;
  return {
    endpoint,
    season: season == null ? null : String(season),
    week: week ?? null,
    id: id ?? null,
    reason: typeof kind === "string" ? kind : "error",
  };
}

/** @type {Map<string, Gap[]>} */
const auxGaps = new Map();

/** Replace one out-of-corpus loader's gaps (an empty list clears them). */
export function setAuxGaps(source, gaps) {
  if (gaps.length) auxGaps.set(source, gaps);
  else auxGaps.delete(source);
}

/** Every out-of-corpus loader's current gaps. */
export function auxGapList() {
  return [...auxGaps.values()].flat();
}

/** Test hook. */
export function clearAuxGaps() {
  auxGaps.clear();
}

const LABEL = {
  transactions: "transactions",
  traded_picks: "traded picks",
  brackets: "playoff brackets",
  league: "earlier seasons",
  drafts: "drafts",
  draft_picks: "draft picks",
  rosters: "rosters",
  users: "managers",
  user: "your Sleeper account",
  matchups: "weekly lineups",
  player_stats: "player game logs",
};

/**
 * The banner's one sentence, or null when nothing is missing. Plain and factual (D6):
 * what is missing and what that changes, never what to do about it.
 * @param {Gap[]} gaps
 * @returns {string|null}
 */
export function describeGaps(gaps) {
  if (!gaps?.length) return null;
  const parts = [];
  if (gaps.some((g) => g.endpoint === "market")) {
    parts.push("the dynasty market (values fall back to Sleeper's redraft rank)");
  }
  const groups = new Map();
  for (const g of gaps) {
    if (g.endpoint === "market") continue;
    const label = LABEL[g.endpoint] ?? g.endpoint;
    const seasons = groups.get(label) ?? new Set();
    if (g.season) seasons.add(g.season);
    groups.set(label, seasons);
  }
  for (const [label, seasons] of groups) {
    const s = [...seasons].sort();
    parts.push(s.length ? `${label} (${s.join(", ")})` : label);
  }
  const list =
    parts.length <= 2
      ? parts.join(" and ")
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Sleeper did not return ${list}, so this view is incomplete until it does.`;
}
