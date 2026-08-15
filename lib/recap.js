import { getPrincipals } from "./principals";
import { getLedgerEntries } from "./ledger";
import { awardsPageData } from "./superlatives";
import { leagueTimelines } from "./metrics/duration";
import { getFragilityProfile } from "./metrics/fragility";
import { loadSeasonRosters, foldStartRate } from "./metrics/skill";
import { rankSeasonRosters } from "./roster";
import { resolvedPickTimeline } from "./digest";
import { seasonResult } from "./playoffs";
/** Plain-language read of a league status that isn't "complete", for the header's
 *  dateline note. Widened rather than a strict union - see TransactionType for the
 *  same "provider may emit values we haven't seen" reasoning. */
function statusPhrase(status) {
  if (status === "pre_draft") return "hasn't tipped off yet";
  if (status === "drafting") return "is mid-draft";
  if (status === "in_season") return "is still being played";
  return "is still in progress";
}
export async function loadSeasonRecap(h) {
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
  const [principals, bySeason, awardsData, allPickResolutions] =
    await Promise.all([
      getPrincipals(h),
      loadSeasonRosters(h),
      awardsPageData(h),
      resolvedPickTimeline(h),
    ]);
  const allDecisions = getLedgerEntries(h, principals); // pure, no request scope needed
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
  const awardsHeld = awardsData.awards.filter(
    (a) => a.winner.rosterId === meRosterId,
  );
  const timelineToday =
    leagueTimelines(h).find((t) => t.rosterId === meRosterId) ?? null;
  const fragilityToday = getFragilityProfile(h, meRosterId);
  const isNewestSeason = season === h.chain[h.chain.length - 1].season;
  // The champion, named as the PERSON who held that roster that season rather than
  // whoever holds it today - the same `ownerAt` rule the rest of this file follows.
  const bracket = h.brackets.get(season) ?? [];
  const result = seasonResult(season, bracket);
  const nameOfRoster = (rosterId) => {
    if (rosterId == null) return null;
    const ownerId = principals.ownerAt(season, rosterId);
    const pr = ownerId ? principals.byOwnerId.get(ownerId) : undefined;
    if (pr) return pr.teamName || pr.displayName;
    return h.rostersById.get(rosterId) ? `Roster ${rosterId}` : null;
  };
  const champion =
    result.championRosterId != null
      ? {
          rosterId: result.championRosterId,
          name:
            nameOfRoster(result.championRosterId) ??
            `Roster ${result.championRosterId}`,
          isViewer:
            principals.ownerAt(season, result.championRosterId) === h.me.userId,
          runnerUpName: nameOfRoster(result.runnerUpRosterId),
          viewerPlace: result.placeByRoster.get(meRosterId) ?? null,
        }
      : null;
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
    champion,
  };
}
