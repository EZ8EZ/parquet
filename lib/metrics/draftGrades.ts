/**
 * DRAFT REPORT CARDS - presentation over `gradeDraft`, one card per SEASON rather
 * than one profile per OWNER (that is what `draftCaptureProfiles` in ./skill already
 * does). No new modeling happens here: every number is `GradedPick` from that file,
 * folded a different way so a whole draft class reads as one card instead of being
 * split across however many managers were on the clock that year.
 *
 * Two decisions carried over verbatim rather than re-litigated:
 *
 *   - No letter grades. DECISIONS D6 already settled this for the trade evaluator
 *     ("outputs a thesis, not a letter grade... that is explicitly what competitors
 *     ship"), and the same reasoning applies here. The headline number is the actual
 *     capture rate, stated as a percentage, exactly like "The Scout" on Superlatives.
 *   - The startup draft does not get a "worst slot-surplus miss" headline. DECISIONS
 *     D27 excludes the startup from that comparison for good reason: slot surplus is
 *     normalized per draft size so a three-round class is comparable with another
 *     three-round class, but there is only ever one startup, so nothing exists to
 *     compare it against, and D27 says pool capture is "the right lens" for it
 *     instead. This file follows that lens rather than inventing a comparison the
 *     metric was never built to support: a startup season's card substitutes its
 *     weakest pool-capture pick for the slot-surplus miss.
 */
import type { LeagueHistory } from "../history";
import type { PrincipalIndex } from "../principals";
import { valuePlayers } from "../valuation";
import { buildDraftIndex } from "../lineage";
import { gradeDraft, startupSeasons, type GradedPick } from "./skill";

export interface SeasonDraftGrade {
  season: string;
  draftId: string;
  /** See the file header: changes which "miss" headline is shown. */
  isStartup: boolean;
  rounds: number;
  teams: number;
  /** Picks made in this draft, including keepers and the one pick nothing sat behind. */
  totalPicks: number;
  /** Picks that could actually be graded. See `gradeDraft` for why some cannot be. */
  gradedPicks: number;
  captured: number;
  capturable: number;
  /** captured / capturable, 0..1 - this draft's own version of "The Scout". */
  captureRate: number;
  /** Total value left on the board across every graded pick. Always <= 0. */
  regret: number;
  /** Best pick this draft by pool capture. */
  best: GradedPick | null;
  /** Worst pick this draft by pool capture - the startup card's headline miss. */
  worst: GradedPick | null;
  /** Best pick by slot surplus ("the steal"). Null for the startup - see header. */
  steal: GradedPick | null;
  /** Worst pick by slot surplus ("the reach"). Null for the startup - see header. */
  bust: GradedPick | null;
}

/**
 * Pure core: fold one season's already-graded picks into a report card.
 *
 * Sorting mirrors `foldDraftCapture` in ./skill exactly (capture first, tie-broken by
 * the size of the opportunity, then pick number; surplus rate, tie-broken by pick
 * number) so a season's card and that owner's career profile can never disagree
 * about what "best" or "worst" means for the same underlying numbers.
 */
export function foldSeasonDraftGrade(
  season: string,
  meta: {
    draftId: string;
    rounds: number;
    teams: number;
    totalPicks: number;
    isStartup: boolean;
  },
  graded: GradedPick[],
): SeasonDraftGrade {
  const captured = graded.reduce((s, g) => s + (g.value - g.worstAvailable), 0);
  const capturable = graded.reduce(
    (s, g) => s + (g.bestAvailable - g.worstAvailable),
    0,
  );
  const byCapture = [...graded].sort(
    (a, b) =>
      b.capture - a.capture ||
      b.bestAvailable - b.worstAvailable - (a.bestAvailable - a.worstAvailable) ||
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
export async function seasonDraftGrades(
  h: LeagueHistory,
  principals: PrincipalIndex,
): Promise<SeasonDraftGrade[]> {
  const index = await buildDraftIndex(h);
  if (!index.supported) return [];

  const values = valuePlayers(
    [...h.players.values()],
    h.currentLeague.scoringSettings,
  );
  const valueOf = (id: string) => values.get(id)?.value ?? 0;
  const nameOf = (id: string) => h.players.get(id)?.fullName ?? id;

  const complete = [...index.bySeason].filter(
    ([, sd]) => sd.draft.status === "complete",
  );
  const startups = startupSeasons(
    complete.map(([season, sd]) => ({ season, rounds: sd.draft.rounds })),
  );

  const out: SeasonDraftGrade[] = [];
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
