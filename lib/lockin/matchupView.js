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
import { DEFAULT_TZ, dayClockText, decideBy, displayTz, stripZone } from "./time.js";
import { tonightView } from "./tonightView.js";
import { BEAT_RECAL } from "./recalibrate.js";

/**
 * The calibration line for "later game beats it". The figure shown is recalibrated
 * against past games (recalibrate.js); the engine does not publish its residual error
 * by bin, so no direction or size is claimed.
 */
export const BEAT_NOTE = `"Later game beats it" is calibrated against past games (n=${BEAT_RECAL.trainN.toLocaleString("en-US")}, checked on ${BEAT_RECAL.testN.toLocaleString("en-US")} more); it is still approximate in the middle range.`;

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
  // a slot the viewer assumed is counted as assumed, never as an inferred lock state
  const isAssumed = (s) => /^assumed_/.test(s.lockStateReason || "");
  const count = (k) => oppSlots.filter((s) => s.key === k && !isAssumed(s)).length;
  const oppCounts = { locked: count("locked"), unknown: count("unknown"), open: count("reset") + count("empty") + count("yet"), final: count("final"), assumed: oppSlots.filter(isAssumed).length };
  const oppSummary = [
    oppCounts.assumed ? `${oppCounts.assumed} assumed` : null,
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
  // engine: winProbDiffReal is true only above 2 paired standard errors and a 5-point
  // floor; inside it the two figures are too close to call and show greyed.
  const real = l.winProbDiffReal !== false;
  return { lock, hold, lockPct: pct(lock), holdPct: pct(hold), leaned: l.value, gain, gainText, disagree: roughen(disagree), basis: l.leanBasis ?? null, real, se: fin(l.winProbDiffSe) ? l.winProbDiffSe : null };
}

/** Engine text that quotes a win chance, with its first mention named as rough (it is only roughly calibrated). */
export function roughen(text) {
  if (typeof text !== "string") return text;
  // the first mention carries the label; later ones in the same sentence read as the same figure
  if (/\brough\s+win chance/i.test(text)) return text;
  return text.replace(/\b([Ww])in chance/, (m, w) => (w === "W" ? "Rough win chance" : "rough win chance"));
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

/** "Sat 7:30 PM" in the board's display zone (lib/lockin/time.js); the zone is named once, in the board's top bar. */
export function whenText(iso, timeZone = DEFAULT_TZ) {
  return dayClockText(iso, timeZone);
}

const CLOCK_IN_TEXT = /,?\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}:\d{2}\s*[AP]M(?:\s*E[SD]?T\b)?/g;

/** The engine's deadline reason without the clock time the title already shows. */
export function reasonWithoutTime(reason) {
  if (typeof reason !== "string" || !reason.trim()) return null;
  return reason.replace(CLOCK_IN_TEXT, "").replace(/\s{2,}/g, " ").trim() || null;
}

/**
 * The call in words, with the decide-by time (DECIDE_BUFFER_MIN before the listed tip)
 * and the hard tip beside it: "Wait until 7:20 PM, then lock · locks at 7:30", "Hold ·
 * decide again by Wed 6:50 PM", "Lock now". Between the decide-by time and the tip:
 * "Decide now · locks at 7:30" with `urgent`. Display only; the engine's deadline stays
 * at the tip. -> { headline, urgent, by } | null
 */
