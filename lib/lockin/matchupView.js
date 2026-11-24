/**
 * Presentation helpers for the head-to-head layer of the lock-in board: the matchup
 * (win probability, both projected ranges on one scale, the opponent's slots), the
 * decision card's win-probability comparison, boom/bust profile, availability, the
 * model's call, "what moves your win chance", habits, intent and the lock history.
 * Pure functions over the WeekDesk contract (./index.js). Nothing here estimates
 * anything: every figure is the engine's, only formatted, ordered and placed. Every
 * coordinate is finite, inside 0-100 and rounded to 0.1.
 */
import { SLOT_STATES, fmt, pct, slotStateKey } from "./view.js";
import { UNCERTAIN_RE } from "./availability.js";

const fin = (x) => typeof x === "number" && Number.isFinite(x);
const r1 = (x) => {
  const v = Math.round((fin(x) ? x : 0) * 10) / 10;
  return Object.is(v, -0) ? 0 : v;
};
const clampPct = (x) => Math.min(100, Math.max(0, r1(x)));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const prob = (p) => (fin(p) && p >= 0 && p <= 1 ? p : null);
const DAYS = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

/** Name and imagery for a roster from the league corpus (lib/history.js). */
export function teamIdentity(h, rosterId) {
  const r = h?.rostersById?.get?.(Number(rosterId));
  const u = r?.ownerId ? h?.usersById?.get?.(r.ownerId) : null;
  if (!r && !u) return null;
  return { name: u?.teamName || u?.displayName || `Roster ${rosterId}`, ownerName: u?.displayName ?? null, avatarId: u?.avatar ?? null, teamLogoUrl: u?.teamLogoUrl ?? null };
}

/** The contract's avatar string: a full URL is a team logo, anything else a Sleeper avatar id. */
export function avatarProps(avatar) {
  if (typeof avatar !== "string" || !avatar) return { avatarId: null, teamLogoUrl: null };
  return /^https?:\/\//.test(avatar) ? { avatarId: null, teamLogoUrl: avatar } : { avatarId: avatar, teamLogoUrl: null };
}

/** "8-3" or "8-3-1" from { wins, losses, ties }; a string passes through; null when unknown. */
export function recordText(r) {
  if (typeof r === "string") return r || null;
  if (!r || !fin(r.wins) || !fin(r.losses)) return null;
  return `${r.wins}-${r.losses}${fin(r.ties) && r.ties > 0 ? `-${r.ties}` : ""}`;
}

/** SLOT_STATES key for an opponent slot (no lockStateReason in that shape). */
export function oppSlotKey(slot) {
  if (!slot?.playerId) return "empty";
  if (slot.lockStateReason) return slotStateKey(slot);
  const s = String(slot.lockState ?? "").toLowerCase();
  if (s === "locked") return slot.lockCertain === false ? "unknown" : "locked";
  if (s === "unknown_until_next_tip" || s === "unknown") return "unknown";
  if (s === "reset") return "reset";
  if (s === "final" || s === "final score stands" || s === "final_game_score_stands") return "final";
  if (s === "empty") return "empty";
  return "unresolved";
}

const goodRange = (r) => r && fin(r.mean) && fin(r.p10) && fin(r.p90) && r.p10 <= r.mean && r.mean <= r.p90 ? r : null;

