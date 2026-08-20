import {
  describeTradeForRoster,
  describeTransaction,
  rosterName,
} from "../derive/describe.js";
import { leagueTimelines } from "../metrics/duration.js";
import { leagueFragility } from "../metrics/fragility.js";
import { buildDraftIndex, getTradedPickLineages } from "../lineage/index.js";
/** Mirrors the `parquet_roster` cookie convention: readable, non-httpOnly, one year. */
export const DIGEST_COOKIE = "parquet_digest_seen";
/**
 * The marker is PER IDENTITY, not per browser.
 *
 * One global marker was a real bug the moment the app grew a second identity: flip
 * the lens to a leaguemate and the panel would announce "nothing has moved since just
 * now", because YOUR visit thirty seconds ago had already advanced the only marker
 * there was. "Since your last visit" has to mean since *this* reader's last visit, so
 * each identity gets its own cookie and they cannot overwrite each other.
 *
 * The identity comes from `readMarkerIdentity` in lib/auth/server.ts: the seat where
 * one exists, else the lens roster, else `default`. Both halves are cookie-derived,
 * so keying the marker costs no corpus read on either the write or the read path.
 *
 * The suffix is sanitized because it lands in a cookie NAME, where the legal
 * character set is narrower than a value's and there is no encoding layer to lean on.
 * `default` keeps the bare historical name, so the one browser that has neither a
 * seat nor a lens - which after the front-door redirect is essentially only a reader
 * sitting on /about - keeps whatever marker it already had.
 */
export function digestCookieName(identity) {
  const safe = identity.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return !safe || safe === "default"
    ? DIGEST_COOKIE
    : `${DIGEST_COOKIE}_${safe}`;
}
/**
 * Movement worth interrupting someone for, in index points. Both indices are 0..100 and
 * absolute (not league-relative), so a move here means the roster itself changed rather
 * than its neighbours moving around it.
 */
export const TCI_MOVE_THRESHOLD = 5;
export const FRAGILITY_MOVE_THRESHOLD = 5;
/** Display caps. Totals are reported separately so the panel can own the overflow copy. */
export const MAX_TRADES = 6;
export const MAX_PICKS = 5;
export const MAX_MOVES = 4;
/** Upper bound on rosters tracked in one marker, so the cookie can never grow unbounded. */
export const MAX_TRACKED_ROSTERS = 64;
/**
 * THE FLOOR THAT LETS THE MARKER MEAN SOMETHING (SHELVED.md, S2).
 *
 * The old "since your last visit" panel advanced its own baseline on every render, so
 * a reader who opened it twice in the same minute always saw "nothing has moved since
 * just now" - the panel was what burned the very history it needed to have something to
 * say. This is the fix SHELVED.md names as the condition for reviving it: the marker
 * anchors to something coarser than "the last page view," with a floor under how often
 * it is allowed to move at all.
 *
 * Twelve hours, not a session id: this app persists no server-side session, so the only
 * honest proxy for "a new sitting" a stateless cookie can keep is elapsed wall-clock
 * time. Short enough that a reader who comes back tomorrow gets a real diff; long
 * enough that reloading, or checking again an hour later, reads the same window instead
 * of quietly resetting to "just now."
 */
export const DIGEST_ADVANCE_FLOOR_MS = 12 * 60 * 60 * 1000;
/**
 * Should a new visit actually move the marker forward?
 *
 * `null` (no marker yet) always advances - there is nothing to protect on a first visit,
 * and refusing to bootstrap would leave every reader stuck in "first-visit" forever. Once
 * a marker exists, it only moves once the floor has elapsed, so the window a revived
 * digest reports keeps growing between visits inside that floor rather than snapping
 * back to zero on every one of them.
 */
export function shouldAdvanceMarker(marker, now) {
  if (marker == null) return true;
  return now - marker.seenAt >= DIGEST_ADVANCE_FLOOR_MS;
}
// ------------------------------------------------------------------ marker codec
const MARKER_VERSION = "v1";
/**
 * Encoded with `.`, `~` and `:` only. All three are legal cookie-value octets, so the
 * marker survives a round trip without depending on any layer's percent-encoding, and a
 * version prefix means a future shape change expires old markers instead of misreading
 * them.
 */