export function callHeadline(card, { tz = DEFAULT_TZ, today = null, nowMs = Date.now() } = {}) {
  const d = card?.decision;
  const a = d?.action;
  if (a !== "lock_now" && a !== "wait" && a !== "hold") return null;
  if (a === "lock_now") return { headline: "Lock now", urgent: false, by: null };
  const then = card.lean?.value === "hold" ? "hold" : "lock";
  const db = d.deadline ? decideBy(d.deadline, tz, { today, nowMs }) : null;
  if (!db || db.tipPassed) return { headline: a === "wait" ? `Wait for his next tip, then ${then}` : "Hold · resets at his next tip", urgent: false, by: null };
  // the deadline can be a bench teammate's tip (to free the slot for him), not this player's own
  const other = d.deadlineBy?.name ?? null;
  const tipWord = other ? `${other} tips` : a === "hold" ? "resets" : then === "hold" ? "tips" : "locks";
  if (db.passed) return { headline: `Decide now · ${tipWord} at ${db.tipText}`, urgent: true, by: db };
  if (a === "wait") return { headline: `Wait until ${db.byText}, then ${then} · ${other ? `${other} tips` : then === "lock" ? "locks" : "tips"} at ${db.tipText}`, urgent: false, by: db };
  return { headline: `Hold · decide again by ${db.byText}${other ? ` · ${other} tips at ${db.tipText}` : ""}`, urgent: false, by: db };
}

/**
 * The model's call on a lock-or-hold card. -> null without decision.action;
 * { action, title, headline, urgent, whenIso, whenFallback, reason, triggers:[{kind,text}] }.
 * `tz`: the board's display zone (displayTz(desk)); `today` / `nowMs` place the
 * decide-by time (callHeadline).
 */