function niceStep(span, target) {
  const raw = span / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

/**
 * Two projected totals on one horizontal scale. -> { ticks:[{v,pct}], rows:[{lo,hi,mean,width}] }
 * with every position a percentage of the track; null when neither range is usable.
 */
export function bandScale(ranges) {
  const ok = ranges.map(goodRange);
  const vals = ok.filter(Boolean).flatMap((r) => [r.p10, r.p90]);
  if (!vals.length) return null;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = Math.max(2, (hi - lo) * 0.08);
  lo = Math.max(0, lo - pad);
  hi = hi + pad;
  const step = niceStep(hi - lo, 4);
  const t0 = Math.ceil(lo / step) * step;
  const at = (v) => clampPct(((v - lo) / (hi - lo || 1)) * 100);
  const ticks = [];
  for (let v = t0; v <= hi + 1e-9 && ticks.length < 8; v += step) ticks.push({ v: r1(v), pct: at(v) });
  return {
    ticks,
    rows: ok.map((r) => (r ? { lo: at(r.p10), hi: at(r.p90), mean: at(r.mean), width: clampPct(at(r.p90) - at(r.p10)) } : null)),
  };
}

/**
 * The matchup block. -> null off a board; { state: "none" } without an opponent;
 * otherwise { state: "win"|"points", winPct, win, sims, me, them, scale, oppSlots,
 * oppCounts, oppSummary }.
 */
export function matchupView(desk, { me = null, them = null } = {}) {
  if (desk?.status !== "in_season") return null;
  const o = desk.opponent;
  if (!o) return { state: "none" };
  const wp = desk.winProb;
  const win = prob(wp?.now);
  const myBanked = r1((desk.slots || []).reduce((t, s) => t + (fin(s.banked) ? s.banked : 0), 0));
  const mine = goodRange(wp?.mine);
  const theirs = goodRange(wp?.theirs) ?? goodRange(o.projectedTotal);
  const oppSlots = (o.slots || []).map((s) => {
    const key = oppSlotKey(s);
    return { ...s, key, stateLabel: SLOT_STATES[key].label, stateLong: SLOT_STATES[key].long };
  });
  const count = (k) => oppSlots.filter((s) => s.key === k).length;
  const oppCounts = { locked: count("locked"), unknown: count("unknown"), open: count("reset") + count("empty") + count("yet"), final: count("final") };
  const oppSummary = [
    oppCounts.locked ? `${oppCounts.locked} locked` : null,
    oppCounts.unknown ? `${oppCounts.unknown} unknown` : null,
    oppCounts.open ? `${oppCounts.open} open` : null,
    oppCounts.final ? `${oppCounts.final} final` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    state: win == null ? "points" : "win",
    win,
    winPct: win == null ? null : pct(win),
    sims: fin(wp?.sims) ? wp.sims : null,
    me: { name: me?.name ?? "You", avatarId: me?.avatarId ?? null, teamLogoUrl: me?.teamLogoUrl ?? null, banked: myBanked, range: mine },
    them: {
      rosterId: o.rosterId,
      name: o.teamName || them?.name || o.ownerName || "Opponent",
      ownerName: o.ownerName ?? them?.ownerName ?? null,
      record: recordText(o.record),
      ...(o.avatar ? avatarProps(o.avatar) : { avatarId: them?.avatarId ?? null, teamLogoUrl: them?.teamLogoUrl ?? null }),
      banked: fin(o.bankedTotal) ? r1(o.bankedTotal) : null,
      range: theirs,
      playersStillToPlay: o.playersStillToPlay,
      gamesRemaining: fin(o.gamesRemaining) ? o.gamesRemaining : null,
    },
    scale: bandScale([mine, theirs]),
    oppSlots,
    oppCounts,
    oppSummary,
  };
}

/** "Range 186-225, most likely 205" for a projected total. */
export function rangeText(r) {
  if (!goodRange(r)) return "unknown";
  return `${Math.round(r.p10)}-${Math.round(r.p90)}`;
}

/** Who they still have to play: a list of names when the engine gives one, else the count line. */
export function stillToPlayText(them) {
  const p = them?.playersStillToPlay;
  const g = them?.gamesRemaining;
  if (Array.isArray(p)) return { names: p.map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean), line: `${plural(p.length, "player")} still to play${g != null ? `, ${plural(g, "game")} left` : ""}` };
  if (fin(p)) return { names: [], line: `${plural(p, "player")} still to play${g != null ? `, ${plural(g, "game")} left` : ""}` };
  return { names: [], line: "Players still to play: unknown" };
}

/** The win model's assumptions, with the unknown-lock weight in plain words. */
export function assumptionLines(wp) {
  if (!wp) return [];
  const lines = (wp.assumptions || []).filter((s) => typeof s === "string" && s.trim());
  const w = prob(wp.unknownLockWeight);
  if (w != null) lines.push(`A score equal to his latest game is treated as locked ${pct(w)} of the time, the rate seen in past weeks.`);
  if (fin(wp.sims)) lines.push(`${wp.sims.toLocaleString("en-US")} simulated finishes of this week.`);
  return lines;
}

