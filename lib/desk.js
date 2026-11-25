/**
 * THE DESK'S SCOREBUG - the server half of components/Desk.jsx.
 *
 * One mono line of facts a manager can use this week, on every page:
 * `PK · 1-2 · 9th of 14 · 5/7 scored`. Team code, record and standing are the league's
 * own arithmetic; the scored count (slots showing a score above 0; Sleeper does not expose locks) is Sleeper's matchup feed for the current week and
 * is left out whenever that feed has nothing to say. No verdicts (D6).
 *
 * LENS SAFETY (D35): with no lens cookie the Desk answers "nobody yet" without ever
 * reading the corpus, because the corpus would fall back to the deploy owner's team.
 */
import { getLeagueHistory } from "./history.js";
import { currentFormByRoster } from "./roster.js";
import { ordinal } from "./derive/describe.js";
import { unstable_rethrow } from "next/navigation";
import { readLensRosterId } from "./auth/server.js";
import { sleeperTeamUrl } from "./sleeperLinks.js";
import { loadScoredCount } from "./week/load.js";
import { deskNextGameNight, recentDeskLiveCount, recentDeskMatchup } from "./lockin/source.js";
import { DEFAULT_TZ, dateIn, decideBy } from "./lockin/time.js";
import { isFocusLocked } from "./auth/focusServer.js";
import { focusPassword } from "./auth/focus.js";

export function teamCode(name) {
  const words = String(name ?? "")
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * The scorebug's parts and its spoken label, from plain inputs. During a lock-in week
 * it leads with what a manager checks on a game night: the week, how many slots show a
 * score (from the matchups row alone), how many decisions are open when the week board
 * was built in the last few minutes, then the record. Before the roster's first game of
 * the week it says when that is instead of "0/7 scored", from the schedule dates on the
 * last board built in this process (no request); without one it keeps "0/7 scored".
 * Otherwise: team code, record,
 * standing.
 */
export function scorebug({ teamName, form, record, season, scored, toDecide = null, firstNight = null, matchup = null, now = new Date() }) {
  const parts = [];
  const spoken = [];
  // A fresh board for this week: the score, the rough win chance, open calls and the
  // next deadline (its countdown ticks in Desk.jsx). Always opens This Week.
  if (matchup && matchup.theirs != null) {
    const f = (x) => (Math.round(x * 10) / 10).toFixed(1);
    parts.push(`${f(matchup.mine)}–${f(matchup.theirs)}`);
    spoken.push(`you ${f(matchup.mine)}, them ${f(matchup.theirs)} banked`);
    if (matchup.win != null) {
      // labelled rough wherever it appears (it is only roughly calibrated)
      parts.push(`${Math.round(matchup.win * 100)}% rough`);
      spoken.push(`rough win chance ${Math.round(matchup.win * 100)} percent`);
    }
    // the open-call count rides on the This Week tab's badge, so the line stays short
    if (toDecide != null && toDecide > 0) spoken.push(`${toDecide} ${toDecide === 1 ? "decision" : "decisions"} open`);
    const tz = matchup.next?.tz || DEFAULT_TZ;
    // the scorebug asks for the move by the decide-by time (DECIDE_BUFFER_MIN before the tip)
    const db = matchup.next ? decideBy(matchup.next.at, tz, { today: dateIn(now, tz), nowMs: now.getTime() }) : null;
    // inside the buffer the countdown has nothing left to count: say it, with the tip
    const next = db ? (db.passed ? { at: null, text: `decide now · tips ${db.tipText}`, urgent: true } : { at: db.by, text: `by ${db.byText}`, urgent: false }) : null;
    if (next?.text) spoken.push(`next move ${next.text}`);
    return { parts, next, toDecide: toDecide ?? null, label: `${teamName}: ${spoken.join(", ")}. Open this week.`, href: "/" };
  }
  if (scored && scored.scored === 0 && firstNight && !firstNight.started) {
    const when = firstNight.tonight ? "tonight" : firstNight.day;
    parts.push(`Wk ${scored.week}`, `first game ${when}`);
    spoken.push(`week ${scored.week}: your first game is ${firstNight.tonight ? "tonight" : `on ${firstNight.day}`}`);
  } else if (scored) {
    parts.push(`Wk ${scored.week}`, `${scored.scored}/${scored.of} scored`);
    spoken.push(`week ${scored.week}: ${scored.scored} of ${scored.of} slots show a score`);
    if (toDecide != null && toDecide > 0) {
      parts.push(`${toDecide} to decide`);
      spoken.push(`${toDecide} lock-or-hold ${toDecide === 1 ? "decision" : "decisions"} open`);
    }
  } else {
    parts.push(teamCode(teamName));
  }
  if (form) {
    parts.push(`${form.wins}-${form.losses}`);
    if (!scored) parts.push(`${ordinal(form.rank)} of ${form.teams}`);
    spoken.push(
      `${form.wins} and ${form.losses}, ${ordinal(form.rank)} of ${form.teams} in the ${
        form.isLive ? form.season : `${form.season} final`
      } standings`,
    );
  } else if (record) {
    parts.push(`${record.wins}-${record.losses}`);
    spoken.push(`${record.wins} and ${record.losses}, ${season} season`);
  }
  return {
    parts,
    next: null,
    toDecide: scored ? toDecide ?? null : null,
    label: `${teamName}: ${spoken.join(", ")}. Open this week.`,
    href: "/",
  };
}

export async function getDeskData() {
  // focus mode: the tab bar offers only the start-or-not pages (lib/auth/focus.js)
  const focus = await isFocusLocked().catch(() => false);
  // focus mode is configured on this deployment (the owner sees "See it as a new visitor")
  const focusOn = !!focusPassword();
  const out = await deskData();
  return out ? { ...out, focus, focusOn } : out;
}

async function deskData() {
  const lens = await readLensRosterId();
  if (lens == null) {
    return { seat: null, bug: null };
  }
  try {
    const h = await getLeagueHistory();
    // A lens naming no roster: the page bounces to the picker; on pages that work
    // without a lens the bar says "pick your team", never another team's record.
    if (h.me.rosterId !== lens) return { seat: null, bug: null };
    const user = h.usersById.get(h.me.userId);
    const teamName = h.me.teamName ?? h.me.displayName;
    const rosterId = h.me.rosterId;
    const seat = {
      label: teamName,
      avatarId: user?.avatar ?? null,
      teamLogoUrl: user?.teamLogoUrl ?? null,
      sleeperHref: sleeperTeamUrl(h.currentLeague.leagueId, rosterId),
    };
    const [forms, scored] = await Promise.all([
      currentFormByRoster(h),
      loadScoredCount(h, rosterId).catch(() => null),
    ]);
    const bug = scorebug({
      teamName,
      form: rosterId != null ? forms.get(rosterId) : undefined,
      record: h.rostersById.get(rosterId)?.settings,
      season: h.currentLeague.season,
      scored,
      toDecide: recentDeskLiveCount(rosterId),
      firstNight: scored ? deskNextGameNight(rosterId, scored.week) : null,
      matchup: recentDeskMatchup(rosterId),
    });
    return { seat, bug };
  } catch (err) {
    unstable_rethrow(err);
    console.error(
      `[desk] scorebug unavailable - the corpus could not be read: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