export function actionView(card, tz = DEFAULT_TZ, { today = null, nowMs = Date.now() } = {}) {
  const d = card?.decision;
  const a = d?.action;
  if (a !== "lock_now" && a !== "wait" && a !== "hold") return null;
  const triggers = (d.waitTriggers || []).filter((t) => t && typeof t.text === "string" && t.text.trim()).map((t) => ({ kind: t.kind, text: shownTrigger(t) }));
  const h = callHeadline(card, { tz, today, nowMs });
  if (a === "lock_now") return { action: a, title: "Lock now", headline: h.headline, urgent: false, whenIso: null, whenFallback: null, reason: null, triggers: [] };
  if (a === "hold") return { action: a, title: "Hold", headline: h.headline, urgent: h.urgent, whenIso: null, whenFallback: null, reason: null, triggers };
  const when = whenText(d.deadline, tz);
  return { action: a, title: when ? "Wait until" : "Wait", headline: h.headline, urgent: h.urgent, whenIso: when ? d.deadline : null, whenFallback: when, reason: reasonWithoutTime(d.deadlineReason), triggers };
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
  const tz = displayTz(desk);
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
      text: stripZone(o.text || o.id),
      deadline: o.deadline ?? null,
      deadlineFallback: o.deadline && !/\bbefore\b/i.test(o.text || "") ? whenText(o.deadline, tz) : null,
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
  const excluded = fin(history.excludedWeeks) ? history.excludedWeeks : 0;
  const leftOut = excluded ? `${plural(excluded, "week")} left out because Sleeper reports ${excluded === 1 ? "it" : "them"} inconsistently` : null;
  if (!n && excluded) return { ok: false, missing: `Not enough consistent weeks: ${leftOut}.`, excluded };
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
    excluded,
    nText: `n=${plural(n, "week")}${leftOut ? `; ${leftOut}` : ""}`,
    weeks: rows.map((w) => ({ label: `Week ${w.week}${w.season ? ` '${String(w.season).slice(2)}` : ""}`, value: w.leftOnTable, early: w.lockedEarly, late: w.heldTooLong, widthPct: clampPct((Math.max(0, w.leftOnTable) / max) * 100) })),
  };
}

/** Engine trigger text in the board's voice: "your opponent's" -> "their". */
function triggerText(t) {
  return t.replace(/your opponent's/gi, "their").replace(/\byou are projected\b/gi, "you're projected");
}

/**
 * A wait trigger names the call made at the deadline ("At the deadline (Wed 7:30 PM) the
 * call is lock; it becomes hold if ..."). Rows and the board already headline that call
 * ("Wait until Wed 7:30 PM, then lock"), so they show only the flip: "Hold instead if ...".
 */
function shownTrigger(t) {
  if (t.appliesAt === "deadline" && t.condition && t.flipsTo) {
    return `${t.flipsTo === "hold" ? "Hold" : "Lock"} instead if ${t.condition}`;
  }
  return t.text;
}

/**
 * Home's "Your calls": one row per live decision, soonest deadline first. Each row: the
 * player, the score on the table, the call in words with its deadline in the board's
 * zone ("Decide by Wed 7:30 PM", "Lock now", "Hold: resets at Wed 7:00 PM"), the model's
 * lean (from points), what would change the call with the current value where the
 * engine's threshold is a projected margin, the first hazard, and the rough win chances
 * if lock / if hold (winCompare: greyed when too close to call). `chance` marks a call
 * that is genuinely close (win chances inside the noise floor, or a marginal lean) and
 * not a listed-out player: the only rows that may offer the leave-it-to-chance tiebreak.
 */
export function callRows(desk) {
  if (desk?.status !== "in_season") return [];
  const tz = displayTz(desk);
  const today = desk.today ?? null;
  const wp = desk.winProb;
  const mine = goodRange(wp?.mine);
  const theirs = goodRange(wp?.theirs);
  const lead = mine && theirs ? Math.round(theirs.mean - mine.mean) : null;
  const leadNow = lead == null ? null : lead > 0 ? `now they lead by ${lead}` : lead < 0 ? `now you lead by ${-lead}` : "now level";
  const nowMs = Date.parse(desk.generatedAt);
  const rows = (desk.cards || [])
    .filter((c) => c.urgencyRank <= 1)
    .map((c) => {
      const d = c.decision || {};
      const a = d.action ?? null;
      const x = fin(c.stopping?.x) ? c.stopping.x : fin(c.banked) ? c.banked : null;
      const h = callHeadline(c, { tz, today, nowMs });
      const title = h ? h.headline : stripZone(d.text || c.hazards?.[0]?.text || "");
      const triggers = (d.waitTriggers || [])
        .filter((t) => t && typeof t.text === "string" && t.text.trim())
        .map((t) => ({ kind: t.kind, text: triggerText(stripZone(shownTrigger(t))), now: t.kind === "opponent_lead" ? leadNow : null, threshold: t.kind === "opponent_lead" && fin(t.threshold) ? t.threshold : null, lead: t.kind === "opponent_lead" ? lead : null }));
      const listed = c.injury?.status ?? null;
      const out = /^(out|suspended|suspension|inactive)$/i.test(listed || "") || a === "lock_now" && /listed out/i.test(d.deadlineReason || "");
      const win = winCompare(c);
      const close = !!win && win.real === false;
      const marginal = c.lean?.confidence === "marginal";
      return {
        playerId: c.playerId,
        name: c.name,
        team: c.team,
        slotLabel: c.slotLabel,
        x,
        xText: x == null ? "—" : fmt(x),
        action: a,
        title,
        urgent: !!h?.urgent,
        deadline: d.deadline ?? null,
        deadlineMs: d.deadline ? Date.parse(d.deadline) : Infinity,
        reason: d.deadlineReason ? stripZone(reasonWithoutTime(d.deadlineReason)) : null,
        lean: c.lean?.value && c.lean.value !== "none" ? c.lean : null,
        // under a wait headline the lean is the call at the deadline, never a bare chip
        leanPrefix: a === "wait" ? "At the deadline:" : null,
        conditional: !!c.lean?.conditional,
        triggers,
        hazard: c.hazards?.[0]?.text ? stripZone(c.hazards[0].text) : null,
        listed,
        win,
        chance: !!a && a !== "lock_now" && !out && (close || marginal),
      };
    });
  // "Lock now" first (it cannot wait), then the soonest deadline
  return rows.sort((p, q) => (q.action === "lock_now") - (p.action === "lock_now") || p.deadlineMs - q.deadlineMs || (q.x ?? 0) - (p.x ?? 0));
}

/**
 * Tonight in one line for the scoreboard's footer, or null when Tonight has a move to
 * make (then the full Tonight section shows): { at, count, faces, allSet, noGames, nextDay }.
 */
export function tonightLine(desk, nowMs = Date.parse(desk?.generatedAt)) {
  const tv = tonightView(desk, nowMs);
  if (!tv) return null;
  if (tv.status === "no_games") return { noGames: true, nextDay: tv.nextDay?.day ?? null };
  const open = [tv.next, ...tv.later].filter(Boolean);
  if (!open.length) return null;
  const moves = open.some((n) => n.actions.some((x) => x.kind === "start" || x.kind === "swap"));
  if (moves) return null;
  const ids = [...new Set(open.flatMap((n) => n.starting))];
  const calls = open.reduce((t, n) => t + n.actions.filter((x) => x.kind === "lock_or_hold").length, 0);
  return { at: tv.next?.at ?? null, atText: tv.next?.atText ? stripZone(tv.next.atText) : null, count: ids.length, calls, faces: ids.slice(0, 4).map((id) => ({ playerId: id, name: tv.players[id]?.name ?? id, team: tv.players[id]?.team ?? null })), allSet: true, noGames: false };
}

/**
 * The lock board's Win % table: one row per live call, three columns (Lock now / Decide
 * at the deadline / Hold), each the rough win chance if that one call changes and the
 * model's plan holds for the rest. The model's own call (from points) is marked `plan`;
 * a change inside the simulation's noise is `noise` ("≈ same"). Swaps are listed apart,
 * with whether the plan already makes them.
 * -> null | { basePct, doNothingPct, rows:[{ playerId, name, team, slotLabel, xText, cells:{lock,wait,hold} }], swaps:[...] }
 */
export function winTable(desk) {
  const w = desk?.whatIf;
  const base = prob(w?.baseline);
  if (!w || base == null || !Array.isArray(w.options)) return null;
  const opts = w.options.filter((o) => o && prob(o.winProb) != null);
  const byKey = new Map(opts.map((o) => [`${o.kind}:${o.playerId}`, o]));
  const PLAN = { lock_now: "lock", wait: "wait", hold: "hold" };
  const cell = (o, plan) => {
    const v = o ? o.winProb : plan ? base : null;
    if (v == null) return null;
    const delta = o ? Math.round(fin(o.delta) ? o.delta : (o.winProb - base) * 100) : 0;
    const noise = o ? isNoise(o) : true;
    return { pct: pct(v), value: v, delta, noise, plan, label: plan ? "model's call" : noise ? "≈ same" : delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "0", sr: plan ? "the model's call" : noise ? "no real difference" : `${delta > 0 ? "up" : "down"} ${plural(Math.abs(delta), "point")}` };
  };
  const rows = (desk.cards || [])
    .filter((c) => c.urgencyRank <= 1 && PLAN[c.decision?.action])
    .map((c) => {
      const plan = PLAN[c.decision.action];
      const x = fin(c.stopping?.x) ? c.stopping.x : fin(c.banked) ? c.banked : null;
      return {
        playerId: c.playerId,
        name: c.name,
        team: c.team,
        slotLabel: c.slotLabel,
        xText: x == null ? "—" : fmt(x),
        cells: { lock: cell(byKey.get(`lock:${c.playerId}`), plan === "lock"), wait: cell(byKey.get(`wait:${c.playerId}`), plan === "wait"), hold: cell(byKey.get(`hold:${c.playerId}`), plan === "hold") },
      };
    });
  const planStarts = new Set((w.plan?.actions || []).filter((a) => a.kind === "start").map((a) => a.playerId));
  const swaps = opts
    .filter((o) => o.kind === "swap_in")
    .map((o) => ({ id: o.id, playerId: o.playerId, forPlayerId: o.forPlayerId ?? null, slotLabel: o.slotLabel ?? null, text: stripZone(o.text || o.id), inPlan: planStarts.has(o.playerId), ...cell(o, false) }));
  const nothing = prob(typeof w.doNothing === "object" ? w.doNothing?.winProb : w.doNothing);
  return { base, basePct: pct(base), doNothingPct: nothing == null ? null : pct(nothing), rows, swaps };
}