/**
 * The decision card's win chances, shown as information beside the lean (the lean
 * itself rests on points: lean.leanBasis). -> null without both win chances;
 * { lock, hold, lockPct, holdPct, leaned, gain, gainText, disagree }.
 */
export function winCompare(card, _wp = null) {
  const l = card?.lean;
  const lock = prob(l?.winProbIfLock);
  const hold = prob(l?.winProbIfHold);
  if (lock == null || hold == null || l.value === "none") return null;
  const gain = Math.round(Math.abs(lock - hold) * 100);
  const gainText = gain >= 1 ? `+${gain} pts of win chance` : "under 1 pt of win chance";
  // When win chance and the points lean point different ways, the engine's own reason,
  // as written (it says which way win chance points and what that has been worth here).
  const disagree = l.disagrees && typeof l.reason === "string" && l.reason.trim() ? l.reason.trim().replace(/\.?$/, ".") : null;
  return { lock, hold, lockPct: pct(lock), holdPct: pct(hold), leaned: l.value, gain, gainText, disagree, basis: l.leanBasis ?? null };
}

/**
 * Boom/bust profile bar: p10-p90 band, p50 tick, optional "now" tick, on 0..max.
 * -> { ok:false, missing } | { ok, p10, p50, p90, pos:{lo,hi,mid,now,boom,bust}, boom, bust, n, ... }
 */
export function profileView(profile, { x = null } = {}) {
  const p = profile;
  if (!p || !fin(p.p10) || !fin(p.p50) || !fin(p.p90) || !(p.p10 <= p.p50 && p.p50 <= p.p90)) return { ok: false, missing: "Boom/bust profile unknown: too few games loaded." };
  const n = fin(p.n) ? p.n : null;
  const max = Math.max(p.p90, fin(p.boomThreshold) ? p.boomThreshold : 0, fin(x) ? x : 0, 1) * 1.08;
  const at = (v) => (fin(v) ? clampPct((Math.max(0, v) / max) * 100) : null);
  const boom = prob(p.boomRate);
  const bust = prob(p.bustRate);
  return {
    ok: true,
    p10: p.p10,
    p50: p.p50,
    p90: p.p90,
    pos: { lo: at(p.p10), hi: at(p.p90), mid: at(p.p50), now: at(x), boom: at(p.boomThreshold), bust: at(p.bustThreshold) },
    width: clampPct(at(p.p90) - at(p.p10)),
    boom: boom == null ? null : { pct: pct(boom), text: `Boom ${pct(boom)}`, threshold: fin(p.boomThreshold) ? `${fmt(p.boomThreshold)}+ pts` : null },
    bust: bust == null ? null : { pct: pct(bust), text: `Bust ${pct(bust)}`, threshold: fin(p.bustThreshold) ? `under ${fmt(p.bustThreshold)}` : null },
    n,
    nText: n == null ? "n unknown" : n === 1 ? "last 1 game" : `last ${n} games`,
    rangeText: `${fmt(p.p10)}-${fmt(p.p90)}`,
    x: fin(x) ? x : null,
  };
}

/**
 * Chance he plays each remaining game and all of them.
 * -> null | { games:[{date, day, pct, value, dash, listed}], allPct, n, basis }
 * `dash` is the filled share of a ring's circumference (0-100). With an uncertain
 * listing (GTD, DTD) for his next game, that game shows the listing instead of a
 * percentage and "plays all" is left out: nothing here rests on a listed-play rate,
 * which is not measured.
 */
