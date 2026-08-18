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
