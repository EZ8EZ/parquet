/**
 * Presentation helpers for the lock-in board: labels, groupings and chart geometry.
 * Pure functions over the WeekDesk contract (./index.js). Every coordinate is finite,
 * non-negative and rounded to 0.1 so SVG attributes never read NaN or a negative size
 * and server and client serialise them identically.
 */

import { DEFAULT_TZ, clockText, dayClockText, displayTz, tipShort, zoneLabel } from "./time.js";
import { dayLabel } from "./calendar.js";

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

/** "Sun 9:01 PM ET" for an ISO time, in the board's display zone (lib/lockin/time.js). */
export function easternStamp(iso, tz = DEFAULT_TZ) {
  const s = dayClockText(iso, tz);
  return s ? `${s} ${zoneLabel(tz, iso)}` : "";
}

/** The board's win chance as "27%", or null (the refresh note compares it before and after). */
export function winPctOf(desk) {
  const w = desk?.winProb?.now;
  return typeof w === "number" && Number.isFinite(w) && w >= 0 && w <= 1 ? pct(w) : null;
}

/** "4:55 PM ET": the refresh time, the one place the zone is named. */
export function asOfText(iso, tz = DEFAULT_TZ) {
  const s = clockText(iso, tz);
  return s ? `${s} ${zoneLabel(tz, iso)}` : "";
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

const FLAG = { Out: "out", Suspended: "out", Doubtful: "doubt", Questionable: "doubt", GTD: "doubt", "Day-To-Day": "doubt", DTD: "doubt" };

/**
 * The seven slot tiles: the state lives in the tile (a tip time instead of "0.0" for a
 * player who has not played, a lock glyph, a check, a reset glyph), so the board needs
 * no legend. `call` marks a slot whose score is waiting on a lock-or-hold call.
 * -> [{ index, label, playerId, name, team, key, value, text, sub, call, flag, flagText, spoken }]
 */
export function slotTiles(desk) {
  const tz = displayTz(desk);
  const cards = new Map((desk?.cards || []).map((c) => [c.playerId, c]));
  const tips = new Map((desk?.tonight?.players || []).filter((p) => p.tip).map((p) => [p.playerId, p.tip]));
  return (desk?.slots || []).map((s) => {
    const key = slotStateKey(s);
    const c = s.playerId ? cards.get(s.playerId) : null;
    const tip = s.playerId ? tips.get(s.playerId) : null;
    const next = c?.nextGame ?? null;
    const notYet = key === "yet";
    // a typed what-if score shows in place of what the slot holds (the tile is marked assumed)
    // not played yet: when he tips ("5 PM", "7:30 PM") or the day of his next game, never a 0.0
    const text = s.assumedScore != null ? fmt(s.assumedScore) : key === "empty" ? "—" : notYet ? (tip ? (clockText(tip, tz) ?? "").replace(":00", "") || tipShort(tip, tz) : next?.day ?? "—") : s.banked == null ? "—" : fmt(s.banked);
    const status = c?.injury?.status ?? null;
    const flag = status ? FLAG[status] ?? null : null;
    const call = !!c && c.urgencyRank === 1 && c.decision?.kind === "lock_or_hold";
    const when = notYet ? (tip ? `plays at ${clockText(tip, tz)}` : next ? `next game ${next.day}` : "no game left") : null;
    const spoken = [`${s.label} ${notYet ? "" : text}`.trim(), `${s.name ?? "empty"}`, SLOT_STATES[key].long, when, status ? `listed ${status}` : null, call ? "your lock-or-hold call is open" : null].filter(Boolean).join(", ");
    return { index: s.index, label: s.label, playerId: s.playerId, name: s.name, team: c?.team ?? null, key, value: s.banked, text, call, flag, flagText: status, spoken, gamesLeft: c?.gamesLeft ?? null, assumedScore: s.assumedScore ?? null };
  });
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

/**
 * Who plays first: the earliest remaining game night among the roster's players and
 * who plays on it (starters first). Null when nobody has a game left.
 */
export function firstUp(desk) {
  const cards = (desk?.cards || []).filter((c) => c.nextGame);
  if (!cards.length) return null;
  const date = cards.map((c) => c.nextGame.date).sort()[0];
  const on = cards
    .filter((c) => c.nextGame.date === date)
    .sort((a, b) => (a.role === b.role ? (a.slotIndex ?? 99) - (b.slotIndex ?? 99) : a.role === "starter" ? -1 : 1));
  return {
    date,
    day: on[0].nextGame.day,
    tonight: date === desk.today,
    players: on.map((c) => ({ playerId: c.playerId, name: c.name, team: c.team, slotLabel: c.slotLabel, opponent: c.nextGame.opponent, away: c.nextGame.away })),
  };
}

const UPDATING = new Set(["box_score_pending", "banked_matches_no_loaded_game"]);

/**
 * What the header needs: "Week 5 · Nov 16–22", the "as of" time, whether any of the
 * roster's games is in progress (scores still moving) and whether any slot's score is
 * still catching up between Sleeper's matchup and the box score.
 */
export function boardHeader(desk) {
  const w = desk?.dateWindow;
  const range = w ? `${shortDate(w.start)}–${w.start.slice(5, 7) === w.end.slice(5, 7) ? String(Number(w.end.slice(8))) : shortDate(w.end)}` : null;
  const tz = displayTz(desk);
  const stamp = desk?.generatedAt ? easternStamp(desk.generatedAt, tz) : "";
  const cards = desk?.cards || [];
  const live = cards.some((c) => (c.weekGames || []).some((g) => g.status === "in_game"));
  const updating = (desk?.slots || []).some((s) => UPDATING.has(s.lockStateReason));
  const week = desk?.status === "between_weeks" ? `Week ${desk.week} final` : desk?.week != null ? `Week ${desk.week}` : null;
  return { week, range, stamp, asOf: desk?.generatedAt ? asOfText(desk.generatedAt, tz) : "", tz, live, updating, kicker: [week, range].filter(Boolean).join(" · ") || null };
}

/** The empty state's sentence, without repeating its title ("Lock-in data unavailable"). */
export function stateBody(desk) {
  const m = (desk?.message || "").replace(/^Lock-in data unavailable:\s*/, "");
  return m ? m[0].toUpperCase() + m.slice(1) : "";
}

/** One line for last week's result: "Week 4: won 812.5 to 790.0". */
export function resultLine(bw) {
  const r = bw?.result;
  if (!r) return null;
  return `Week ${r.week}: ${r.outcome} ${fmt(r.points)} to ${fmt(r.opponentPoints)}`;
}

/** Panel subtitle for a player: "UTIL · OKC · PG" or "Bench · OKC · PG". */
export function playerSubtitle(card) {
  const pos = card.positions?.join("/") || null;
  // "PG · MIA", not "PG · MIA · PG": the positions only when they add something to the slot
  return [card.slotLabel ?? "Bench", card.team, pos && pos !== card.slotLabel ? pos : null].filter(Boolean).join(" · ");
}

const remainingOf = (card) => (card.weekGames || []).filter((g) => g.status === "pre_game" || g.status === "postponed");

/** His games still to play this week, as { date, day, away, opponent }. */
export function remainingGames(card) {
  return remainingOf(card || {}).map((g) => ({ date: g.date, day: g.day, away: g.away, opponent: g.opponent }));
}

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

/**
 * Past meetings with every team he still faces this week, one block per game, newest
 * meeting first, each with its average beside his season average. History only: none of
 * it feeds a number (partial correlation 0.026, n=18,812). -> { ok, blocks, season, missing }
 */
export function opponentsAheadView(card) {
  const ahead = (card?.opponentsAhead || []).filter((o) => o && o.opponent);
  if (!ahead.length) return { ok: false, blocks: [], season: card?.seasonAverage ?? null, missing: "No games left this week." };
  const all = ahead.flatMap((o) => o.meetings || []);
  const max = Math.max(1, ...all.map((m) => m.fp));
  // what was unusual about a meeting, where the last-15 series has it (a starter out, minutes)
  const notesBy = new Map((card?.series?.games || []).filter((g) => g.annotations?.length).map((g) => [g.date, g.annotations.map((a) => a.text)]));
  const blocks = ahead.map((o) => {
    const rows = [...(o.meetings || [])].reverse().map((m) => ({ date: m.date, label: rowDate(m.date), fp: m.fp, minutes: m.minutes, widthPct: r1(clamp((Math.max(0, m.fp) / max) * 100, 0, 100)), notes: notesBy.get(m.date) ?? [] }));
    const avg = rows.length ? r1(rows.reduce((t, r) => t + r.fp, 0) / rows.length) : null;
    return {
      key: `${o.date}-${o.opponent}`,
      date: o.date,
      day: o.day ?? null,
      opponent: o.opponent,
      away: !!o.away,
      rows,
      n: rows.length,
      avg,
      missing: rows.length ? null : `No meetings with ${o.opponent} in the seasons loaded (${(o.loadedSeasons || []).join(", ") || "none"}).`,
    };
  });
  return { ok: true, blocks, season: card.seasonAverage ?? null, missing: null };
}

/**
 * The roster rows for "Every player": last 10 played games as a sparkline (points), the
 * season average, and each game left with its opponent and his average against them.
 */
export function playerFormRow(card, { n = 10 } = {}) {
  const played = (card?.series?.games || []).filter((g) => Number.isFinite(g.fp));
  const last = played.slice(-n);
  const max = Math.max(1, ...last.map((g) => g.fp));
  const bars = last.map((g) => ({ date: g.date, fp: g.fp, hPct: r1(clamp((Math.max(0, g.fp) / max) * 100, 4, 100)), opponent: g.opponent ?? null, noted: (g.annotations || []).length > 0 }));
  const ahead = (card?.opponentsAhead || []).map((o) => {
    const ms = o.meetings || [];
    return { date: o.date, day: o.day ?? null, opponent: o.opponent, away: !!o.away, avg: ms.length ? r1(ms.reduce((t, m) => t + m.fp, 0) / ms.length) : null, n: ms.length };
  });
  return { bars, n: last.length, season: card?.seasonAverage ?? null, ahead };
}

/**
 * "If you let X go": who could still beat the score for this slot (card.rivals, rivals.js),
 * for display. -> null without rivals; else { x, slotLabel, rows, cannot, anyPct, summary }.
 */
export function rivalsView(card) {
  const r = card?.rivals;
  if (!r || !Array.isArray(r.options)) return null;
  const rows = r.options.map((o) => ({
    playerId: o.playerId,
    name: o.name,
    tag: o.role === "self" ? "his own games" : "bench",
    status: o.status,
    games: o.games.map((g) => ({ day: dayLabel(g.date), pct: pct(g.pPlay) })),
    gamesText: o.games.map((g) => `${dayLabel(g.date)} ${pct(g.pPlay)}`).join(" · "),
    beatPct: pct(o.pBeat),
    beatWidth: r1(clamp((o.pBeat ?? 0) * 100, 0, 100)),
    elsewhere: o.elsewhere ? `the plan starts him at ${o.elsewhere.slotLabel}` : null,
  }));
  const free = r.options.filter((o) => !o.elsewhere).length;
  return {
    x: r.x,
    slotLabel: r.slotLabel,
    rows,
    cannot: (r.cannot || []).map((c) => `${c.name}${c.status ? ` (${c.status})` : ""}: ${c.why}`),
    anyPct: pct(r.pAny),
    summary: `If you let ${fmt(r.x)} go: ${pct(r.pAny)} chance someone beats it at ${r.slotLabel} (${free} ${free === 1 ? "option" : "options"})`,
    note: r.note,
  };
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
  // The opponent's players (head-to-head): named, and marked as theirs.
  for (const s of desk?.opponent?.slots || []) if (s.playerId && !names.has(s.playerId)) names.set(s.playerId, `${s.name ?? s.playerId} (opponent)`);
  return [...groups.values()].map((g) => {
    const what = GAP_SOURCES[g.source] || g.source;
    const who = g.subjects.size ? ` for ${[...g.subjects].map((s) => names.get(s) || s).join(", ")}` : "";
    const why = g.code.replace(/_/g, " ");
    return `${what[0].toUpperCase()}${what.slice(1)} missing${who} (${why}).`;
  });
}

/** "+0.7", "−2.6" (a minus sign, one decimal): a signed points figure (the lean's record). */
export const signedPts = (x) => `${x < 0 ? "\u2212" : "+"}${Math.abs(x).toFixed(1)}`;
