const DAY = 86_400_000;
function ageBand(age) {
  if (age == null) return "unknown";
  if (age < 23) return "under 23";
  if (age < 27) return "23-26";
  if (age < 31) return "27-30";
  return "31+";
}
/** Build a season|week -> rosterId -> 'W'|'L' result index from matchups. */
function resultIndex(h) {
  const groups = new Map();
  for (const m of h.matchups) {
    if (m.matchupId == null) continue;
    const key = `${m.season}|${m.week}|${m.matchupId}`;
    (groups.get(key) ?? groups.set(key, []).get(key)).push({
      rosterId: m.rosterId,
      points: m.points,
    });
  }
  const out = new Map();
  for (const [key, pair] of groups) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    const [season, week] = key.split("|");
    const aWon = a.points >= b.points;
    out.set(`${season}|${week}|${a.rosterId}`, aWon ? "W" : "L");
    out.set(`${season}|${week}|${b.rosterId}`, aWon ? "L" : "W");
  }
  return out;
}
function seasonYear(season) {
  return parseInt(season, 10);
}
export function deriveManagerProfile(
  h,
  rosterId,
  scope,
  /** Resolves the OTHER side of a trade to the person who actually sat in that seat
   *  that season. Omit and partner identity degrades to the old seat-keyed behaviour,
   *  which is exactly right for a league that has never had a handover and exactly
   *  wrong for one that has. See `TradePartner`. */
  principals,
) {
  const roster = h.rostersById.get(rosterId);
  const userId = scope ? scope.ownerId : (roster?.ownerId ?? null);
  const user = userId ? h.usersById.get(userId) : undefined;
  const results = resultIndex(h);
  const seasons = scope?.seasons;
  const mine = h.transactions.filter(
    (t) => involves(t, rosterId) && (!seasons || seasons.has(t.season)),
  );
  const trades = mine.filter((t) => t.type === "trade");
  const waivers = mine.filter((t) => t.type === "waiver");
  const freeAgents = mine.filter((t) => t.type === "free_agent");
  // Initiate vs respond (creator is a userId).
  let tradesInitiated = 0;
  for (const t of trades) if (userId && t.creator === userId) tradesInitiated++;
  const tradesResponded = trades.length - tradesInitiated;
  // Trades by season.
  const tradesBySeason = countBySeason(trades);
  // Trade partners, keyed by the PRINCIPAL on the other side of each deal - see the
  // `TradePartner` doc comment for what seat-keying got wrong. Without a principal
  // index the key falls back to the seat, which reproduces the old output byte for
  // byte for a league that has never had a handover.
  const partnerCounts = new Map();
  for (const t of trades) {
    for (const rid of t.rosterIds) {
      if (rid === rosterId) continue;
      const ownerId = principals?.ownerAt(t.season, rid) ?? null;
      const partner = ownerId ? principals?.byOwnerId.get(ownerId) : undefined;
      const key = ownerId ?? `roster:${rid}`;
      const prev = partnerCounts.get(key);
      if (prev) {
        prev.count++;
        continue;
      }
      partnerCounts.set(key, {
        // A departed principal's page lives at their owner id, not at the seat they
        // used to hold - that route belongs to their successor now.
        rosterId: partner
          ? (partner.currentRosterId ?? partner.lastRosterId)
          : rid,
        ownerId,
        isFormer: partner?.isFormer ?? false,
        displayName: partner?.displayName ?? nameForRoster(h, rid),
        count: 1,
      });
    }
  }
  const tradePartners = [...partnerCounts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.displayName.localeCompare(b.displayName) ||
      a.rosterId - b.rosterId,
  );
  // Acquisitions / disposals with age-at-event.
  const acqAges = [];
  const acqAgeBySeasonMap = new Map();
  const dispAges = [];
  let overAgeAcquisitions = 0;
  for (const t of mine) {
    const yr = seasonYear(t.season);
    for (const [pid, rid] of Object.entries(t.adds)) {
      if (rid !== rosterId) continue;
      const age = ageAtSeason(h, pid, yr);
      if (age != null) {
        acqAges.push(age);
        (
          acqAgeBySeasonMap.get(t.season) ??
          acqAgeBySeasonMap.set(t.season, []).get(t.season)
        ).push(age);
        if (t.type === "trade" && age >= 30) overAgeAcquisitions++;
      }
    }
    for (const [pid, rid] of Object.entries(t.drops)) {
      if (rid !== rosterId) continue;
      const age = ageAtSeason(h, pid, yr);
      if (age != null) dispAges.push(age);
    }
  }
  const ageBySeason = [...acqAgeBySeasonMap.entries()]
    .map(([season, ages]) => ({
      season,
      avgAge: avg(ages),
      count: ages.length,
    }))
    .sort((a, b) => a.season.localeCompare(b.season));
  // Pick flow.
  let acquired = 0,
    spent = 0,
    firstsAcquired = 0,
    firstsSpent = 0;
  for (const t of trades) {
    for (const dp of t.draftPicks) {
      if (dp.ownerId === rosterId && dp.previousOwnerId !== rosterId) {
        acquired++;
        if (dp.round === 1) firstsAcquired++;
      } else if (dp.previousOwnerId === rosterId && dp.ownerId !== rosterId) {
        spent++;
        if (dp.round === 1) firstsSpent++;
      }
    }
  }
  // Holding period (pair adds -> subsequent drops for this roster).
  const holding = computeHolding(h, rosterId);
  // After-loss vs after-win (trades initiated by this manager).
  let afterLoss = null;
  if (h.matchups.length) {
    let al = 0,
      aw = 0,
      tot = 0;
    for (const t of trades) {
      if (userId && t.creator !== userId) continue; // only self-initiated
      if (t.week <= 1) continue;
      const prev = results.get(`${t.season}|${t.week - 1}|${rosterId}`);
      if (prev === "L") {
        al++;
        tot++;
      } else if (prev === "W") {
        aw++;
        tot++;
      }
    }
    afterLoss = { afterLoss: al, afterWin: aw, total: tot };
  }
  // Deadline behavior (weeks >= 16 = around the trade deadline).
  let buys = 0,
    sells = 0;
  for (const t of trades) {
    if (t.week < 16) continue;
    const picksOut = t.draftPicks.filter(
      (d) => d.previousOwnerId === rosterId,
    ).length;
    const picksIn = t.draftPicks.filter(
      (d) => d.ownerId === rosterId && d.previousOwnerId !== rosterId,
    ).length;
    if (picksOut > picksIn) buys++;
    else if (picksIn > picksOut) sells++;
  }
  // Revealed posture by season.
  const postureBySeason = derivePosture(h, rosterId, trades);
  // FAAB aggression.
  const bids = waivers.map((t) => t.waiverBid ?? 0).filter((b) => b > 0);
  const faabAggression = bids.length ? avg(bids) : null;
  return {
    rosterId,
    userId,
    // A departed principal is not in the current users list, so the scope carries the
    // name that only their own seasons still know.
    displayName:
      user?.displayName ?? scope?.displayName ?? `Roster ${rosterId}`,
    teamName: user?.teamName ?? scope?.teamName ?? null,
    totalTransactions: mine.length,
    trades: trades.length,
    waivers: waivers.length,
    freeAgents: freeAgents.length,
    tradesInitiated,
    tradesResponded,
    tradesBySeason,
    tradePartners,
    acquisitions: { count: acqAges.length, avgAge: avg(acqAges), ageBySeason },
    disposals: { count: dispAges.length, avgAge: avg(dispAges) },
    picks: {
      acquired,
      spent,
      net: acquired - spent,
      firstsAcquired,
      firstsSpent,
    },
    avgHoldingDays: holding.avgDays,
    holdingByAgeBand: holding.byBand,
    afterLoss,
    deadline: { buys, sells },
    postureBySeason,
    faabAggression: faabAggression != null ? Math.round(faabAggression) : null,
    overpaysForAge: overAgeAcquisitions >= 3,
  };
}
function derivePosture(h, rosterId, trades) {
  const bySeason = new Map();
  for (const t of trades) {
    (bySeason.get(t.season) ?? bySeason.set(t.season, []).get(t.season)).push(
      t,
    );
  }
  const out = [];
  for (const [season, ts] of bySeason) {
    const yr = seasonYear(season);
    let pickNet = 0;
    const acqAges = [];
    const dispAges = [];
    for (const t of ts) {
      for (const dp of t.draftPicks) {
        const w = dp.round === 1 ? 2 : 1;
        if (dp.ownerId === rosterId && dp.previousOwnerId !== rosterId)
          pickNet += w;
        else if (dp.previousOwnerId === rosterId && dp.ownerId !== rosterId)
          pickNet -= w;
      }
      for (const [pid, rid] of Object.entries(t.adds)) {
        if (rid === rosterId) {
          const a = ageAtSeason(h, pid, yr);
          if (a != null) acqAges.push(a);
        }
      }
      for (const [pid, rid] of Object.entries(t.drops)) {
        if (rid === rosterId) {
          const a = ageAtSeason(h, pid, yr);
          if (a != null) dispAges.push(a);
        }
      }
    }
    const ageBalance = (avg(acqAges) ?? 0) - (avg(dispAges) ?? 0); // <0 = getting younger
    const score = pickNet - ageBalance * 0.35;
    const posture =
      score > 1.2 ? "rebuilding" : score < -1.2 ? "contending" : "balanced";
    out.push({ season, posture, score: Math.round(score * 100) / 100 });
  }
  return out.sort((a, b) => a.season.localeCompare(b.season));
}
/**
 * Walk one roster's adds and drops once, yielding every COMPLETED hold and, left over
 * at the end, every hold still open right now.
 *
 * The open ones used to be discarded here. They are the whole basis of a live hold
 * streak (lib/streaks), and they have to come off the same walk as `avgHoldingDays`
 * rather than a second one, or "how long you have held him" and "your average hold"
 * end up disagreeing about what an acquisition even is. Two rules this walk fixes in
 * one place: the FIRST add wins while a hold is open (a re-add mid-hold does not
 * restart the clock), and a drop closes the hold so a later re-add legitimately
 * starts a new one.
 */
