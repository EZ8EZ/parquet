/**
 * Presentation helpers for the lock-in board: labels, groupings and chart geometry.
 * Pure functions over the WeekDesk contract (./index.js). Every coordinate is finite,
 * non-negative and rounded to 0.1 so SVG attributes never read NaN or a negative size
 * and server and client serialise them identically.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EPS = 0.011;

export const MIN_GAMES = Object.freeze({ strip: 5, minutes: 5, opponent: 1 });

export const fmt = (x) => (x == null || !Number.isFinite(x) ? "unknown" : (Math.round(x * 10) / 10).toFixed(1));
export const pct = (p) => (p == null || !Number.isFinite(p) ? "unknown" : `${Math.round(p * 100)}%`);
const r1 = (x) => {
  const v = Math.round((Number.isFinite(x) ? x : 0) * 10) / 10;
  return Object.is(v, -0) ? 0 : v;
};
const pos = (x) => Math.max(0, r1(x));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "Nov 12", or "Nov 12 2025" with the year. */
export function shortDate(date, withYear = false) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || "";
  const [y, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}${withYear ? ` ${y}` : ""}`;
}

/** "Nov 12" or "Feb 3 '26": compact date for chart rows. */
export function rowDate(date) {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d} '${String(y).slice(2)}`;
}

/** "Sun 9:01 pm ET" for an ISO time. */
export function easternStamp(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }).format(t).replace(/\s?([AP])M/, (_, a) => ` ${a.toLowerCase()}m`) + " ET";
}

export const SLOT_STATES = Object.freeze({
  locked: { label: "Locked", long: "Locked for certain" },
  unknown: { label: "Unknown until his next game", long: "Lock state unknown until his next game" },
  reset: { label: "Reset to 0", long: "Reset to 0: his latest game was a DNP" },
  final: { label: "Final score stands", long: "No games left; this score stands" },
  empty: { label: "Empty", long: "No player in this slot" },
  yet: { label: "Has not played yet", long: "Has not played this week" },
  live: { label: "Game in progress", long: "His game is in progress" },
  unresolved: { label: "Score updating", long: "Score updating: the matchup and box score have not caught up with each other" },
});

/** One of SLOT_STATES' keys for a SlotView. */
export function slotStateKey(slot) {
  if (!slot?.playerId) return "empty";
  if (slot.lockState === "locked") return "locked";
  if (slot.lockState === "unknown_until_next_tip") return "unknown";
  const r = slot.lockStateReason;
  if (r === "reset_at_tip_now_tracking_live_game") return "live";
  if (slot.lockState === "reset") return "reset";
  if (r === "final_game_score_stands") return "final";
  if (r === "no_game_yet" || r === "no_game_played_yet") return "yet";
  if (r === "first_game_in_progress" || r === "mid_game_unexplained") return "live";
  return "unresolved";
}

export function groupCards(desk) {
  const cards = desk?.cards || [];
  return {
    live: cards.filter((c) => c.urgencyRank <= 1),
    lineup: cards.filter((c) => c.urgencyRank === 2),
    quiet: cards.filter((c) => c.urgencyRank >= 3),
  };
}

/**
 * Compact layout of the live cards: the first one with numbers is shown in full; hazards
 * that come before it and every other live card become one-line rows.
 */
export function compactLive(live) {
  if (!live?.length) return { before: [], featured: null, after: [] };
  const i = Math.max(0, live.findIndex((c) => c.stopping));
  return { before: live.slice(0, i), featured: live[i], after: live.slice(i + 1) };
}

const remainingOf =(card) => (card.weekGames || []).filter((g) => g.status === "pre_game" || g.status === "postponed");

/** "Sat vs BOS, Sun at NYK". */
export function gamesLeftText(card) {
  const left = remainingOf(card);
  if (!left.length) return "No games left this week";
  const list = left.map((g) => `${g.day} ${g.away ? "at" : "vs"} ${g.opponent ?? "unknown"}`).join(", ");
  return `${plural(left.length, "game")} left: ${list}`;
}

