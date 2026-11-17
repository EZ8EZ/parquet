/**
 * Tonight's timeline for the UI, from the engine's `tonight` field (./sequence.js).
 * Pure. Groups decision points by listed start time (each one a deadline: the incoming
 * player must be in the slot before it), splits passed / next / later, and pulls the
 * facts each swap row shows: the two players, the slot, the threshold and the starter's
 * line so far. No projection is surfaced as a number; `now.below` is passed through only
 * as the model's estimate, with its inputs.
 */
import { availabilityOf } from "./availability.js";
import { dayLabel } from "./calendar.js";

const ACTION = new Set(["start", "swap_check", "lock_or_hold"]);

/** "before 7:30 PM EST" in `timeZone` (the viewer's, client side), or null without a time. */
export function localDeadline(iso, timeZone = undefined) {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return null;
  const s = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(t);
  return `before ${s}`;
}

/** Countdown to a deadline: "1 h 05 min", "4 min 10 s", "45 s"; null once it has passed. */
export function countdownText(deadlineMs, nowMs) {
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return null;
  const s = Math.floor((deadlineMs - nowMs) / 1000);
  if (s <= 0) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m >= 10) return `${m} min`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, "0")} s`;
  return `${sec} s`;
}

function listing(card) {
  const status = card?.injury?.status ?? null;
  if (!status) return null;
  const av = availabilityOf(status);
  return { status, assumed: av.assumed };
}

/**
 * -> null (no tonight field) | { status: "no_games", nextDay } | { status: "games", tipsKnown,
 *    nodes: [{ key, atMs, at, atText, listedStart, passed, starting, actions }], next, passed,
 *    later, afterGames, notes, toDecide }
 * actions: { kind: "start", playerId, slotLabel, replacesPlayerId, threshold|null, laterTip }
 *        | { kind: "swap", earlyId, laterId, slotLabel, threshold, below|null, belowInputs|null }
 *        | { kind: "lock_or_hold", playerId, x, expectedIfHeld }
 * players: id -> { name, team, slotLabel, line, tipMs, status, listing }
 */
export function tonightView(desk, nowMs = Date.parse(desk?.generatedAt)) {
  const t = desk?.tonight;
  if (!t) return null;
  const cards = new Map((desk.cards || []).map((c) => [c.playerId, c]));
  const players = {};
  for (const p of t.players || []) {
    const c = cards.get(p.playerId);
    players[p.playerId] = {
      name: c?.name ?? `Player ${p.playerId}`,
      team: c?.team ?? null,
      slotLabel: p.slotLabel ?? c?.slotLabel ?? null,
      line: p.line ?? null,
      tipMs: p.tip ? Date.parse(p.tip) : null,
      tipText: p.tipText ?? null,
      status: p.status,
      listing: listing(c),
    };
  }
  for (const c of desk.cards || []) if (!players[c.playerId]) players[c.playerId] = { name: c.name, team: c.team, slotLabel: c.slotLabel, line: null, tipMs: null, tipText: null, status: null, listing: listing(c) };

  if (t.status !== "games") {
    const next = (desk.cards || []).map((c) => c.nextGame?.date).filter((d) => d && d > t.date).sort()[0] ?? null;
    return { status: "no_games", nextDay: next ? { date: next, day: dayLabel(next) } : null, notes: t.notes || [], players };
  }

  const nodes = new Map();
  const nodeFor = (atIso, atText, listedStart, order) => {
    const key = atIso ?? `order-${order}`;
    if (!nodes.has(key)) {
      const atMs = atIso ? Date.parse(atIso) : null;
      nodes.set(key, { key, at: atIso, atMs, atText, listedStart, order, passed: atMs != null ? atMs <= nowMs : false, starting: [], actions: [] });
    }
    return nodes.get(key);
  };
  const tipIso = (id) => (players[id]?.tipMs != null ? new Date(players[id].tipMs).toISOString() : null);

  for (const it of t.timeline || []) {
    if (it.kind === "after_game") continue;
    const n = nodeFor(it.at, it.atText, it.listedStart, it.order);
    if (it.at == null && it.passed) n.passed = true;
    if (it.kind === "lineup_at_start") {
      n.starting = [...new Set([...n.starting, ...(it.inputs?.gamesStarting || [])])];
    } else if (it.kind === "start") {
      const early = it.inputs?.reason === "earlier_tip_first";
      n.actions.push({ kind: "start", playerId: it.playerId, slotLabel: it.slotLabel ?? null, replacesPlayerId: it.replacesPlayerId ?? null, threshold: early ? it.inputs.threshold : null, laterTip: early ? players[it.replacesPlayerId]?.tipText ?? null : null });
      if (early && it.replacesPlayerId) {
        // the swap back is decided at the later player's listed start
        const at = tipIso(it.replacesPlayerId);
        const later = players[it.replacesPlayerId];
        const sn = nodeFor(at, at ? `before ${later?.tipText ?? ""}`.trim() : `before ${later?.name ?? "his"}'s game`, later?.tipText ?? null, it.order + 0.5);
        sn.actions.push({ kind: "swap", earlyId: it.playerId, laterId: it.replacesPlayerId, slotLabel: it.slotLabel ?? null, threshold: it.inputs.threshold, below: null, belowInputs: null });
      }
    } else if (it.kind === "swap_check") {
      const now = it.inputs?.now ?? null;
      n.actions.push({
        kind: "swap",
        earlyId: it.forPlayerId,
        laterId: it.playerId,
        slotLabel: it.slotLabel ?? null,
        threshold: it.inputs?.threshold ?? null,
        below: now && typeof now.below === "boolean" ? now.below : null,
        belowInputs: now ? (now.final != null ? { final: now.final, threshold: it.inputs.threshold } : { projectedFinal: now.projectedFinal, threshold: now.thresholdNow }) : null,
      });
    } else if (it.kind === "lock_or_hold") {
      n.actions.push({ kind: "lock_or_hold", playerId: it.playerId, x: it.inputs?.x ?? null, expectedIfHeld: it.inputs?.expectedIfHeld ?? null });
    }
  }
  for (const tip of t.tips || []) {
    const n = nodeFor(tip.at, `before ${tip.atText}`, tip.atText, 0);
    n.starting = [...new Set([...n.starting, ...(tip.playerIds || [])])];
  }

  const list = [...nodes.values()].sort((a, b) => (a.atMs ?? Infinity) - (b.atMs ?? Infinity) || a.order - b.order);
  const passed = list.filter((n) => n.passed);
  const open = list.filter((n) => !n.passed);
  const afterGames = (t.timeline || [])
    .filter((i) => i.kind === "after_game")
    .map((i) => ({ playerId: i.playerId, expectedIfHeld: i.inputs?.expectedIfHeld ?? null, gamesAfter: i.inputs?.gamesAfter ?? null, n: i.inputs?.n ?? null }));
  return {
    status: "games",
    tipsKnown: !!t.tipsKnown,
    nodes: list,
    next: open[0] ?? null,
    later: open.slice(1),
    passed,
    afterGames,
    notes: t.notes || [],
    players,
    toDecide: open.reduce((s, n) => s + n.actions.filter((a) => ACTION.has(a.kind) || a.kind === "swap").length, 0),
  };
}

/** The swap row's scale: threshold and the starter's points so far on one axis. */
export function swapScale(threshold, line) {
  const pts = line?.fpSoFar ?? null;
  const max = Math.max(10, (threshold ?? 0) * 1.5, pts != null ? pts * 1.15 : 0);
  const pct = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(Math.min(100, Math.max(0, (v / max) * 100)) * 10) / 10);
  return { max: Math.round(max), thresholdPct: pct(threshold), pointsPct: pct(pts) };
}