export function holdingSpans(h, rosterId) {
  const acquiredAt = new Map();
  const spans = [];
  for (const t of h.transactions) {
    if (!involves(t, rosterId)) continue;
    for (const [pid, rid] of Object.entries(t.adds)) {
      if (rid === rosterId && !acquiredAt.has(pid))
        acquiredAt.set(pid, t.created);
    }
    for (const [pid, rid] of Object.entries(t.drops)) {
      if (rid === rosterId && acquiredAt.has(pid)) {
        const start = acquiredAt.get(pid);
        const days = Math.max(0, (t.created - start) / DAY);
        spans.push({
          days,
          band: ageBand(ageAtSeason(h, pid, seasonYear(t.season))),
        });
        acquiredAt.delete(pid);
      }
    }
  }
  return { spans, openSince: acquiredAt };
}
function computeHolding(h, rosterId) {
  const { spans } = holdingSpans(h, rosterId);
  const avgDays = spans.length
    ? Math.round(avg(spans.map((s) => s.days)))
    : null;
  const byBandMap = new Map();
  for (const s of spans) {
    (byBandMap.get(s.band) ?? byBandMap.set(s.band, []).get(s.band)).push(
      s.days,
    );
  }
  const byBand = [...byBandMap.entries()].map(([band, ds]) => ({
    band,
    avgDays: Math.round(avg(ds)),
    n: ds.length,
  }));
  return { avgDays, byBand };
}
// ---- small helpers ----
export function involves(t, rosterId) {
  if (t.rosterIds.includes(rosterId)) return true;
  for (const rid of Object.values(t.adds)) if (rid === rosterId) return true;
  for (const rid of Object.values(t.drops)) if (rid === rosterId) return true;
  return false;
}
function countBySeason(ts) {
  const m = new Map();
  for (const t of ts) m.set(t.season, (m.get(t.season) ?? 0) + 1);
  return [...m.entries()]
    .map(([season, count]) => ({ season, count }))
    .sort((a, b) => a.season.localeCompare(b.season));
}
export function ageAtSeason(h, playerId, seasonYr) {
  const p = h.players.get(playerId);
  if (!p || p.age == null) return null;
  return p.age - (h.currentSeasonYear - seasonYr);
}
function nameForRoster(h, rosterId) {
  const r = h.rostersById.get(rosterId);
  const u = r?.ownerId ? h.usersById.get(r.ownerId) : undefined;
  return u?.displayName ?? `Roster ${rosterId}`;
}
function avg(xs) {
  if (!xs.length) return null;
  return Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10;
}