/** The week game whose score sits in his slot, or null. */
export function bankedGameDate(card) {
  if (card?.role !== "starter" || card.banked == null || !(Math.abs(card.banked) > EPS)) return null;
  const done = (card.weekGames || []).filter((g) => g.status === "complete" && g.played);
  const hits = done.filter((g) => Math.abs((g.fp ?? NaN) - card.banked) < EPS);
  if (!hits.length) return null;
  if (card.lockState?.state === "locked" && hits.length > 1) {
    const latest = done[done.length - 1]?.date;
    const earlier = hits.filter((g) => g.date !== latest);
    if (earlier.length) return earlier[earlier.length - 1].date;
  }
  return hits[hits.length - 1].date;
}

/** Grid cell for one player on one night. */
export function gridCell(cell, { banked = false, today = null, date = null } = {}) {
  if (!cell?.game) return { kind: "none", text: "", sr: "no game" };
  const opp = cell.opponent ?? "?";
  if (cell.status === "complete") {
    if (cell.played == null) return { kind: "pending", text: "…", sr: `final vs ${opp}, box score updating` };
    if (cell.played === false) return { kind: "dnp", text: "DNP", sr: `did not play vs ${opp}` };
    return { kind: banked ? "banked" : "played", text: fmt(cell.fp), sr: `${fmt(cell.fp)} vs ${opp}${banked ? ", in his slot" : ""}` };
  }
  if (cell.status === "in_game") return { kind: "live", text: opp, sr: `in progress vs ${opp}` };
  if (cell.status === "postponed") return { kind: "upcoming", text: opp, sr: `postponed vs ${opp}` };
  if (cell.status === "canceled") return { kind: "none", text: "", sr: "canceled" };
  return { kind: "upcoming", text: opp, sr: `${date && date === today ? "tonight" : "to play"} vs ${opp}` };
}

/**
 * The week grid. compact: only nights still to come and players still to play.
 * Returns { nights: [{date, day, past, today}], rows: [{playerId, name, slotLabel, cells}], openSlots text }.
 */
export function weekGrid(desk, { compact = false } = {}) {
  const sp = desk?.slotPressure;
  if (!sp) return null;
  const byId = new Map((desk.cards || []).map((c) => [c.playerId, c]));
  const nights = sp.nights.filter((n) => !compact || !n.past).map((n) => ({ date: n.date, day: n.day, past: n.past, today: n.date === desk.today, label: dayNum(n.date) }));
  let ids = sp.rowOrder;
  let bench = null;
  if (compact) {
    const toPlay = ids.filter((id) => remainingOf(byId.get(id) || {}).length > 0 && byId.get(id)?.lockState?.state !== "locked");
    ids = toPlay.filter((id) => byId.get(id)?.role === "starter");
    const benchIds = toPlay.filter((id) => byId.get(id)?.role !== "starter");
    if (benchIds.length) {
      bench = {
        players: benchIds.length,
        cells: sp.nights
          .filter((n) => nights.some((x) => x.date === n.date))
          .map((n) => ({ date: n.date, count: benchIds.filter((id) => n.cells[id]?.game && n.cells[id].status !== "complete").length })),
      };
    }
  }
  const rows = ids.map((id) => {
    const c = byId.get(id);
    const bd = c ? bankedGameDate(c) : null;
    const full = sp.nights.filter((n) => nights.some((x) => x.date === n.date));
    return {
      playerId: id,
      name: c?.name ?? `Player ${id}`,
      slotLabel: c?.slotLabel ?? null,
      cells: full.map((n) => ({ date: n.date, ...gridCell(n.cells[id], { banked: bd === n.date, today: desk.today, date: n.date }) })),
    };
  });
  return { nights, rows, bench };
}

const dayNum = (date) => String(Number(date.slice(8)));

/** One player's own week as a one-row grid. */
export function playerWeekGrid(card, today) {
  const bd = bankedGameDate(card);
  const games = card?.weekGames || [];
  return {
    nights: games.map((g) => ({ date: g.date, day: g.day, past: g.status === "complete", today: g.date === today, label: dayNum(g.date) })),
    rows: [
      {
        playerId: card.playerId,
        name: card.name,
        slotLabel: card.slotLabel,
        cells: games.map((g) => ({ date: g.date, ...gridCell({ game: true, opponent: g.opponent, status: g.status, played: g.played, fp: g.fp }, { banked: bd === g.date, today, date: g.date }) })),
      },
    ],
  };
}

