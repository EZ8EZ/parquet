/**
 * Standings rows for the League tab: the league's own order (win differential, then
 * points) beside each roster's rank by asset value. Pure; the page passes in the
 * current form map and the value ranking it already loaded.
 */
export function standingsRows({ forms, ranked, users, rostersById, meId }) {
  const valueRank = new Map(ranked.map((r, i) => [r.rosterId, i + 1]));
  const rows = ranked.map((r) => {
    const f = forms.get(r.rosterId);
    const ownerId = rostersById.get(r.rosterId)?.ownerId;
    const user = ownerId ? users.get(ownerId) : undefined;
    return {
      rosterId: r.rosterId,
      name: r.teamName ?? r.ownerName,
      ownerName: r.ownerName,
      avatarId: user?.avatar ?? null,
      teamLogoUrl: user?.teamLogoUrl ?? null,
      isMe: r.rosterId === meId,
      rank: f?.rank ?? null,
      wins: f?.wins ?? null,
      losses: f?.losses ?? null,
      pointsFor: f?.fpts ?? null,
      valueRank: valueRank.get(r.rosterId),
    };
  });
  // Points-for rank among rosters with a points total; null when there is none.
  const byPf = rows.filter((r) => r.pointsFor != null).sort((a, b) => b.pointsFor - a.pointsFor);
  for (const r of rows) {
    const i = byPf.indexOf(r);
    r.pfRank = i === -1 ? null : i + 1;
  }
  const anyForm = rows.some((r) => r.rank != null);
  const sorted = anyForm
    ? rows.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    : rows.sort((a, b) => a.valueRank - b.valueRank);
  const first = [...forms.values()][0];
  return {
    rows: sorted,
    me: sorted.find((r) => r.isMe) ?? null,
    season: first?.season ?? null,
    isLive: first?.isLive ?? false,
    hasRecords: anyForm,
  };
}