export function encodeMarker(marker) {
  const rows = marker.metrics
    .slice(0, MAX_TRACKED_ROSTERS)
    .map((r) => `${r.rosterId}:${clampIndex(r.tci)}:${clampIndex(r.fragility)}`)
    .join("~");
  return `${MARKER_VERSION}.${Math.round(marker.seenAt)}.${rows}`;
}
/** Never throws. Anything unrecognised is treated as "no marker", i.e. a first visit. */
export function parseMarker(raw) {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== MARKER_VERSION) return null;
  const seenAt = Number(parts[1]);
  if (!Number.isInteger(seenAt) || seenAt <= 0) return null;
  const metrics = [];
  if (parts[2].length > 0) {
    for (const chunk of parts[2].split("~")) {
      const fields = chunk.split(":");
      if (fields.length !== 3) return null;
      const [rosterId, tci, fragility] = fields.map(Number);
      if (!Number.isInteger(rosterId) || rosterId <= 0) return null;
      if (!Number.isInteger(tci) || !Number.isInteger(fragility)) return null;
      if (tci < 0 || tci > 100 || fragility < 0 || fragility > 100) return null;
      metrics.push({ rosterId, tci, fragility });
    }
  }
  if (metrics.length > MAX_TRACKED_ROSTERS) return null;
  return { seenAt, metrics };
}
function clampIndex(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}
/**
 * Diff the league against a marker. Pure, total, and deterministic: every sort below is
 * fully tie-broken so two runs over the same corpus produce byte-identical output.
 */
export function buildDigest(h, input) {
  const { marker, now, metrics, pickResolutions } = input;
  const me = h.me.rosterId;
  if (marker == null) {
    return {
      state: "first-visit",
      seenAt: null,
      now,
      sinceLabel: null,
      trades: [],
      picks: [],
      moves: [],
      totals: { trades: 0, picks: 0, moves: 0 },
      metricsTracked: false,
      nextMetrics: metrics,
    };
  }
  const seenAt = marker.seenAt;
  const trades = h.transactions
    .filter((t) => t.type === "trade" && t.created > seenAt)
    .map((t) => {
      const mine = me != null && t.rosterIds.includes(me);
      return {
        transactionId: t.transactionId,
        created: t.created,
        season: t.season,
        week: t.week,
        // The ledger's own voice: second person when the viewer was a party to it.
        description:
          mine && me != null
            ? `You ${describeTradeForRoster(h, t, me)}`
            : describeTransaction(h, t),
        mine,
      };
    })
    .sort(
      (a, b) =>
        b.created - a.created || a.transactionId.localeCompare(b.transactionId),
    );
  const picks = pickResolutions
    .filter((p) => p.resolvedAt > seenAt)
    .map((p) => ({ ...p, mine: me != null && p.ownerRoster === me }))
    .sort(
      (a, b) =>
        b.resolvedAt - a.resolvedAt ||
        Number(b.mine) - Number(a.mine) ||
        a.key.localeCompare(b.key),
    );
  const previous = new Map(marker.metrics.map((r) => [r.rosterId, r]));
  const moves = [];
  for (const row of metrics) {
    const before = previous.get(row.rosterId);
    if (!before) continue; // A roster with no baseline has not "moved", it has appeared.
    const mine = me != null && row.rosterId === me;
    const name = rosterName(h, row.rosterId);
    for (const metric of ["tci", "fragility"]) {
      const threshold =
        metric === "tci" ? TCI_MOVE_THRESHOLD : FRAGILITY_MOVE_THRESHOLD;
      const from = before[metric];
      const to = row[metric];
      const delta = to - from;
      if (Math.abs(delta) < threshold) continue;
      moves.push({
        rosterId: row.rosterId,
        name,
        metric,
        from,
        to,
        delta,
        mine,
      });
    }
  }
  // The viewer's own roster leads, then the largest shifts anywhere in the league.
  moves.sort(
    (a, b) =>
      Number(b.mine) - Number(a.mine) ||
      Math.abs(b.delta) - Math.abs(a.delta) ||
      a.rosterId - b.rosterId ||
      a.metric.localeCompare(b.metric),
  );
  const totals = {
    trades: trades.length,
    picks: picks.length,
    moves: moves.length,
  };
  const anything = totals.trades + totals.picks + totals.moves > 0;
  return {
    state: anything ? "changes" : "quiet",
    seenAt,
    now,
    sinceLabel: formatSince(seenAt, now),
    trades: trades.slice(0, MAX_TRADES),
    picks: picks.slice(0, MAX_PICKS),
    moves: moves.slice(0, MAX_MOVES),
    totals,
    metricsTracked: marker.metrics.length > 0,
    nextMetrics: metrics,
  };
}
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/**
 * Coarse elapsed-time phrase. Hand-rolled to the same granularity the panel actually
 * needs, which keeps the string stable between the server render and the client one.
 */
