/**
 * THE DESK'S SCOREBUG - the server half of components/Desk.tsx.
 *
 * The Desk's top row answers "what am I looking at", and since VISION.md's M3 it
 * answers it the broadcast way: a persistent one-line strip of the lens team's
 * STANDING FACTS - team code, record, league standing, TCI, window years -
 * `PK · 13-7 · #5/14 · TCI 57 · 2029-31`, always current, on every page, tappable
 * through to /league's seat card. Everything below assembles it from the corpus so
 * the client component receives plain strings and can stay a pure renderer.
 *
 * EVERY FIGURE IS A PUBLISHED STANDING FACT, ZERO VERDICTS (D6). The record and rank
 * are the league's own arithmetic; TCI and the window are the model's published
 * readings, the same ones /league prints for all fourteen rosters. Nothing here
 * grades, ranks-as-praise, or recommends.
 *
 * TWO RULES SHAPE THE ROW, and both are easier to get wrong than right.
 *
 * 1. LENS SAFETY (D35). The capture count is a private tally of one manager's
 *    unwritten reasoning, and it is rendered on every page in the app, so it is
 *    exactly the kind of figure that leaks across identities if nobody is watching.
 *    It is gated on `canCapture(seat, lens)` - the same gate Home already applies to
 *    the same number - which is false both when the reader holds no seat and when
 *    they are looking through someone ELSE's lens. In legacy mode (no `AUTH_SECRET`,
 *    which is every deploy today) it is always true and this behaves exactly as the
 *    app always has. The scorebug itself needs no gate: every segment on it is
 *    public data about the team on the lens.
 *
 * 1b. THE CAPTURE COUNT KEEPS ITS OWN SEAT, IT JUST STOPS OWNING THE ROW. Before M3
 *    the count REPLACED the standing facts whenever it was non-zero - the row was
 *    either your record or your to-do, never both. D106 deferred the scorebug partly
 *    on this exact question ("where does the capture-count status go"), because D40's
 *    rule cuts both ways: the count is real information (it counts
 *    `recentUnannotated` - the last 30 days, see RECENT_CAPTURE_DAYS in
 *    lib/ledger.ts - a figure that reaches zero through ordinary use, not the
 *    standing accusation the full backlog was), so it cannot be silently dropped;
 *    but it is a TO-DO, not a standing fact, so it does not belong inside a strip
 *    whose one meaning is "your seat, as the league sees it". The answer: a compact
 *    companion link beside the strip - the ledger's own mark plus the count, in the
 *    accent (the row's established to-do tone), its own destination (/ledger), its
 *    own accessible sentence - present only while the count is non-zero. Zero is
 *    the goal state and it looks like the goal state: just the scorebug.
 *
 * 2. THE STRIP DEGRADES BY OMITTING SEGMENTS, NEVER BY FAKING THEM. A brand-new
 *    league has no rank to print; a roster whose window the model REFUSED
 *    (split/unreadable, lib/metrics/window.ts) has no year range that is honest to
 *    print. In both cases the segment is absent rather than dashed: a dash in a mono
 *    strip reads as "no value here", which for a refused window is a claim the
 *    derivation declined to make (the D95 problem), and the refusal itself - label,
 *    reason, withheld figure - is one tap away on the exact page this strip links
 *    to. A 44pt strip is bounded chrome; it carries facts whole or not at all.
 *
 * WHAT THIS COSTS THE ROOT LAYOUT, MEASURED RATHER THAN ASSUMED. The scorebug adds
 * two reads the old context row only paid on one branch: `currentFormByRoster`
 * (season rosters - its own TTL memo, lib/metrics/skill.ts) and `leagueWindows`
 * (TCI + window, via `cachedLeagueTimelines` - memoized per corpus by the same
 * WeakMap trick `cachedValuePlayers` uses). Timed against the fixture corpus: the
 * first `leagueWindows` call per corpus pays ~43ms (dominated by the one-time
 * valuation + timeline pass that /league, /plan, /values and most other routes
 * already trigger themselves) and every call after it is ~0.15ms, so on the routes
 * that already read the corpus this is a warm map lookup, and on the few that do
 * not it is one timeline pass per 5-minute corpus TTL. That is cheap enough for
 * every route's layout; if a future provider makes it not so, degrade by dropping
 * the TCI/window segments, not by slowing every page.
 */
