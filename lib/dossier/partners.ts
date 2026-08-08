/**
 * How to PRINT a trade partner - the display half of the same repair `TradePartner`
 * made to the counting half.
 *
 * A partner row used to be rendered straight from `h.rostersById.get(rosterId)`, which
 * names, pictures and links whoever holds that seat TODAY. For a partner who has since
 * left the league that is somebody else's name, somebody else's badge and somebody
 * else's dossier, attached to deals they had no part in. Both dossier surfaces and the
 * home page rendered it that way, so all three agreed with each other and disagreed
 * with the deal record, which has been principal-keyed since D22.
 *
 * One helper rather than three near-identical closures, for the reason the third copy
 * always proves: they had already drifted on which fallback name to use.
 */
import type { LeagueHistory } from "../history";
import type { TradePartner } from "../derive/manager";
import type { PrincipalIndex } from "../principals";
import { tenureLabel } from "../principals";

export interface PartnerIdentity {
  /** Team name if they have one, else their handle. */
  name: string;
  avatarId: string | null;
  teamLogoUrl: string | null;
  /** Their dossier: the seat's page for a current manager, their own for a departed one. */
  href: string;
  /** e.g. "2022-2024". Set only for a manager who has left. */
  tenureLabel: string | undefined;
  isFormer: boolean;
}

export function partnerIdentity(
  h: LeagueHistory,
  principals: PrincipalIndex,
  tp: TradePartner,
): PartnerIdentity {
  const pr = tp.ownerId ? principals.byOwnerId.get(tp.ownerId) : undefined;
  if (pr) {
    return {
      name: pr.teamName || pr.displayName,
      avatarId: pr.avatar,
      teamLogoUrl: pr.teamLogoUrl,
      href: pr.isFormer
        ? `/managers/former/${pr.ownerId}`
        : `/managers/${pr.currentRosterId ?? pr.lastRosterId}`,
      tenureLabel: tenureLabel(pr),
      isFormer: pr.isFormer,
    };
  }
  // No principal index for this partner (a provider with no per-season rosters):
  // degrade to the seat, exactly as before.
  const r = h.rostersById.get(tp.rosterId);
  const u = r?.ownerId ? h.usersById.get(r.ownerId) : undefined;
  return {
    name: u?.teamName ?? u?.displayName ?? tp.displayName,
    avatarId: u?.avatar ?? null,
    teamLogoUrl: u?.teamLogoUrl ?? null,
    href: `/managers/${tp.rosterId}`,
    tenureLabel: undefined,
    isFormer: false,
  };
}