export function availabilityView(card) {
  const a = card?.availability;
  if (!a || !Array.isArray(a.perGame) || !a.perGame.length) return null;
  const status = card.injury?.status ?? null;
  const uncertain = !!status && UNCERTAIN_RE.test(status);
  const days = new Map((card.weekGames || []).map((g) => [g.date, g]));
  const games = a.perGame.map((g, i) => {
    const listed = uncertain && i === 0 ? status : null;
    const v = listed ? null : prob(g.pPlay);
    const wg = days.get(g.date);
    return { date: g.date, day: wg?.day ?? g.date, opponent: wg?.opponent ?? null, away: wg?.away ?? null, value: v, pct: listed ? `listed ${listed}` : pct(v), dash: v == null ? 0 : clampPct(v * 100), listed };
  });
  const all = uncertain ? null : prob(a.pAll);
  return { games, allPct: all == null ? null : pct(all), all, n: fin(a.n) ? a.n : null, basis: a.basis ?? null };
}

/** "Sat 7:30 PM EST" in `timeZone` (the viewer's on the client; Eastern on the server). */
export function whenText(iso, timeZone = "America/New_York") {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(t).replace(",", "");
}

const CLOCK_IN_TEXT = /,?\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}:\d{2}\s*[AP]M\s*E[SD]?T\b/g;

/** The engine's deadline reason without the clock time the title already shows. */
export function reasonWithoutTime(reason) {
  if (typeof reason !== "string" || !reason.trim()) return null;
  return reason.replace(CLOCK_IN_TEXT, "").replace(/\s{2,}/g, " ").trim() || null;
}

/**
 * The model's call on a lock-or-hold card. -> null without decision.action;
 * { action, title, whenIso, whenFallback, reason, triggers:[{kind,text}] }.
 * The wait title is completed with a local time on the client (LocalWhen).
 */
export function actionView(card) {
  const d = card?.decision;
  const a = d?.action;
  if (a !== "lock_now" && a !== "wait" && a !== "hold") return null;
  const triggers = (d.waitTriggers || []).filter((t) => t && typeof t.text === "string" && t.text.trim()).map((t) => ({ kind: t.kind, text: t.text }));
  if (a === "lock_now") return { action: a, title: "Lock now", whenIso: null, whenFallback: null, reason: null, triggers: [] };
  if (a === "hold") return { action: a, title: "Hold", whenIso: null, whenFallback: null, reason: null, triggers };
  const when = whenText(d.deadline);
  return { action: a, title: when ? "Wait until" : "Wait", whenIso: when ? d.deadline : null, whenFallback: when, reason: reasonWithoutTime(d.deadlineReason), triggers };
}

const isNoise = (o) => o.real === false || o.noise === true;

/**
 * "What moves your win chance". -> null without whatIf;
 * { baseline, basePct, baseText, rows, plan, more }.
 * The baseline is the model's plan (winProb.now): each option is that plan with one
 * action forced, so a row shows what deviating from the plan does. Rows that beat the
 * plan come first and are flagged `above`; then the costliest deviations; changes within
 * simulation noise (real: false) last. `distinct` keeps each player's first row only
 * (Home). Each bar runs from the baseline (the centre line) by the signed change.
 */