/** Lean presentation. strength: 1 marginal, 2 moderate, 3 clear. */
export function leanView(lean) {
  if (!lean || lean.value === "none") return null;
  const strength = { marginal: 1, moderate: 2, clear: 3 }[lean.confidence] ?? 0;
  return {
    value: lean.value,
    confidence: lean.confidence ?? "unknown",
    strength,
    nearlyEven: strength <= 1,
    conditional: !!lean.conditional,
    lockVsHold: lean.inputs ? { lock: lean.inputs.valueIfLock, hold: lean.inputs.valueIfHold } : null,
  };
}

/** Push overlapping label positions apart, keeping them inside [min, max]. */
export function dodge(items, { gap = 12, min = 0, max = 100 } = {}) {
  const out = items.map((it, i) => ({ ...it, i, y: clamp(Number.isFinite(it.y) ? it.y : min, min, max) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < out.length; i++) if (out[i].y - out[i - 1].y < gap) out[i].y = out[i - 1].y + gap;
  if (out.length && out[out.length - 1].y > max) {
    out[out.length - 1].y = max;
    for (let i = out.length - 2; i >= 0; i--) if (out[i + 1].y - out[i].y < gap) out[i].y = out[i + 1].y - gap;
  }
  return out.sort((a, b) => a.i - b.i).map(({ i: _i, ...it }) => ({ ...it, y: r1(Math.max(min, it.y)) }));
}

function niceStep(span, target) {
  const raw = span / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

function linear(d0, d1, r0, r1_) {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1_ - r0);
}

const ANN_ORDER = ["overtime", "minutes_jump", "usual_starter_did_not_start"];
export const ANNOTATION_LABELS = Object.freeze({
  overtime: "Overtime",
  minutes_jump: "Minutes 5+ over his last-10 average",
  usual_starter_did_not_start: "A usual starter did not start",
});

/** Index of the series game whose score is on the table now, or -1. */
export function nowIndex(card) {
  if (!card?.stopping || !card.series?.games?.length) return -1;
  const weekDates = new Set((card.weekGames || []).filter((g) => g.played).map((g) => g.date));
  const g = card.series.games;
  for (let i = g.length - 1; i >= 0; i--) if (weekDates.has(g[i].date) && Math.abs(g[i].fp - card.stopping.x) < EPS) return i;
  return -1;
}

/**
 * Last-15 strip. W x H user units; plot leaves a top lane for markers and a right
 * gutter for direct labels.
 */
export function stripChart(card, { W = 320, H = 168 } = {}) {
  const games = card?.series?.games || [];
  if (games.length < MIN_GAMES.strip) {
    return { ok: false, missing: games.length ? `Only ${plural(games.length, "played game")} loaded; the strip needs ${MIN_GAMES.strip}.` : "No played games loaded." };
  }
  const lane = 22;
  const plot = { x0: 26, x1: W - 76, y0: lane + 6, y1: H - 8 };
  const st = card.stopping;
  const fc = card.forecast;
  const band = fc && fc.basis !== "league-prior" ? fc.range : null;
  const held = st?.expectedIfHeld ?? null;
  const vals = [...games.map((g) => g.fp), band?.p10, band?.p90, held, st?.x].filter(Number.isFinite);
  const lo = Math.min(0, ...vals);
  const hiRaw = Math.max(...vals);
  const step = niceStep(hiRaw - lo, 3);
  const hi = Math.max(lo + step, Math.ceil(hiRaw / step) * step);
  const y = linear(lo, hi, plot.y1, plot.y0);
  const n = games.length;
  const x = (i) => (n === 1 ? (plot.x0 + plot.x1) / 2 : plot.x0 + (i / (n - 1)) * (plot.x1 - plot.x0));
  const ni = nowIndex(card);
  const colW = n > 1 ? (plot.x1 - plot.x0) / (n - 1) : plot.x1 - plot.x0;
  const dots = games.map((g, i) => ({
    i,
    cx: r1(x(i)),
    cy: r1(clamp(y(g.fp), plot.y0, plot.y1)),
    hitX: pos(x(i) - colW / 2),
    hitW: pos(colW),
    now: i === ni,
    fp: g.fp,
    date: g.date,
    season: g.season,
    opponent: g.opponent,
    away: g.away,
    minutes: g.minutes,
    annotations: g.annotations.map((a) => ({ code: a.code, text: a.text })),
    text: `${shortDate(g.date, g.season !== games[n - 1].season)} ${g.away ? "at" : "vs"} ${g.opponent ?? "unknown"}: ${fmt(g.fp)} pts, ${fmt(g.minutes)} min`,
  }));
  const markers = [];
  for (const d of dots) {
    ANN_ORDER.forEach((code, row) => {
      if (d.annotations.some((a) => a.code === code)) markers.push({ i: d.i, code, cx: d.cx, cy: r1(5 + row * 7) });
    });
  }
  const labels = [];
  if (band) {
    labels.push({ key: "p90", y: y(band.p90), text: `${fmt(band.p90)} high` });
    labels.push({ key: "p10", y: y(band.p10), text: `${fmt(band.p10)} low` });
  }
  if (held != null) labels.push({ key: "held", y: y(held), text: `${fmt(held)} if held` });
  const placed = dodge(labels, { gap: 13, min: plot.y0, max: plot.y1 });
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push({ y: r1(y(v)), value: r1(v) });
  const used = new Set(markers.map((m) => m.code));
  return {
    ok: true,
    W,
    H,
    plot: { x0: r1(plot.x0), x1: r1(plot.x1), y0: r1(plot.y0), y1: r1(plot.y1), lane },
    dots,
    markers,
    legend: ANN_ORDER.filter((c) => used.has(c)).map((code) => ({ code, label: ANNOTATION_LABELS[code] })),
    band: band ? { y: r1(y(band.p90)), h: pos(y(band.p10) - y(band.p90)), lo: band.p10, hi: band.p90 } : null,
    rule: held != null ? { y: r1(clamp(y(held), plot.y0, plot.y1)), value: held } : null,
    labels: placed,
    ticks,
    now: ni >= 0 ? { ...dots[ni], text: `${fmt(dots[ni].fp)} now` } : null,
    alt: stripAlt(card, games, band, held),
  };
}

function stripAlt(card, games, band, held) {
  const fps = games.map((g) => g.fp);
  const ann = games.filter((g) => g.annotations.length).map((g) => `${shortDate(g.date)}: ${g.annotations.map((a) => a.text).join("; ")}`);
  return [
    `Last ${games.length} played games for ${card.name}, from ${fmt(Math.min(...fps))} to ${fmt(Math.max(...fps))} points; most recent ${fmt(fps[fps.length - 1])}.`,
    card.stopping ? `Score on the table ${fmt(card.stopping.x)}.` : "",
    held != null ? `Expected if held ${fmt(held)}.` : "",
    band ? `Next game, 8 in 10 between ${fmt(band.p10)} and ${fmt(band.p90)}.` : "",
    ann.length ? `Marked games: ${ann.join(". ")}.` : "No marked games.",
  ].filter(Boolean).join(" ");
}

/**
 * Next-game distribution as a quantile dot plot: one dot per equally likely outcome
 * (forecast.shape), stacked in bins. x, when given, splits dots above / at-or-below.
 */
export function distChart(card, { W = 320, H = 132 } = {}) {
  const fc = card?.forecast;
  if (!fc) return { ok: false, missing: card?.series?.n ? "No game left this week, so no next-game forecast." : "No forecast: his game log did not load." };
  if (fc.basis === "league-prior") return { ok: false, missing: "No games this season or last loaded, so there is no forecast of his own." };
  const shape = (fc.shape || []).filter(Number.isFinite);
  if (shape.length < 5) return { ok: false, missing: "The forecast shape did not load." };
  const x = card.stopping?.x ?? null;
  const plot = { x0: 10, x1: W - 10, y0: 18, y1: H - 22 };
  const vals = [...shape, ...(x != null ? [x] : [])];
  const span = Math.max(...vals) - Math.min(...vals);
  const binW = niceStep(span || 10, 14);
  const lo = Math.floor(Math.min(...vals) / binW) * binW;
  const hi = Math.max(lo + binW, Math.ceil((Math.max(...vals) + 1e-9) / binW) * binW);
  const sx = linear(lo, hi, plot.x0, plot.x1);
  const bins = new Map();
  for (const v of shape) {
    const b = Math.min(Math.floor((v - lo) / binW), Math.round((hi - lo) / binW) - 1);
    if (!bins.has(b)) bins.set(b, []);
    bins.get(b).push(v);
  }
  const maxStack = Math.max(...[...bins.values()].map((a) => a.length));
  const cellW = sx(lo + binW) - sx(lo);
  const r = pos(Math.max(1.5, Math.min(cellW * 0.42, (plot.y1 - plot.y0) / (2 * maxStack))));
  const dots = [];
  for (const [b, arr] of bins) {
    arr.sort((a, c) => a - c).forEach((v, k) => {
      dots.push({ cx: r1(sx(lo + (b + 0.5) * binW)), cy: r1(plot.y1 - r - k * 2 * r), r, above: x != null && v > x, value: v });
    });
  }
  const above = x != null ? shape.filter((v) => v > x).length : null;
  const tickStep = niceStep(hi - lo, 4);
  const ticks = [];
  for (let v = Math.ceil(lo / tickStep) * tickStep; v <= hi + 1e-9; v += tickStep) ticks.push({ x: r1(sx(v)), value: r1(v) });
  const p = card.stopping?.pLaterBeatsIfPlays ?? null;
  return {
    ok: true,
    W,
    H,
    plot: { x0: r1(plot.x0), x1: r1(plot.x1), y0: r1(plot.y0), y1: r1(plot.y1) },
    dots,
    ticks,
    xLine: x != null ? { x: r1(clamp(sx(x), plot.x0, plot.x1)), value: x } : null,
    n: shape.length,
    above,
    pIfPlays: p,
    k: card.stopping?.k ?? null,
    basis: fc.basis,
    alt:
      `Next game for ${card.name}: ${shape.length} equally likely outcomes from ${fmt(shape[0])} to ${fmt(shape[shape.length - 1])}, 8 in 10 between ${fmt(fc.range.p10)} and ${fmt(fc.range.p90)}.` +
      (x != null ? ` ${above} of ${shape.length} are above ${fmt(x)}. Chance a later game beats it if he plays: ${pct(p)}.` : ""),
  };
}

/** Minutes, last 15 played, with the average of his last 10. */
export function minutesChart(card, { W = 320, H = 120 } = {}) {
  const games = card?.series?.games || [];
  if (games.length < MIN_GAMES.minutes) return { ok: false, missing: games.length ? `Only ${plural(games.length, "played game")} loaded; the trend needs ${MIN_GAMES.minutes}.` : "No played games loaded." };
  const plot = { x0: 26, x1: W - 70, y0: 10, y1: H - 10 };
  const mins = games.map((g) => g.minutes).filter(Number.isFinite);
  const last = mins.slice(-10);
  const avg = last.reduce((s, v) => s + v, 0) / (last.length || 1);
  const loRaw = Math.min(...mins, avg);
  const hiRaw = Math.max(...mins, avg);
  const step = niceStep(Math.max(hiRaw - loRaw, 8), 3);
  const lo = Math.max(0, Math.floor(loRaw / step) * step);
  const hi = Math.max(lo + step, Math.ceil(hiRaw / step) * step);
  const y = linear(lo, hi, plot.y1, plot.y0);
  const n = games.length;
  const x = (i) => plot.x0 + (i / Math.max(1, n - 1)) * (plot.x1 - plot.x0);
  const pts = games.map((g, i) => ({ cx: r1(x(i)), cy: r1(clamp(y(g.minutes), plot.y0, plot.y1)), jump: g.annotations.some((a) => a.code === "minutes_jump"), minutes: g.minutes, date: g.date }));
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push({ y: r1(y(v)), value: r1(v) });
  return {
    ok: true,
    W,
    H,
    plot: { x0: r1(plot.x0), x1: r1(plot.x1), y0: r1(plot.y0), y1: r1(plot.y1) },
    points: pts,
    avg: { y: r1(clamp(y(avg), plot.y0, plot.y1)), value: r1(avg), n: last.length },
    ticks,
    alt: `Minutes in ${card.name}'s last ${n} played games, from ${fmt(Math.min(...mins))} to ${fmt(Math.max(...mins))}; average of the last ${last.length}: ${fmt(avg)}. ${pts.filter((p) => p.jump).length} game(s) 5+ minutes over his previous-10 average.`,
  };
}

/** Opponent history rows. History only: never feeds a number above it. */
export function opponentView(card) {
  const oh = card?.opponentHistory;
  const next = card?.nextGame;
  if (!oh || !next) return { ok: false, opponent: null, missing: "No game left this week, so no next opponent." };
  if (oh.n < MIN_GAMES.opponent) return { ok: false, opponent: oh.opponent, missing: `No meetings with ${oh.opponent} in the seasons loaded (${oh.loadedSeasons.join(", ") || "none"}).` };
  const max = Math.max(1, ...oh.meetings.map((m) => m.fp));
  const rows = [...oh.meetings].reverse().map((m) => ({ date: m.date, label: rowDate(m.date), fp: m.fp, minutes: m.minutes, widthPct: r1(clamp((Math.max(0, m.fp) / max) * 100, 0, 100)) }));
  return { ok: true, opponent: oh.opponent, rows, n: oh.n, seasons: oh.loadedSeasons, nextDay: next.day };
}

/** The key numbers of a lock-or-hold card. */
export function decisionNumbers(card) {
  const st = card?.stopping;
  const fc = card?.forecast;
  if (!st) return null;
  return {
    x: st.x,
    k: st.k,
    held: st.expectedIfHeld,
    listedOut: st.availabilityAssumed === "listed_out",
    heldIfPlays: st.expectedIfHeldPlays,
    pIfPlays: st.pLaterBeatsIfPlays,
    range: fc?.range ?? null,
    n: st.n,
    basis: fc?.basis ?? null,
    shapeN: fc?.shapeN ?? 0,
  };
}

/** "n=47 played games (shape: last 30)" style line. */
export function basisText(fc) {
  if (!fc) return "no forecast";
  if (fc.basis === "own") return `from ${plural(fc.n, "played game")}, spread from his last ${fc.shapeN}`;
  if (fc.basis === "thin") return `from ${plural(fc.n, "played game")}, spread from the league (under 10 of his own)`;
  return "no games of his own loaded; league average";
}

export const GAP_SOURCES = Object.freeze({
  state: "NBA week",
  league: "league settings",
  rosters: "rosters",
  matchups: "matchups",
  schedule: "NBA schedule",
  players: "player directory",
  playerLog: "game logs",
  model: "teams",
});

/** Gaps grouped into one plain line each: "game logs missing for 2 players (fetch failed)". */
export function gapLines(desk) {
  const groups = new Map();
  for (const g of desk?.gaps || []) {
    const k = `${g.source}|${g.code}`;
    if (!groups.has(k)) groups.set(k, { source: g.source, code: g.code, subjects: new Set(), message: g.message });
    if (g.subject) groups.get(k).subjects.add(g.subject);
  }
  const names = new Map((desk?.cards || []).map((c) => [c.playerId, c.name]));
  return [...groups.values()].map((g) => {
    const what = GAP_SOURCES[g.source] || g.source;
    const who = g.subjects.size ? ` for ${[...g.subjects].map((s) => names.get(s) || s).join(", ")}` : "";
    const why = g.code.replace(/_/g, " ");
    return `${what[0].toUpperCase()}${what.slice(1)} missing${who} (${why}).`;
  });
}