import { getLeagueHistory } from "./history.js";
import { getLedgerSummary } from "./ledger.js";
import { getPrincipals } from "./principals.js";
import { currentFormByRoster } from "./roster.js";
import { leagueWindows } from "./metrics/window.js";
import { ordinal } from "./derive/describe.js";
import { canCapture, readLensRosterId, readSeat } from "./auth/server.js";
import { sleeperTeamUrl } from "./sleeperLinks.js";
/**
 * Up to two initials from a team name ("Parquet Kings" -> "PK", "5-Year Plan" ->
 * "5P"). Same derivation as components/TeamAvatar.tsx's monogram, restated here
 * because lib/ never imports from components/ - and it MUST stay the same
 * derivation: the scorebug's code and the seat avatar's fallback monogram sit an
 * inch apart, and two spellings of one team would read as a bug.
 */
function teamCode(name) {
  const words = String(name ?? "")
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
/**
 * "2029-2031" -> "2029-31": the sketch's own compression, safe whenever the two
 * years share a century (they always will on a 3-season quartile span; the guard is
 * for the pathological case, where the honest print is both years whole).
 */
function windowYears(w) {
  if (w == null || w.state !== "window" || w.open == null || w.close == null)
    return null;
  if (w.open === w.close) return String(w.open);
  const a = String(w.open);
  const b = String(w.close);
  return a.slice(0, 2) === b.slice(0, 2) ? `${a}-${b.slice(2)}` : `${a}-${b}`;
}
/**
 * The Desk's server data: `null` when the corpus cannot be read, `{ seat: null,
 * bug: null, capture: null }` when there is no lens yet, or the real thing -
 * `seat` (the chip and its menu), `bug` (the scorebug strip: `parts` to print,
 * one accessible `label` sentence, one destination) and `capture` (the companion
 * to-do link, or null when there is nothing outstanding).
 *
 * NULL IS A REAL ANSWER AND THE CALLER MUST HANDLE IT. This runs in the root layout,
 * on every route, so a provider outage that threw here would turn one failed fetch
 * into a 500 on every page in the app INCLUDING the ones that need no corpus at all
 * (/about, /settings, /claim/invalid). The navigation itself has no dependency on any
 * of this - the four destinations come from a static registry - so the honest
 * degradation is to render the Desk without its scorebug rather than to take the
 * whole app down for a line of summary text.
 *
 * THE NO-LENS CHECK COMES FIRST, AND IT IS NOT THE SAME QUESTION AS THE ONE ABOVE.
 * D35's middleware (lib/auth/entry.ts) sends a browser with no `parquet_roster`
 * cookie to `/teams` for exactly one reason: `h.me` falls back to the DEPLOY OWNER'S
 * own roster with no cookie to read (see lib/history.ts, `resolveMe`), and a stranger
 * seeing one specific manager's record, standing and to-do count presented as fact
 * before they have chosen anyone is the leak D35 was written to stop. That fix was
 * page content only. The Desk did not exist yet when D35 shipped (it arrived in
 * D41/D52/D53/D65) and it renders in the ROOT LAYOUT, on every route - including the
 * three pages that must work with no lens at all (`/teams`, `/about`,
 * `/claim/invalid`, per `OPEN_PREFIXES`). Curled with a cookieless request: `/teams` -
 * the page whose entire job is asking "whose team are you?" - rendered the deploy
 * owner's real team name and "5-15 · 2025 final · 12th of 14" in the persistent chip
 * at the bottom of the same screen. Same leak, one layer of chrome over, reopened by
 * a component D35 never touched. So this asks the identical question `needsEntryPick`
 * already asks - a lens cookie, not a corpus read - and answers "nobody yet" before
 * ever calling `getLeagueHistory`, rather than fetching a real identity and hoping
 * the caller remembers not to trust it.
 */
export async function getDeskData() {
  if ((await readLensRosterId()) == null) {
    return { seat: null, bug: null, capture: null };
  }
  try {
    const h = await getLeagueHistory();
    const user = h.usersById.get(h.me.userId);
    const teamName = h.me.teamName ?? h.me.displayName;
    const seat = {
      label: teamName,
      avatarId: user?.avatar ?? null,
      teamLogoUrl: user?.teamLogoUrl ?? null,
      sleeperHref: sleeperTeamUrl(h.currentLeague.leagueId, h.me.rosterId),
    };
    // Rule 1. Note what is NOT consulted unless this passes: nothing about the seat
    // holder's own ledger. A reader on someone else's lens gets the scorebug alone,
    // which is public data, and never a count derived from private rows.
    const mayCapture = canCapture(await readSeat(), h.me.userId);
    let capture = null;
    if (mayCapture) {
      const ledger = getLedgerSummary(h, await getPrincipals(h));
      if (ledger.recentUnannotated > 0) {
        capture = {
          href: "/ledger",
          count: ledger.recentUnannotated,
          label:
            ledger.recentUnannotated === 1
              ? "1 new decision to capture - open the ledger"
              : `${ledger.recentUnannotated} new decisions to capture - open the ledger`,
        };
      }
    }
    // The strip. The record comes from `currentFormByRoster` rather than
    // `h.rosters`, because the live snapshot reads 0-0 for most of a dynasty
    // league's year and D29 was written about exactly that bug appearing in exactly
    // this kind of summary line. TCI and the window come from the same derivation
    // /league's board prints (`leagueWindows` -> `cachedLeagueTimelines`), so this
    // strip and the seat card it links to cannot disagree.
    const rosterId = h.me.rosterId;
    const form =
      rosterId != null
        ? (await currentFormByRoster(h)).get(rosterId)
        : undefined;
    const me = leagueWindows(h).me;
    const parts = [teamCode(teamName)];
    const spoken = [];
    if (form) {
      parts.push(`${form.wins}-${form.losses}`, `#${form.rank}/${form.teams}`);
      spoken.push(
        `${form.wins} and ${form.losses}, ${ordinal(form.rank)} of ${form.teams}, ${
          form.isLive ? form.season : `${form.season} final`
        }`,
      );
    } else {
      // No season in the chain has been played yet - a brand new league. The live
      // settings record is the only record there is, and there is no rank to rank.
      const roster = rosterId != null ? h.rostersById.get(rosterId) : undefined;
      const wins = roster?.settings.wins ?? 0;
      const losses = roster?.settings.losses ?? 0;
      parts.push(`${wins}-${losses}`);
      spoken.push(`${wins} and ${losses}, ${h.currentLeague.season} season`);
    }
    if (me) {
      parts.push(`TCI ${me.tci}`);
      spoken.push(`timeline coherence ${me.tci}`);
      const years = windowYears(me);
      // Rule 2: a refused window prints nothing here, not a dash and not the
      // refusal label (which is a sentence-length token a 44pt strip cannot carry
      // whole). The refusal itself, with its reason, is on /league - the strip's
      // own destination.
      if (years != null) {
        parts.push(years);
        spoken.push(`window ${me.open === me.close ? me.open : `${me.open} to ${me.close}`}`);
      }
    }
    return {
      seat,
      bug: {
        href: "/league",
        parts,
        label: `${teamName}: ${spoken.join(", ")}. Open the league board.`,
      },
      capture,
    };
  } catch (err) {
    // Loud, because a silently context-less Desk on every page would be very easy to
    // mistake for a design choice rather than an outage (the same reasoning D36
    // applied to a silently empty ledger).
    console.error(
      `[desk] scorebug unavailable - the corpus could not be read: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
