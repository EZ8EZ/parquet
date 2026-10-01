/**
 * THE ACTION QUEUE: at most three decisions, in season-phase order.
 *
 * Every item is a measurement or a count read off an existing engine (lib/crunch,
 * lib/gameplan). Nothing here grades a roster (D6) and nothing is invented (D19): an
 * item appears only when its engine produced the fact it prints, and the only
 * prescriptive text is the game plan's own move title, quoted as the plan wrote it.
 */
import { leagueCrunch } from "../crunch/index.js";
import { buildGamePlan } from "../gameplan/index.js";
import { cachedValuePlayers } from "../valuation/index.js";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Where the season is. Reads raw Sleeper settings numbers; the current week is
 * `settings.leg` when present. With no week known, "has any game been played"
 * (any roster with wins+losses+ties > 0) separates preseason from in-season.
 *
 * @returns {{phase: 'preseason'|'regular'|'deadline'|'playoffs',
 *   week: number|null, weeksToTaxiDeadline: number|null, weeksToTradeDeadline: number|null}}
 */
export function seasonPhase(h) {
  const s = h?.currentLeague?.settings ?? {};
  const taxiDeadline = num(s.taxi_deadline);
  const tradeDeadline = num(s.trade_deadline);
  const playoffStart = num(s.playoff_week_start);
  const startWeek = num(s.start_week) ?? 1;
  const leg = num(s.leg);
  const gamesPlayed = (h?.rosters ?? []).some((r) => {
    const st = r.settings ?? {};
    return (st.wins ?? 0) + (st.losses ?? 0) + (st.ties ?? 0) > 0;
  });
  const inSeason = (leg != null && leg >= startWeek && leg > 0) || gamesPlayed;
  // Preseason with no week reading: week 1 is next, so count from the start week.
  const week = leg != null && leg > 0 ? leg : inSeason ? null : startWeek;
  const until = (deadline) =>
    deadline != null && deadline > 0 && week != null ? deadline - week : null;
  const weeksToTaxiDeadline = until(taxiDeadline);
  const weeksToTradeDeadline = until(tradeDeadline);

  let phase;
  if (!inSeason) phase = "preseason";
  else if (playoffStart != null && week != null && week >= playoffStart) phase = "playoffs";
  else if (weeksToTradeDeadline != null && weeksToTradeDeadline >= 0 && weeksToTradeDeadline <= 2)
    phase = "deadline";
  else phase = "regular";
  return { phase, week, weeksToTaxiDeadline, weeksToTradeDeadline };
}

function rookieIdsOf(h) {
  const ids = new Set();
  for (const r of h?.rosters ?? []) {
    for (const id of r.players ?? []) {
      if (h.players?.get?.(id)?.yearsExp === 0) ids.add(id);
    }
  }
  return ids;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listNames = (ps) => ps.map((p) => p.name).join(", ");

/**
 * Up to three decision cards, first-applicable in this priority:
 * roster crunch → taxi stash → top game-plan move → waiver targets.
 *
 * @param {any} h LeagueHistory
 * @param {number} rosterId
 * @param {any} [principals] from getPrincipals(h); required for the game-plan item
 * @param {{valueFn?: (id: string) => number}} [opts]
 * @returns {{id: string, kicker: string, title: string, detail: string, href: string, cta: string}[]}
 */
export function actionQueue(h, rosterId, principals, opts = {}) {
  if (!(h?.rosters ?? []).some((r) => r.rosterId === rosterId)) return [];
  const sp = seasonPhase(h);
  let valueOf = opts.valueFn;
  if (!valueOf) {
    const values = cachedValuePlayers(h);
    valueOf = (id) => values.get(id)?.value ?? 0;
  }
  const league = leagueCrunch(h, valueOf, { rookieIds: rookieIdsOf(h) });
  const mine = league.rosters.find((c) => c.rosterId === rosterId);
  const items = [];

  // 1. Roster crunch: over the active limit.
  if (mine && mine.overBy > 0) {
    const parts = [];
    if (mine.taxiMoves > 0) parts.push(`${plural(mine.taxiMoves, "taxi stash", "taxi stashes")} available`);
    if (mine.mustCut > 0) parts.push(`${plural(mine.mustCut, "release")} after that`);
    items.push({
      id: "crunch",
      kicker: "Roster limit",
      title: `Sleeper requires ${plural(mine.overBy, "move")} before lock`,
      detail: `${mine.counts.active} active against a limit of ${mine.limits.active}${parts.length ? ` · ${parts.join(", ")}` : ""}.`,
      href: "/roster",
      cta: "See the counts",
    });
  }

  // 2. Taxi: open slot, a candidate, and still before the taxi deadline.
  // The crunch engine's own deadline reading wins when it has one.
  const taxiWindow =
    mine?.taxiDeadline?.passed !== true &&
    (sp.phase === "preseason" ||
      (sp.weeksToTaxiDeadline != null && sp.weeksToTaxiDeadline >= 0));
  if (mine && taxiWindow && mine.taxiOpen > 0 && mine.taxiSuggestions.length > 0) {
    const names = mine.taxiSuggestions.slice(0, Math.min(mine.taxiOpen, 2));
    const deadline = num(h.currentLeague?.settings?.taxi_deadline);
    items.push({
      id: "taxi",
      kicker: "Taxi squad",
      title: `Stash ${listNames(names)} on taxi${deadline ? ` before week ${deadline}` : ""}`,
      detail: `${plural(mine.taxiOpen, "taxi slot")} open · ${plural(mine.taxiSuggestions.length, "eligible player")} outside your top lineup by value.`,
      href: "/roster",
      cta: "Open roster",
    });
  }

  // 3. The game plan's first move, in the plan's own words.
  if (principals) {
    let move = null;
    try {
      move = buildGamePlan(h, rosterId, principals).moves?.[0] ?? null;
    } catch {
      move = null;
    }
    if (move?.title) {
      items.push({
        id: `plan-${move.id ?? "top"}`,
        kicker: "Game plan · move 1",
        title: move.title,
        detail: move.cost ? `Cost: ${move.cost}` : "",
        href: "/plan",
        cta: "Read the plan",
      });
    }
  }

  // 4. Waiver targets: players other rosters' arithmetic counts as releases.
  const releases = league.likelyReleases.filter((p) => p.rosterId !== rosterId);
  if (releases.length > 0) {
    items.push({
      id: "waivers",
      kicker: "Waiver watch",
      title: `${plural(releases.length, "player")} likely to hit waivers: ${listNames(releases.slice(0, 2))}`,
      detail: "Lowest-value players on other over-limit rosters, by the same count as yours.",
      href: "/roster",
      cta: "See who",
    });
  }

  return items.slice(0, 3);
}
