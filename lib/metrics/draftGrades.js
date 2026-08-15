import { cachedValuePlayers } from "../valuation";
import { buildDraftIndex } from "../lineage";
import { gradeDraft, startupSeasons } from "./skill";
/**
 * Pure core: fold one season's already-graded picks into a report card.
 *
 * Sorting mirrors `foldDraftCapture` in ./skill exactly (capture first, tie-broken by
 * the size of the opportunity, then pick number; surplus rate, tie-broken by pick
 * number) so a season's card and that owner's career profile can never disagree
 * about what "best" or "worst" means for the same underlying numbers.
 */
export function foldSeasonDraftGrade(season, meta, graded) {
  const captured = graded.reduce((s, g) => s + (g.value - g.worstAvailable), 0);
  const capturable = graded.reduce(
    (s, g) => s + (g.bestAvailable - g.worstAvailable),
    0,
  );
  const byCapture = [...graded].sort(
    (a, b) =>
      b.capture - a.capture ||
      b.bestAvailable -
        b.worstAvailable -
        (a.bestAvailable - a.worstAvailable) ||
      a.pickNo - b.pickNo,
  );
  const bySurplus = [...graded].sort(
    (a, b) => b.slotSurplusRate - a.slotSurplusRate || a.pickNo - b.pickNo,
  );
  return {
    season,
    draftId: meta.draftId,
    isStartup: meta.isStartup,
    rounds: meta.rounds,
    teams: meta.teams,
    totalPicks: meta.totalPicks,
    gradedPicks: graded.length,
    captured: Math.round(captured),
    capturable: Math.round(capturable),
    captureRate: capturable > 0 ? captured / capturable : 0,
    regret: Math.round(graded.reduce((s, g) => s + g.regret, 0)),
    best: byCapture[0] ?? null,
    worst: byCapture.length > 1 ? byCapture[byCapture.length - 1] : null,
    steal: meta.isStartup ? null : (bySurplus[0] ?? null),
    bust: meta.isStartup
      ? null
      : bySurplus.length > 1
        ? bySurplus[bySurplus.length - 1]
        : null,
  };
}
/**
 * Report cards for every completed draft in the chain, newest season first.
 *
 * Loading mirrors `draftCaptureProfiles` in ./skill exactly: same draft index, same
 * self-calibrating startup detection, same valuation snapshot - the only difference
 * is the fold at the end groups by season instead of by owner. Never throws: a
 * provider without draft support, or a draft too small to grade, simply produces an
 * empty list rather than an error.
 */
export async function seasonDraftGrades(h, principals) {
  const index = await buildDraftIndex(h);
  if (!index.supported) return [];
  const values = cachedValuePlayers(h);
  const valueOf = (id) => values.get(id)?.value ?? 0;
  const nameOf = (id) => h.players.get(id)?.fullName ?? id;
  const complete = [...index.bySeason].filter(
    ([, sd]) => sd.draft.status === "complete",
  );
  const startups = startupSeasons(
    complete.map(([season, sd]) => ({ season, rounds: sd.draft.rounds })),
  );
  const out = [];
  for (const [season, sd] of complete) {
    const isStartup = startups.has(season);
    const graded = gradeDraft(
      season,
      sd.picks,
      valueOf,
      nameOf,
      principals.ownerAt,
      isStartup,
    );
    if (graded.length === 0) continue; // nothing gradeable - e.g. a two-team pool
    out.push(
      foldSeasonDraftGrade(
        season,
        {
          draftId: sd.draft.draftId,
          rounds: sd.draft.rounds,
          teams: sd.draft.teams,
          totalPicks: sd.picks.length,
          isStartup,
        },
        graded,
      ),
    );
  }
  return out.sort((a, b) => b.season.localeCompare(a.season));
}
