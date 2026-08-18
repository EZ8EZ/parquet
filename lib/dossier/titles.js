/**
 * TITLES ON THE DOSSIER - formatting only, no new attribution.
 *
 * `lib/playoffs.ts`'s `titlesByOwner` already credits every championship to the
 * PRINCIPAL who actually won it, through `principals.ownerAt` (D22's primitive) - a
 * roster that changed hands keeps its departed manager's ring rather than handing it
 * to whoever holds the roster id now. This file's only job is turning that owner ->
 * seasons map into the label the dossier pages and Manager Compare render.
 *
 * ZERO IS SILENCE, ON PURPOSE. A manager with no titles gets nothing back from
 * `titleSummariesByOwner` - not a "0 titles" line. Per D6 (thesis over letter grades),
 * the app already refuses to hand out a verdict; a ring count of zero is not a fact
 * worth stating about someone, only one worth withholding. The current, undecided
 * season contributes nothing here for the same reason it contributes nothing to
 * `titlesByOwner`: an in-progress bracket has no winner yet, not a winner of zero.
 */
import { titlesByOwner } from "../playoffs.js";
/** `null` for an empty list - there is no zero-title summary, only no summary. */
export function titleSummary(seasonsWon) {
  if (seasonsWon.length === 0) return null;
  const seasons = [...seasonsWon].sort();
  const label =
    seasons.length === 1
      ? `${seasons[0]} champion`
      : `${seasons.length}x champion (${seasons.join(", ")})`;
  return { count: seasons.length, seasons, label };
}
/**
 * ownerId -> title summary, current and former principals alike (`titlesByOwner`
 * keys by owner id, which is exactly what survives a roster handover). Owners with
 * no titles are simply absent from the map - see the file header on why.
 */
export function titleSummariesByOwner(h, principals) {
  const out = new Map();
  for (const [ownerId, seasons] of titlesByOwner(h, principals)) {
    const s = titleSummary(seasons);
    if (s) out.set(ownerId, s);
  }
  return out;
}
