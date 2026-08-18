import { tenureLabel } from "../principals.js";
export function partnerIdentity(h, principals, tp) {
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
