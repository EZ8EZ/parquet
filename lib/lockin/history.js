/**
 * The viewing manager's own record of points left on the table, from past weeks' final
 * slots: banked score against the same player's best game that week. Locked early = the
 * best game came after the banked one; held too long = it came before (or he rode into a
 * DNP). Hindsight, not a grade: nobody could know the later game in advance, and mid-week
 * lineup moves are invisible, so a slot's player may not have held it for every game.
 */
const EPS = 0.011;
const r1 = (x) => Math.round(x * 10) / 10;

/** pastMatchups: [{ week, matchups }]; logs: Map pid -> normalized log (current season). */
export function managerHistory({ pastMatchups, rosterId, logs, season }) {
  const byWeek = [];
  let slotsCounted = 0;
  let slotsMissing = 0;
  for (const { week, matchups } of [...(pastMatchups || [])].sort((a, b) => a.week - b.week)) {
    const m = (matchups || []).find((x) => x.roster_id === Number(rosterId));
    if (!m) continue;
    let early = 0;
    let late = 0;
    (m.starters || []).forEach((pid, i) => {
      if (!pid || pid === "0") return;
      const log = logs.get(pid);
      if (!log) {
        slotsMissing++;
        return;
      }
      const rows = log.filter((g) => g.season === season && g.week === week && g.complete);
      const played = rows.filter((g) => g.sp > 0);
      if (!played.length) return;
      slotsCounted++;
      const banked = m.starters_points?.[i] ?? 0;
      const best = played.reduce((a, g) => (g.fp > a.fp ? g : a), played[0]);
      if (banked >= best.fp - EPS) return;
      const hit = played.find((g) => Math.abs(g.fp - banked) < EPS);
      if (hit && hit.date < best.date) early += best.fp - banked;
      else late += best.fp - banked;
    });
    byWeek.push({ season, week, leftOnTable: r1(early + late), lockedEarly: r1(early), heldTooLong: r1(late) });
  }
  if (!byWeek.length) return null;
  const n = byWeek.length;
  const mean = (k) => r1(byWeek.reduce((t, w) => t + w[k], 0) / n);
  return {
    weeks: n,
    n,
    leftOnTablePerWeek: mean("leftOnTable"),
    lockedEarlyPerWeek: mean("lockedEarly"),
    heldTooLongPerWeek: mean("heldTooLong"),
    byWeek,
    slotsCounted,
    slotsMissing,
    note: "Hindsight against each player's best game that week; mid-week lineup moves are not visible.",
  };
}