export function whatIfView(desk, { limit = Infinity, distinct = false } = {}) {
  const w = desk?.whatIf;
  const base = prob(w?.baseline);
  if (!w || base == null || !Array.isArray(w.options)) return null;
  const opts = w.options.filter((o) => o && prob(o.winProb) != null);
  const deltaOf = (o) => Math.round(fin(o.delta) ? o.delta : (o.winProb - base) * 100);
  const span = Math.max(5, ...opts.filter((o) => !isNoise(o)).map((o) => Math.abs(deltaOf(o))));
  const row = (o) => {
    const d = deltaOf(o);
    const noise = isNoise(o);
    const half = clampPct((Math.min(Math.abs(d), span) / span) * 50);
    return {
      id: o.id,
      kind: o.kind,
      playerId: o.playerId ?? null,
      forPlayerId: o.forPlayerId ?? null,
      slotLabel: o.slotLabel ?? null,
      text: o.text || o.id,
      deadline: o.deadline ?? null,
      deadlineFallback: o.deadline && !/\bbefore\b/i.test(o.text || "") ? whenText(o.deadline) : null,
      winProb: o.winProb,
      winPct: pct(o.winProb),
      delta: d,
      deltaText: noise ? "no real difference" : d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0",
      deltaSr: noise ? "no real difference" : d === 0 ? "no change" : `${d > 0 ? "up" : "down"} ${plural(Math.abs(d), "percentage point")}`,
      noise,
      above: !noise && d > 0,
      bar: noise || d === 0 ? null : { left: d > 0 ? 50 : clampPct(50 - half), width: half, dir: d > 0 ? "up" : "down" },
    };
  };
  // Real changes first: any that beat the baseline (best first), then the costliest
  // deviations; changes within simulation noise last.
  const rank = (o) => (isNoise(o) ? 2 : deltaOf(o) > 0 ? 0 : 1);
  let sorted = [...opts].sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? deltaOf(b) - deltaOf(a) : rank(a) === 1 ? deltaOf(a) - deltaOf(b) : b.winProb - a.winProb));
  if (distinct) {
    const seen = new Set();
    sorted = sorted.filter((o) => {
      const k = o.playerId ?? o.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  const all = sorted.map(row);
  const plan = w.plan && prob(w.plan.winProb) != null ? { winProb: w.plan.winProb, winPct: pct(w.plan.winProb), delta: Math.round(fin(w.plan.delta) ? w.plan.delta : (w.plan.winProb - base) * 100) } : null;
  const rows = all.slice(0, limit);
  const se = typeof w.note === "string" ? w.note.match(/under (\d+(?:\.\d+)?) standard errors?/) : null;
  const noiseText = se ? `A change smaller than ${se[1]} standard errors of the simulation shows as no real difference.` : null;
  const nothing = prob(typeof w.doNothing === "object" ? w.doNothing?.winProb : w.doNothing);
  const follow = plan?.winProb ?? base;
  return {
    baseline: base,
    basePct: pct(base),
    followPct: pct(follow),
    headline: `Rough win chance if you follow the model's calls: ${pct(follow)}`,
    doNothingPct: nothing == null ? null : pct(nothing),
    rows,
    plan,
    above: all.filter((r) => r.above).length,
    more: Math.max(0, all.length - rows.length),
    noiseText,
  };
}

function cmp(value, league) {
  if (!fin(value) || !fin(league)) return 0;
  return value - league >= 0.08 ? 1 : league - value >= 0.08 ? -1 : 0;
}

/**
 * How a manager plays lock-in, as plain facts with the league beside each.
 * -> null | { lead, facts:[{label, value, league}], basis, shrinkText }
 */
export function habitView(profile, { season = null, self = false } = {}) {
  const p = profile;
  if (!p) return null;
  const facts = [];
  const lt = p.lockTiming;
  const day = DAYS[lt?.cutoffDay] ?? lt?.cutoffDay ?? "the cutoff";
  let lead = null;
  if (lt && prob(lt.earlyShare) != null) {
    const c = cmp(lt.earlyShare, lt.league);
    const how = c > 0 ? (lt.earlyShare >= 0.5 ? "Usually locks early" : "Locks earlier than most") : c < 0 ? (lt.earlyShare < 0.5 ? "Usually locks late" : "Locks later than most") : "Locks about when most of the league does";
    lead = `${how}: ${pct(lt.earlyShare)} of banked slots locked before ${day}`;
    facts.push({ label: `Locked before ${day}`, value: pct(lt.earlyShare), league: prob(lt.league) != null ? pct(lt.league) : null });
  }
  const th = p.lockThreshold;
  if (th && (fin(th.median) || fin(th.vsForecast))) {
    facts.push({
      label: "Typical score locked",
      value: [fin(th.median) ? `${fmt(th.median)} pts` : null, fin(th.vsForecast) ? `${Math.round(th.vsForecast * 100)}% of forecast` : null].filter(Boolean).join(", "),
      league: fin(th.league) ? `${Math.round(th.league * 100)}% of forecast` : null,
    });
  }
  for (const [k, label] of [
    ["emptySlotRate", "Slots left empty"],
    ["zeroRate", "Slots that ended the week at 0"],
    ["benchUse", "Bench use"],
  ]) {
    const v = p[k];
    if (v && prob(v.value) != null) facts.push({ label, value: pct(v.value), league: prob(v.league) != null ? pct(v.league) : null });
  }
  if (!facts.length) return null;
  const own = fin(p.weeks) && p.weeks > 0;
  const shrinkText = !own || (prob(p.shrinkage) != null && p.shrinkage >= 0.99) ? `Too few of ${self ? "your" : "their"} own weeks yet, so these are the league's figures.` : prob(p.shrinkage) != null && p.shrinkage > 0 ? `Each figure is pulled ${pct(p.shrinkage)} toward the league's, so a short record does not swing it.` : null;
  return { lead, facts, basis: own ? basisLine(p, season) : null, shrinkText, provisional: p.source === "provisional", source: p.source ?? null };
}

/** "Based on 9 weeks this season and 23 last season, recent weeks weighted more." */
export function basisLine(p, season = null) {
  const seasons = Array.isArray(p?.seasons) ? p.seasons.filter((s) => fin(s?.weeks) && s.weeks > 0) : [];
  const half = fin(p?.halfLifeWeeks) ? ` (half-life ${plural(Math.round(p.halfLifeWeeks), "week")})` : "";
  if (seasons.length) {
    const cur = Number(season);
    const parts = [...seasons]
      .sort((a, b) => Number(b.season) - Number(a.season))
      .map((s) => {
        const yr = Number(s.season);
        const when = fin(cur) && cur > 0 ? (yr === cur ? "this season" : yr === cur - 1 ? "last season" : `in ${s.season}`) : `in ${s.season}`;
        return `${s.weeks} ${s.weeks === 1 ? "week" : "weeks"} ${when}`;
      });
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
    return `Based on ${list}, recent weeks weighted more${half}.`;
  }
  if (fin(p?.weeks)) return `Based on ${plural(p.weeks, "week")}, recent weeks weighted more${half}.`;
  return null;
}

const INTENT = { contending: "Playing like a contender", middle: "Playing like a team in the middle of the table", rebuilding: "Playing like a rebuilding team" };

/** "Playing like a contender: 8-3, inside the playoff line" (evidence, never a label on the person). */
export function intentLine(intent) {
  if (!intent) return null;
  if (!INTENT[intent.label]) return typeof intent.text === "string" && intent.text.trim() ? { text: intent.text[0].toUpperCase() + intent.text.slice(1), confidence: null } : null;
  const ev = (intent.evidence || []).filter((e) => typeof e === "string" && e.trim());
  return { text: ev.length ? `${INTENT[intent.label]}: ${ev.join(", ")}` : INTENT[intent.label], confidence: ["low", "moderate", "high"].includes(intent.confidence) ? `${intent.confidence} confidence` : null };
}

/**
 * The viewing manager's lock history. -> null | { ok:false, missing } |
 * { ok, perWeek, early, late, earlyPct, latePct, n, weeks:[{label, value, widthPct}] }.
 */
export function historyView(history) {
  if (!history) return null;
  const n = fin(history.n) ? history.n : fin(history.weeks) ? history.weeks : 0;
  if (!n || !fin(history.leftOnTablePerWeek)) return { ok: false, missing: "Not enough past weeks to describe yet." };
  const early = fin(history.lockedEarlyPerWeek) ? history.lockedEarlyPerWeek : null;
  const late = fin(history.heldTooLongPerWeek) ? history.heldTooLongPerWeek : null;
  const split = (early ?? 0) + (late ?? 0);
  const rows = Array.isArray(history.byWeek) ? history.byWeek.filter((w) => fin(w?.leftOnTable)) : [];
  const max = Math.max(1, ...rows.map((w) => w.leftOnTable));
  return {
    ok: true,
    perWeek: history.leftOnTablePerWeek,
    early,
    late,
    earlyPct: split > 0 && early != null ? clampPct((early / split) * 100) : null,
    latePct: split > 0 && late != null ? clampPct((late / split) * 100) : null,
    n,
    nText: `n=${plural(n, "week")}`,
    weeks: rows.map((w) => ({ label: `Week ${w.week}${w.season ? ` '${String(w.season).slice(2)}` : ""}`, value: w.leftOnTable, early: w.lockedEarly, late: w.heldTooLong, widthPct: clampPct((Math.max(0, w.leftOnTable) / max) * 100) })),
  };
}
