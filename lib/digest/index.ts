/**
 * THE "SINCE YOUR LAST VISIT" DIGEST.
 *
 * Two of the three things this panel reports can be diffed from the corpus alone,
 * because the corpus carries real timestamps: trades have `created`, and a draft has a
 * `startTime` that dates every pick it resolved. Those work retroactively against any
 * last-seen marker, however old.
 *
 * The third cannot. TCI and fragility are derived from the CURRENT roster snapshot, and
 * the provider exposes no historical rosters, so there is no past value to recompute.
 * Rewinding transactions to rebuild a roster as of an arbitrary date was the alternative
 * considered and rejected: pick components of commissioner-executed trades are already
 * known to be unrecoverable (see the coalesce note in lib/history.ts), so a rewound
 * roster would be quietly wrong, and a quietly wrong number is worse than an absent one.
 * Instead the marker CARRIES a snapshot of both indices, and movement is the difference
 * between the snapshot and now. The cost of that choice is honest and bounded: on the
 * first visit that writes a snapshot there is nothing to compare against, and the panel
 * says so out loud (`metricsTracked: false`) rather than rendering a zero.
 *
 * Everything above `loadDigest` is pure and has no request scope, which is what the
 * tests exercise.
 */
import type { LeagueHistory } from "../history";
import {
  describeTradeForRoster,
  describeTransaction,
  rosterName,
} from "../derive/describe";
import { leagueTimelines } from "../metrics/duration";
import { leagueFragility } from "../metrics/fragility";
import { buildDraftIndex, getTradedPickLineages, type DraftIndex } from "../lineage";

/** Mirrors the `parquet_roster` cookie convention: readable, non-httpOnly, one year. */
export const DIGEST_COOKIE = "parquet_digest_seen";

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

export interface MetricRow {
  rosterId: number;
  /** Timeline coherence, 0..100. Higher = the roster agrees with itself about when it wins. */
  tci: number;
  /** Fragility, 0..100. HIGHER = MORE FRAGILE, matching lib/metrics/fragility.ts. */
  fragility: number;
}

export interface DigestMarker {
  /** ms epoch of the visit that wrote this marker. */
  seenAt: number;
  metrics: MetricRow[];
}

// ------------------------------------------------------------------ marker codec

const MARKER_VERSION = "v1";

/**
 * Encoded with `.`, `~` and `:` only. All three are legal cookie-value octets, so the
 * marker survives a round trip without depending on any layer's percent-encoding, and a
 * version prefix means a future shape change expires old markers instead of misreading
 * them.
 */
export function encodeMarker(marker: DigestMarker): string {
  const rows = marker.metrics
    .slice(0, MAX_TRACKED_ROSTERS)
    .map((r) => `${r.rosterId}:${clampIndex(r.tci)}:${clampIndex(r.fragility)}`)
    .join("~");
  return `${MARKER_VERSION}.${Math.round(marker.seenAt)}.${rows}`;
}

/** Never throws. Anything unrecognised is treated as "no marker", i.e. a first visit. */
export function parseMarker(raw: string | null | undefined): DigestMarker | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== MARKER_VERSION) return null;
  const seenAt = Number(parts[1]);
  if (!Number.isInteger(seenAt) || seenAt <= 0) return null;

  const metrics: MetricRow[] = [];
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

