/**
 * SEASON RECAP - a narrative built entirely from machinery that already exists and is
 * already calibrated: the ledger (your own decisions), Superlatives (the awards you
 * currently hold), the timeline/fragility indices (where your roster stands today),
 * and the same season-ranking logic `/roster` and `/league` already use for "current
 * form". Nothing here is a new metric - every number is read straight off a module
 * that owns it.
 *
 * THE OFFSEASON PROBLEM, decided up front rather than discovered mid-build: this app
 * has no concept of "the season so far" worth narrating, because a season in progress
 * has no ending yet to recap. So this ALWAYS recaps the most recently COMPLETE season
 * in the chain (`LeagueDetail.status === "complete"`), never the current one, even if
 * the current season already has games played. That is a stricter bar than
 * `currentFormByRoster`'s "has anyone got a real record yet", which is why this file
 * does its own walk rather than reusing that function's season-picking outright (it
 * DOES reuse that function's ranking core, `rankSeasonRosters`, once it has picked the
 * season). A league with zero completed seasons returns null and the page says so.
 *
 * OWNERSHIP HANDOVERS: a roster that changed hands is not the same manager. Before
 * calling any of this "yours", the recap checks `principals.ownerAt(season, rosterId)`
 * against the viewer - the same check D22 exists to enforce everywhere else history is
 * attributed to a person. A viewer who took over the roster after the recapped season
 * gets an honest note instead of a stranger's record presented as their own.
 */
import type { LeagueHistory } from "./history";
import { getPrincipals } from "./principals";
import { getLedgerEntries, type LedgerEntry } from "./ledger";
import { awardsPageData, type Award } from "./superlatives";
import { leagueTimelines, type TimelineProfile } from "./metrics/duration";
import { getFragilityProfile, type FragilityProfile } from "./metrics/fragility";
import { loadSeasonRosters, foldStartRate } from "./metrics/skill";
import { rankSeasonRosters, type CurrentForm } from "./roster";
import { resolvedPickTimeline, type PickResolution } from "./digest";

/** Plain-language read of a league status that isn't "complete", for the header's
 *  dateline note. Widened rather than a strict union - see TransactionType for the
 *  same "provider may emit values we haven't seen" reasoning. */
function statusPhrase(status: string): string {
  if (status === "pre_draft") return "hasn't tipped off yet";
  if (status === "drafting") return "is mid-draft";
  if (status === "in_season") return "is still being played";
  return "is still in progress";
}

export interface SeasonRecap {
  season: string;
  /** True when the recapped season is also the newest one in the chain (nothing
   *  newer to caveat about). False means a note is worth showing. */
  isNewestSeason: boolean;
  /** Set only when `!isNewestSeason` - the header's "why not this year" line. */
  currentSeasonNote: string | null;
  /** False if the viewer only took this roster over after the recapped season -
   *  every "you" in the copy should read as "the team" instead. */
  viewerWasOwner: boolean;
  record: CurrentForm;
  /** fpts/ppts for the recapped season alone, via the same fold every career
   *  start-rate number uses - never fabricated, never divides by zero. */
  startRate: { fpts: number; ppts: number; rate: number } | null;
  /** The viewer's own decisions that season - same rows `/ledger` shows, same bar
   *  for what counts as notable. */
  decisions: LedgerEntry[];
  notableDecisions: number;
  /** Traded picks that turned into a player during this season's draft - the same
   *  list the digest already computes, filtered to this one season. */
  picksResolved: PickResolution[];
  /** Career awards the viewer holds RIGHT NOW - not "won that season" (Superlatives
   *  has no per-season notion), and the copy must say so. */
  awardsHeld: Award[];
  /** Present-day reading, explicitly NOT historical - see file header. */
  timelineToday: TimelineProfile | null;
  fragilityToday: FragilityProfile | null;
}

export async function loadSeasonRecap(h: LeagueHistory): Promise<SeasonRecap | null> {
  const meRosterId = h.me.rosterId;
  if (meRosterId == null) return null;

  // Newest-first walk for the first season the chain itself calls complete - a
  // stricter bar than "somebody has a record", which is what keeps this from ever
  // recapping a season that is still being played.
  let recapLeague = null;
  for (let i = h.chain.length - 1; i >= 0; i--) {
    if (h.chain[i].status === "complete") {
      recapLeague = h.chain[i];
      break;
    }
  }
  if (!recapLeague) return null;
  const season = recapLeague.season;

  const [principals, bySeason, awardsData, allPickResolutions] = await Promise.all([
    getPrincipals(h),
    loadSeasonRosters(h),
    awardsPageData(h),
    resolvedPickTimeline(h),
  ]);
  const allDecisions = getLedgerEntries(h); // pure, no request scope needed

  const rosters = bySeason.get(season);
  if (!rosters) return null; // the chain says complete but the provider has no rows - degrade, don't guess

  const ranked = rankSeasonRosters(rosters, season, false);
  const record = ranked.get(meRosterId);
  if (!record) return null;

  const rosterRow = rosters.find((r) => r.rosterId === meRosterId) ?? null;
  const startRate =
    rosterRow && rosterRow.settings.ppts > 0 && rosterRow.settings.fpts > 0
      ? (() => {
          const p = foldStartRate(h.me.userId, meRosterId, [
            {
              season,
              fpts: rosterRow.settings.fpts,
              ppts: rosterRow.settings.ppts,
              startRate: rosterRow.settings.fpts / rosterRow.settings.ppts,
            },
          ]);
          return { fpts: p.fpts, ppts: p.ppts, rate: p.startRate };
        })()
      : null;

  const viewerWasOwner = principals.ownerAt(season, meRosterId) === h.me.userId;

  const decisions = allDecisions.filter((e) => e.season === season);
  const picksResolved = allPickResolutions.filter((p) => p.season === season);
  const awardsHeld = awardsData.awards.filter((a) => a.winner.rosterId === meRosterId);

  const timelineToday = leagueTimelines(h).find((t) => t.rosterId === meRosterId) ?? null;
  const fragilityToday = getFragilityProfile(h, meRosterId);

  const isNewestSeason = season === h.chain[h.chain.length - 1].season;

  return {
    season,
    isNewestSeason,
    currentSeasonNote: isNewestSeason
      ? null
      : `The ${h.currentLeague.season} season ${statusPhrase(h.currentLeague.status)}.`,
    viewerWasOwner,
    record,
    startRate,
    decisions,
    notableDecisions: decisions.filter((e) => e.notable).length,
    picksResolved,
    awardsHeld,
    timelineToday,
    fragilityToday,
  };
}
