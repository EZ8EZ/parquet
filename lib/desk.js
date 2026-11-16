/**
 * THE DESK'S SCOREBUG - the server half of components/Desk.jsx.
 *
 * One mono line of facts a manager can use this week, on every page:
 * `PK · 1-2 · 9th of 14 · 5/7 banked`. Team code, record and standing are the league's
 * own arithmetic; the banked count is Sleeper's matchup feed for the current week and
 * is left out whenever that feed has nothing to say. No verdicts (D6).
 *
 * LENS SAFETY (D35): with no lens cookie the Desk answers "nobody yet" without ever
 * reading the corpus, because the corpus would fall back to the deploy owner's team.
 */
import { getLeagueHistory } from "./history.js";
import { currentFormByRoster } from "./roster.js";
import { ordinal } from "./derive/describe.js";
import { readLensRosterId } from "./auth/server.js";
import { sleeperTeamUrl } from "./sleeperLinks.js";
import { loadBankedCount } from "./week/load.js";

export function teamCode(name) {
  const words = String(name ?? "")
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** The scorebug's parts and its spoken label, from plain inputs. */
export function scorebug({ teamName, form, record, season, banked }) {
  const parts = [teamCode(teamName)];
  const spoken = [];
  if (form) {
    parts.push(`${form.wins}-${form.losses}`, `${ordinal(form.rank)} of ${form.teams}`);
    spoken.push(
      `${form.wins} and ${form.losses}, ${ordinal(form.rank)} of ${form.teams} in the ${
        form.isLive ? form.season : `${form.season} final`
      } standings`,
    );
  } else if (record) {
    parts.push(`${record.wins}-${record.losses}`);
    spoken.push(`${record.wins} and ${record.losses}, ${season} season`);
  }
  if (banked) {
    parts.push(`${banked.banked}/${banked.of} banked`);
    spoken.push(`${banked.banked} of ${banked.of} slots banked in week ${banked.week}`);
  }
  return { parts, label: `${teamName}: ${spoken.join(", ")}. Open the standings.` };
}

export async function getDeskData() {
  if ((await readLensRosterId()) == null) {
    return { seat: null, bug: null };
  }
  try {
    const h = await getLeagueHistory();
    const user = h.usersById.get(h.me.userId);
    const teamName = h.me.teamName ?? h.me.displayName;
    const rosterId = h.me.rosterId;
    const seat = {
      label: teamName,
      avatarId: user?.avatar ?? null,
      teamLogoUrl: user?.teamLogoUrl ?? null,
      sleeperHref: sleeperTeamUrl(h.currentLeague.leagueId, rosterId),
    };
    const [forms, banked] = await Promise.all([
      currentFormByRoster(h),
      loadBankedCount(h, rosterId).catch(() => null),
    ]);
    const bug = scorebug({
      teamName,
      form: rosterId != null ? forms.get(rosterId) : undefined,
      record: h.rostersById.get(rosterId)?.settings,
      season: h.currentLeague.season,
      banked,
    });
    return { seat, bug: { href: "/league", ...bug } };
  } catch (err) {
    console.error(
      `[desk] scorebug unavailable - the corpus could not be read: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