export function formatSince(from, to) {
  const ms = to - from;
  if (ms < 2 * MINUTE) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} minutes ago`;
  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  }
  const days = Math.floor(ms / DAY);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "a month ago" : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years <= 1 ? "over a year ago" : `${years} years ago`;
}
// ------------------------------------------------------------------ corpus reads
/** Current TCI + fragility for every roster, in the exact shape the marker stores. */
export function currentMetrics(h) {
  const tciBy = new Map(leagueTimelines(h).map((t) => [t.rosterId, t.tci]));
  const fragBy = new Map(
    leagueFragility(h).map((f) => [f.rosterId, f.fragility]),
  );
  return h.rosters
    .map((r) => ({
      rosterId: r.rosterId,
      tci: clampIndex(tciBy.get(r.rosterId) ?? 0),
      fragility: clampIndex(fragBy.get(r.rosterId) ?? 0),
    }))
    .sort((a, b) => a.rosterId - b.rosterId);
}
/** A draft dates every pick it resolved; `created` covers a draft that never scheduled. */
function draftTimeOf(index, season) {
  const draft = index.bySeason.get(season)?.draft;
  const at = draft?.startTime ?? draft?.created ?? null;
  return at != null && Number.isFinite(at) && at > 0 ? at : null;
}
/**
 * Picks that became players, restricted to picks that changed hands.
 *
 * A pick that never moved resolving into a player is just a draft happening; the story
 * worth surfacing here is the one the drafts surface already tells, which is what a
 * TRADED pick turned into. Degrades to an empty list on any provider without drafts.
 */
export async function resolvedPickTimeline(h) {
  let index;
  try {
    index = await buildDraftIndex(h);
  } catch {
    return []; // Drafts are an optional provider capability, never a hard dependency.
  }
  if (!index.supported) return [];
  const lineages = await getTradedPickLineages(h, { index });
  const out = [];
  for (const l of lineages) {
    if (!l.resolved || !l.playerName) continue;
    const resolvedAt = draftTimeOf(index, l.season);
    if (resolvedAt == null) continue;
    const ownerRoster = l.usedByRoster ?? l.currentOwnerRoster;
    out.push({
      key: `${l.season}|${l.round}|${l.originalRoster}`,
      label: l.label,
      playerName: l.playerName,
      // Carried through because `/recap` renders a `PlayerAvatar` for each of these
      // rows, and an avatar with no id can only ever be a monogram. The lineage has
      // both fields already (`playerFields`, lib/lineage/index.js) and this projection
      // was dropping them, so with photos on that list was a column of initials by
      // construction rather than by anybody's decision (D90).
      playerId: l.playerId,
      team: l.team,
      position: l.position,
      ownerRoster,
      ownerName: l.usedByName ?? l.currentOwnerName,
      season: l.season,
      resolvedAt,
    });
  }
  return out;
}
/** Read the marker from the request cookies. Null outside a request scope (e.g. tests). */
export async function readMarker() {
  try {
    const { readMarkerIdentity } = await import("../auth/server.js");
    const { cookies } = await import("next/headers");
    const name = digestCookieName(await readMarkerIdentity());
    return parseMarker((await cookies()).get(name)?.value);
  } catch {
    return null;
  }
}
/**
 * Assemble the digest for the current request.
 *
 * A first visit deliberately skips `resolvedPickTimeline` entirely: with no marker there
 * is nothing to diff, so paying for the draft index (a network read) would buy a panel
 * that already knows it has nothing to say.
 */
export async function loadDigest(h, opts = {}) {
  const now = opts.now ?? Date.now();
  const marker = await readMarker();
  const metrics = currentMetrics(h);
  const pickResolutions = marker ? await resolvedPickTimeline(h) : [];
  return buildDigest(h, { marker, now, metrics, pickResolutions });
}
