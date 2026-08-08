/**
 * The async half of pick agency, kept out of `lib/agency/index.ts` for the same
 * reason `lib/provenance/source.ts` exists: the pure derivation must not drag the
 * provider and its loaders into every module that only wants to read a pick.
 *
 * Both loaders below are already on demand and memoized behind their own 5 minute
 * TTLs (D25), and both are already paid by the pages that call this, so the fidelity
 * check costs no new requests on /roster.
 */
import type { LeagueHistory } from "../history";
import { buildDraftIndex } from "../lineage";
import { loadSeasonRosters } from "../metrics/skill";
import { draftOrderFidelity, type DraftOrderFidelity } from "./index";

export async function loadDraftOrderFidelity(
  h: LeagueHistory,
): Promise<DraftOrderFidelity> {
  const [index, seasonRosters] = await Promise.all([
    buildDraftIndex(h),
    loadSeasonRosters(h),
  ]);
  const drafts = new Map<
    string,
    { slotToRosterId: Record<number, number>; rounds: number }
  >();
  for (const [season, sd] of index.bySeason) {
    // The startup draft is not ordered by a previous season's standings (there is no
    // previous season), so comparing it against one would manufacture a deviation.
    // `startupSeasons` lives in lib/metrics/skill and needs the whole draft set; the
    // cheap local equivalent is that a startup has no prior season in the chain.
    if (!index.bySeason.has(String(parseInt(season, 10) - 1))) continue;
    drafts.set(season, {
      slotToRosterId: sd.draft.slotToRosterId,
      rounds: sd.draft.rounds,
    });
  }
  return draftOrderFidelity(h, drafts, seasonRosters);
}
