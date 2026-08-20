import { buildDraftIndex } from "../lineage/index.js";
import { loadSeasonRosters } from "../metrics/skill.js";
import { draftOrderFidelity } from "./index.js";
export async function loadDraftOrderFidelity(h) {
  const [index, seasonRosters] = await Promise.all([
    buildDraftIndex(h),
    loadSeasonRosters(h),
  ]);
  const drafts = new Map();
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
/**
 * PUBLISHED DRAFT SLOTS, keyed `season|originalRoster` for `readPickAgency`.
 *
 * A settled pick is one whose ordering season is over, and in this league that means the
 * draft order for it has been published even when the draft itself has not been held: the
 * 2026 draft sits in `pre_draft` with a full slot map. That is what lets a settled row
 * print an exact slot instead of an estimate.
 *
 * This adds no requests. `buildDraftIndex` is the same TTL-memoized loader
 * `loadDraftOrderFidelity` and `loadProvenanceSource` already call on these pages (D25),
 * and `slotOf` is a map the index has always built and nobody had used here.
 */
export async function loadPickSlots(h) {
  const index = await buildDraftIndex(h);
  const out = new Map();
  for (const [season, sd] of index.bySeason) {
    const teams = Object.keys(sd.draft.slotToRosterId).length;
    if (!teams) continue;
    for (const [rosterId, slot] of sd.slotOf) {
      out.set(`${season}|${rosterId}`, { slot, teams });
    }
  }
  return out;
}