function clampIndex(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

// ------------------------------------------------------------------ digest shape

export type DigestState = "first-visit" | "quiet" | "changes";

export interface DigestTradeItem {
  transactionId: string;
  created: number;
  season: string;
  week: number;
  /** Written from the viewer's perspective when they were in it, neutral otherwise. */
  description: string;
  mine: boolean;
}

/** A pick that became a player, dated by the draft that resolved it. */
export interface PickResolution {
  key: string;
  label: string;
  playerName: string;
  position: string | null;
  ownerRoster: number | null;
  ownerName: string;
  season: string;
  resolvedAt: number;
}

export interface DigestPickItem extends PickResolution {
  mine: boolean;
}

export type DigestMetric = "tci" | "fragility";

export interface DigestMoveItem {
  rosterId: number;
  name: string;
  metric: DigestMetric;
  from: number;
  to: number;
  /** `to - from`. Read direction off `metric`: TCI up is good, fragility up is not. */
  delta: number;
  mine: boolean;
}

export interface Digest {
  state: DigestState;
  /** ms epoch of the previous visit, or null on a first visit. */
  seenAt: number | null;
  now: number;
  /** Rendered server-side so the client never formats a time and never rehydrates one. */
  sinceLabel: string | null;
  trades: DigestTradeItem[];
  picks: DigestPickItem[];
  moves: DigestMoveItem[];
  /** Pre-cap counts, for honest overflow copy. */
  totals: { trades: number; picks: number; moves: number };
  /** False until a marker with a snapshot exists: movement has no baseline yet. */
  metricsTracked: boolean;
  /** The snapshot the client posts back to advance the marker. */
  nextMetrics: MetricRow[];
}

export interface DigestInput {
  marker: DigestMarker | null;
  now: number;
  /** Current indices for every roster. */
  metrics: MetricRow[];
  pickResolutions: PickResolution[];
}

/**
 * Diff the league against a marker. Pure, total, and deterministic: every sort below is
 * fully tie-broken so two runs over the same corpus produce byte-identical output.
 */
export function buildDigest(h: LeagueHistory, input: DigestInput): Digest {
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

  const trades: DigestTradeItem[] = h.transactions
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

  const picks: DigestPickItem[] = pickResolutions
    .filter((p) => p.resolvedAt > seenAt)
    .map((p) => ({ ...p, mine: me != null && p.ownerRoster === me }))
    .sort(
      (a, b) =>
        b.resolvedAt - a.resolvedAt ||
        Number(b.mine) - Number(a.mine) ||
        a.key.localeCompare(b.key),
    );

  const previous = new Map(marker.metrics.map((r) => [r.rosterId, r]));
  const moves: DigestMoveItem[] = [];
  for (const row of metrics) {
    const before = previous.get(row.rosterId);
    if (!before) continue; // A roster with no baseline has not "moved", it has appeared.
    const mine = me != null && row.rosterId === me;
    const name = rosterName(h, row.rosterId);
    for (const metric of ["tci", "fragility"] as const) {
      const threshold =
        metric === "tci" ? TCI_MOVE_THRESHOLD : FRAGILITY_MOVE_THRESHOLD;
      const from = before[metric];
      const to = row[metric];
      const delta = to - from;
      if (Math.abs(delta) < threshold) continue;
      moves.push({ rosterId: row.rosterId, name, metric, from, to, delta, mine });
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
export function formatSince(from: number, to: number): string {
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
export function currentMetrics(h: LeagueHistory): MetricRow[] {
  const tciBy = new Map(leagueTimelines(h).map((t) => [t.rosterId, t.tci]));
  const fragBy = new Map(leagueFragility(h).map((f) => [f.rosterId, f.fragility]));
  return h.rosters
    .map((r) => ({
      rosterId: r.rosterId,
      tci: clampIndex(tciBy.get(r.rosterId) ?? 0),
      fragility: clampIndex(fragBy.get(r.rosterId) ?? 0),
    }))
    .sort((a, b) => a.rosterId - b.rosterId);
}

/** A draft dates every pick it resolved; `created` covers a draft that never scheduled. */
function draftTimeOf(index: DraftIndex, season: string): number | null {
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
export async function resolvedPickTimeline(
  h: LeagueHistory,
): Promise<PickResolution[]> {
  let index: DraftIndex;
  try {
    index = await buildDraftIndex(h);
  } catch {
    return []; // Drafts are an optional provider capability, never a hard dependency.
  }
  if (!index.supported) return [];

  const lineages = await getTradedPickLineages(h, { index });
  const out: PickResolution[] = [];
  for (const l of lineages) {
    if (!l.resolved || !l.playerName) continue;
    const resolvedAt = draftTimeOf(index, l.season);
    if (resolvedAt == null) continue;
    const ownerRoster = l.usedByRoster ?? l.currentOwnerRoster;
    out.push({
      key: `${l.season}|${l.round}|${l.originalRoster}`,
      label: l.label,
      playerName: l.playerName,
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
export async function readMarker(): Promise<DigestMarker | null> {
  try {
    const { cookies } = await import("next/headers");
    return parseMarker((await cookies()).get(DIGEST_COOKIE)?.value);
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
export async function loadDigest(
  h: LeagueHistory,
  opts: { now?: number } = {},
): Promise<Digest> {
  const now = opts.now ?? Date.now();
  const marker = await readMarker();
  const metrics = currentMetrics(h);
  const pickResolutions = marker ? await resolvedPickTimeline(h) : [];
  return buildDigest(h, { marker, now, metrics, pickResolutions });
}
