/**
 * THE DESK'S CONTEXT ROW - the server half of components/Desk.tsx.
 *
 * The Desk's top row answers "what am I looking at": on the left the seat chip (the
 * LENS's team, D35), on the right the one thing that is outstanding. Everything below
 * assembles that from the corpus so the client component receives plain strings and
 * can stay a pure renderer.
 *
 * TWO RULES SHAPE THE RIGHT-HAND HALF, and both are easier to get wrong than right.
 *
 * 1. LENS SAFETY (D35). "27 to capture" is a private count of one manager's
 *    unwritten reasoning, and it is rendered on every page in the app, so it is
 *    exactly the kind of figure that leaks across identities if nobody is watching.
 *    It is gated on `canCapture(seat, lens)` - the same gate Home already applies to
 *    the same number - which is false both when the reader holds no seat and when
 *    they are looking through someone ELSE's lens. In legacy mode (no `AUTH_SECRET`,
 *    which is every deploy today) it is always true and this behaves exactly as the
 *    app always has.
 *
 * 2. THE ZERO STATE IS THE GOAL STATE, so it cannot be dead chrome. Nothing left to
 *    capture is the outcome the whole app is pushing toward; a row that empties out
 *    on success would punish the reader for winning. The fallback is a DURABLE FACT
 *    about the team on the lens - record and standing - which is also precisely what
 *    a reader looking at someone else's team should see instead of a capture count.
 *    So the two rules land on one branch rather than two. The structure is fixed
 *    (a figure, a qualifier, a chevron, one destination); only the content changes.
 *    Deliberately NOT phase-aware and NOT seasonal: a row that reshapes itself around
 *    the calendar is a row nobody can build muscle memory against.
 *
 * The record comes from `currentFormByRoster` rather than `h.rosters`, because the
 * live snapshot reads 0-0 for most of a dynasty league's year and D29 was written
 * about exactly that bug appearing in exactly this kind of summary line. It is only
 * awaited on the branch that needs it, so the common case (something to capture)
 * never pays for `loadSeasonRosters`.
 */
import { getLeagueHistory } from "./history";
import { getLedgerSummary } from "./ledger";
import { getPrincipals } from "./principals";
import { currentFormByRoster } from "./roster";
import { ordinal } from "./derive/describe";
import { canCapture, readSeat } from "./auth/server";
import { sleeperTeamUrl } from "./sleeperLinks";

export interface DeskSeat {
  /** The lens team's name, for the chip. Never the reader's - see D35. */
  label: string;
  avatarId: string | null;
  teamLogoUrl: string | null;
  /** Deep link to this team on Sleeper, or null against the fixture provider. */
  sleeperHref: string | null;
}

export interface DeskStatus {
  href: string;
  /** The figure that leads the line ("27", "5-15"). */
  lead: string;
  /** What the figure means ("to capture", "12th of 14"). */
  rest: string;
  /**
   * `todo` is an outstanding action and is drawn in the accent; `fact` is a standing
   * truth and is drawn quietly. The tone is data rather than a class name because
   * which one applies is a lens/seat decision, not a styling one.
   */
  tone: "todo" | "fact";
}

export interface DeskData {
  seat: DeskSeat;
  status: DeskStatus;
}

/**
 * The Desk's server data, or null when the corpus cannot be read.
 *
 * NULL IS A REAL ANSWER AND THE CALLER MUST HANDLE IT. This runs in the root layout,
 * on every route, so a provider outage that threw here would turn one failed fetch
 * into a 500 on every page in the app INCLUDING the ones that need no corpus at all
 * (/about, /settings, /claim/invalid). The navigation itself has no dependency on any
 * of this - the four destinations come from a static registry - so the honest
 * degradation is to render the Desk without its context row rather than to take the
 * whole app down for a line of summary text.
 */
export async function getDeskData(): Promise<DeskData | null> {
  try {
    const h = await getLeagueHistory();
    const user = h.usersById.get(h.me.userId);

    const seat: DeskSeat = {
      label: h.me.teamName ?? h.me.displayName,
      avatarId: user?.avatar ?? null,
      teamLogoUrl: user?.teamLogoUrl ?? null,
      sleeperHref: sleeperTeamUrl(h.currentLeague.leagueId, h.me.rosterId),
    };

    // Rule 1. Note what is NOT consulted on the other side of this: nothing about
    // the seat holder's own ledger. A reader on someone else's lens gets the record
    // branch, which is public data, and never a count derived from private rows.
    const mayCapture = canCapture(await readSeat(), h.me.userId);
    if (mayCapture) {
      const ledger = getLedgerSummary(h, await getPrincipals(h));
      if (ledger.unannotatedNotable > 0) {
        return {
          seat,
          status: {
            href: "/ledger",
            lead: String(ledger.unannotatedNotable),
            rest: `to capture · ${ledger.annotated}/${ledger.notable} annotated`,
            tone: "todo",
          },
        };
      }
    }

    // Rule 2. The same line for "you are done" and for "this is not your team".
    const rosterId = h.me.rosterId;
    const form = rosterId != null ? (await currentFormByRoster(h)).get(rosterId) : undefined;
    if (form) {
      return {
        seat,
        status: {
          href: "/league",
          lead: `${form.wins}-${form.losses}`,
          rest: `${form.isLive ? form.season : `${form.season} final`} · ${ordinal(form.rank)} of ${form.teams}`,
          tone: "fact",
        },
      };
    }

    // No season in the chain has been played yet - a brand new league. Still a fact
    // about the team on the lens, still the same shape, still a real destination.
    const roster = rosterId != null ? h.rostersById.get(rosterId) : undefined;
    return {
      seat,
      status: {
        href: "/league",
        lead: `${roster?.settings.wins ?? 0}-${roster?.settings.losses ?? 0}`,
        rest: `${h.currentLeague.season} season`,
        tone: "fact",
      },
    };
  } catch (err) {
    // Loud, because a silently context-less Desk on every page would be very easy to
    // mistake for a design choice rather than an outage (the same reasoning D36
    // applied to a silently empty ledger).
    console.error(
      `[desk] context row unavailable - the corpus could not be read: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}
