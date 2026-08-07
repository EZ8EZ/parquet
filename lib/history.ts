/**
 * LeagueHistory — the single corpus object every derivation engine consumes.
 *
 * READS ARE DB-FREE. The corpus (chain, rosters, players, transactions) is read
 * live from the provider so the app runs on serverless/Vercel with no database
 * (Sleeper fetches are cached by Next's data cache). The DB is used ONLY to persist
 * user annotations, and even that is best-effort: if it's unavailable, reads still
 * work and the fixture demo seeds its own annotation in code.
 * The engines (strategy, dossier, analyst) are pure functions over this object.
 */
import {
  activeLeagueId,
  defaultUsername,
  getLeagueProvider,
  providerName,
} from "./providers";
import type {
  BracketGame,
  LeagueDetail,
  LeagueProvider,
  LeagueUser,
  Matchup,
  Player,
  Roster,
  TradedPick,
  Transaction,
} from "./providers/types";
import {
  assembleChain,
  collectTradedPicks,
  collectTransactions,
} from "./ingest";
import { coalesceCommissionerTrades } from "./derive/coalesce";
import { readSeat, viewAuthorId } from "./auth/server";
import { timed } from "./timing";

export interface Annotation {
  transactionId: string;
  /**
   * Durable author identity — a Sleeper platform user id, i.e. a PRINCIPAL's
   * ownerId (D22), never a roster id. Roster ids get reassigned between seasons on
   * a handover; ownerId does not. This is what makes it possible to tell one
   * trade participant's captured reasoning apart from the other's — they share a
   * transactionId, but never an ownerId.
   */
  ownerId: string;
  reasoning: string;
  posture: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The annotations map is keyed by (transactionId, ownerId), NOT by transactionId
 * alone — a trade has two sides sharing one transactionId, and each side's
 * reasoning (if either bothered to write any) is independent. Every reader MUST
 * go through this key (or `myAnnotation` below) rather than `Map#get(transactionId)`
 * directly, or it will silently resolve to whichever author happens to be in the
 * map — possibly not the viewer at all.
 */
export function annotationKey(transactionId: string, ownerId: string): string {
  return `${transactionId}::${ownerId}`;
}

/**
 * Whose private authorship this request holds - the identity `myAnnotation` reads
 * against, and the one every downstream engine (ledger, strategy, analyst, recap)
 * inherits by going through it.
 *
 * `undefined` means "not resolved by an identity layer", which is a hand-built
 * corpus: a test fixture, a script. Those get the legacy answer, the lens, so
 * `buildFixtureHistory` and every test spread from it keep behaving exactly as they
 * did before seats existed. `null` is the OTHER thing entirely - an identity layer
 * ran and concluded this view holds no private authorship at all (see
 * `viewAuthorId` in lib/auth/seat.ts) - and it must not collapse back to the lens,
 * which is precisely the bug the seat exists to fix.
 */
export function viewerAuthorId(h: LeagueHistory): string | null {
  return h.authorId === undefined ? h.me.userId : h.authorId;
}

/** The VIEWER's own annotation for a transaction, or null. The one sanctioned way
 *  to answer "did I annotate this" — never `h.annotations.get(transactionId)`. */
export function myAnnotation(h: LeagueHistory, transactionId: string): Annotation | null {
  const author = viewerAuthorId(h);
  if (!author) return null;
  return h.annotations.get(annotationKey(transactionId, author)) ?? null;
}

/** Matchup tagged with its season (the domain Matchup carries only week). */
export type HistoryMatchup = Matchup & { season: string };

export interface Me {
  userId: string;
  rosterId: number | null;
  displayName: string;
  teamName: string | null;
}

export interface LeagueHistory {
  provider: string;
  currentLeague: LeagueDetail;
  chain: LeagueDetail[]; // oldest -> newest
  users: LeagueUser[];
  usersById: Map<string, LeagueUser>;
  rostersById: Map<number, Roster>;
  rosters: Roster[];
  players: Map<string, Player>;
  transactions: Transaction[]; // chronological asc
  /** Current-league snapshot: who owns which future pick right now. */
  tradedPicks: TradedPick[];
  /** Pick movement across every season in the chain (incl. historical hops). */
  tradedPicksHistory: TradedPick[];
  matchups: HistoryMatchup[];
  /**
   * Winners bracket per season, for every season in the chain that has one.
   *
   * Lives on the corpus rather than behind its own loader because `strengthRanks` (a
   * synchronous function reached from half the app) needs it: draft order is set by
   * the last completed season's FINAL standings, and the bracket is the only place
   * those exist. Costs one request per season on the cold path.
   */
  brackets: Map<string, BracketGame[]>;
  /**
   * Keyed by `annotationKey(transactionId, ownerId)`, not by transactionId alone —
   * see `annotationKey` for why. Every author's rows across the whole league live
   * in this one map (it's on the identity-independent corpus, shared across every
   * "viewing as" team), so a reader that skips the ownerId half of the key will
   * see every manager's private reasoning, not just the viewer's.
   */
  annotations: Map<string, Annotation>;
  /**
   * The LENS: whose public data this render is about. Set from the `parquet_roster`
   * cookie, freely switchable, and derived entirely from data every manager in the
   * league can already see. Not an authorization of any kind - see `authorId`.
   */
  me: Me;
  /**
   * The SEAT, resolved: whose PRIVATE authorship this request may read and edit.
   * See `viewerAuthorId` above for what the three states mean, and lib/auth/seat.ts
   * for why this is a separate question from `me`.
   */
  authorId?: string | null;
  currentSeasonYear: number;
}

/**
 * Fixture-only seed annotation so the revealed-vs-stated demo works with no DB and
 * no seed script (the 2022 rebuild statement that the 2025 pivot contradicts).
 * Authored by "u1" — the fixture's own EZ8 seat (see providers/fixture/generate.ts).
 */
const FIXTURE_SEED_ANNOTATIONS: Annotation[] = [
  {
    transactionId: "fx-2022-rebuildA",
    ownerId: "u1",
    reasoning:
      "Full rebuild. I'm getting younger and stockpiling first-round picks. " +
      "Not chasing wins for the next 2-3 years - the goal is a young core that " +
      "peaks together. Moving every veteran who isn't part of the future.",
    posture: "rebuild",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
];

/** Best-effort annotation load: DB if reachable, else empty; + fixture seed. */
async function loadAnnotations(providerNm: string): Promise<Map<string, Annotation>> {
  const map = new Map<string, Annotation>();
  if (providerNm === "fixture") {
    for (const a of FIXTURE_SEED_ANNOTATIONS) {
      map.set(annotationKey(a.transactionId, a.ownerId), a);
    }
  }
  try {
    const { prisma } = await import("./db");
    const rows = await prisma.annotation.findMany();
    for (const a of rows) {
      map.set(annotationKey(a.transactionId, a.ownerId), {
        transactionId: a.transactionId,
        ownerId: a.ownerId,
        reasoning: a.reasoning,
        posture: a.posture,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      });
    }
  } catch (err) {
    // DB not configured/reachable (e.g. Vercel without Postgres) — reads still work.
    //
    // The DEGRADATION stays (D18: the database is optional and no read may hard-fail
    // on it), but it no longer happens in silence. An empty annotations map on a
    // configured-but-broken database renders as "you have captured nothing", which is
    // the read-side twin of the write bug that lost a note in production: it invites
    // someone to retype reasoning the app merely failed to fetch.
    const { databaseConfigured, describeDbError } = await import("./db");
    if (databaseConfigured()) {
      const failure = describeDbError(err);
      console.error(
        `[annotations] LOAD FAILED against a configured database - the ledger will render as empty (code=${failure.code ?? "none"}): ${failure.message}`,
      );
    }
  }
  return map;
}

/**
 * Weekly matchups across the chain.
 *
 * DELIBERATELY FIXTURE-ONLY. Matchups exist solely to power the "trades after a
 * loss" (tilt) signal, and loading them live costs ~110 requests and roughly 15s of
 * cold-start latency. Measured on the real league it does work (1232 matchups, 4
 * managers flagged), but the owner judged that read not worth answering, so we don't
 * pay for it. Dossiers degrade cleanly: `afterLoss` is simply null and the tag never
 * fires. Flip this to load for all providers if the signal is ever wanted back.
 */
async function loadMatchups(chain: LeagueDetail[]): Promise<HistoryMatchup[]> {
  if (providerName() !== "fixture") return [];
  const provider = getLeagueProvider();
  const out: HistoryMatchup[] = [];
  for (const league of chain) {
    for (let w = 1; w <= 22; w++) {
      const ms = await provider.getMatchups(league.leagueId, w);
      for (const m of ms) out.push({ ...m, week: w, season: league.season });
    }
  }
  return out;
}

/**
 * Winners brackets across the chain.
 *
 * Unlike matchups (deliberately fixture-only - see above), this is cheap: ONE request
 * per season, not one per week, and it answers the single question a dynasty league
 * cares most about. Every failure mode degrades to "no bracket for that season":
 * providers without the method (CSV), seasons whose playoffs have not been generated,
 * and a rate-limited response that comes back `null` rather than an array.
 */
async function loadBrackets(
  provider: LeagueProvider,
  chain: LeagueDetail[],
): Promise<Map<string, BracketGame[]>> {
  const out = new Map<string, BracketGame[]>();
  if (!provider.getBracket) return out;
  const results = await Promise.all(
    chain.map(async (league) => {
      try {
        return {
          season: league.season,
          games: await provider.getBracket!(league.leagueId, "winners"),
        };
      } catch {
        return { season: league.season, games: [] as BracketGame[] };
      }
    }),
  );
  for (const r of results) if (r.games.length) out.set(r.season, r.games);
  return out;
}

function resolveMe(
  meUserId: string,
  users: LeagueUser[],
  rosters: Roster[],
): Me {
  const user = users.find((u) => u.userId === meUserId) ?? users[0];
  const roster = rosters.find((r) => r.ownerId === user?.userId);
  return {
    userId: user?.userId ?? meUserId,
    rosterId: roster?.rosterId ?? null,
    displayName: user?.displayName ?? "You",
    teamName: user?.teamName ?? null,
  };
}

/** The heavy, identity-independent corpus (shared across all "viewing as" teams). */
type Corpus = Omit<LeagueHistory, "me"> & { defaultMeUserId: string };

// Longer TTL because the Sleeper corpus assembly is many (cached) fetches.
const CORPUS_TTL_MS = 5 * 60_000;

/**
 * Single-flight corpus slot. Stores the IN-FLIGHT PROMISE, not the resolved value —
 * measured on the real league, 5 concurrent `getLeagueHistory()` calls issued after an
 * invalidate produced 725 Sleeper requests (5x the ~145-request cost of one assembly),
 * because the previous version only cached the resolved value and had no way to dedupe
 * callers that arrived while an assembly was still in flight. Shape mirrors
 * `ensureIngested()` in lib/ingest.ts.
 *
 * `resolvedAt` is only set once the promise settles, which is what makes the two
 * concerns (dedupe vs. staleness) independent: a caller that arrives while assembly is
 * still in flight always joins it (there is no "stale in-flight promise" — only a
 * resolved one can go stale), and the 5-minute TTL is anchored to completion time
 * exactly as it was before this change, once the slot has something to be stale.
 */
interface CorpusSlot {
  promise: Promise<Corpus>;
  resolvedAt?: number;
}
let corpusSlot: CorpusSlot | null = null;

async function assembleCorpus(): Promise<Corpus> {
  const provider = getLeagueProvider();
  const leagueId = activeLeagueId();

  const [currentLeague, users, rosters, tradedPicks, playerList] = await Promise.all([
    provider.getLeague(leagueId),
    provider.getUsers(leagueId),
    provider.getRosters(leagueId),
    provider.getTradedPicks(leagueId),
    provider.getPlayers(),
  ]);
  const players = new Map<string, Player>(playerList.map((p) => [p.playerId, p]));
  const chain = await assembleChain(provider, leagueId);

  const rawTransactions = await collectTransactions(provider, chain);
  // Pick movement across ALL seasons (the current league only knows future picks).
  const tradedPicksHistory = await collectTradedPicks(provider, chain);
  // Rebuild commissioner-executed (often multi-team) trades into single trades.
  //
  // We deliberately do NOT try to attach the pick component that commissioner rows
  // drop (their `draft_picks` is always empty - see API_NOTES). The traded-picks
  // snapshot has no timestamps, so the only available signal is "both parties to
  // this pick hop are also in this trade" - which, tested against the real league,
  // blamed six unrelated hops spanning three seasons on a single 2023 deal. Guessing
  // trade contents is worse than admitting the data is gone, so unattributable hops
  // are surfaced separately via `unrecordedPickMoves()` in lib/picks.ts instead.
  const { transactions } = coalesceCommissionerTrades(rawTransactions);
  const annotations = await loadAnnotations(provider.name);
  const matchups = await loadMatchups(chain);
  const brackets = await loadBrackets(provider, chain);

  // Default "me" identity from the configured username (fixture=EZ8; sleeper env).
  const username = defaultUsername();
  let defaultMeUserId = users[0]?.userId ?? "";
  try {
    defaultMeUserId = (await provider.getUser(username)).userId;
  } catch {
    // fall back to first user
  }

  const value: Corpus = {
    provider: provider.name,
    currentLeague,
    chain,
    users,
    usersById: new Map(users.map((u) => [u.userId, u])),
    rosters,
    rostersById: new Map(rosters.map((r) => [r.rosterId, r])),
    players,
    transactions,
    tradedPicks,
    tradedPicksHistory,
    matchups,
    brackets,
    annotations,
    currentSeasonYear: parseInt(currentLeague.season, 10),
    defaultMeUserId,
  };
  return value;
}

async function getCorpus(fresh = false): Promise<Corpus> {
  if (!fresh && corpusSlot) {
    // Still assembling: nothing to expire yet, so every concurrent caller joins the
    // one assembly already in flight rather than starting its own.
    if (corpusSlot.resolvedAt === undefined) return corpusSlot.promise;
    // Already resolved: honor the TTL exactly as before, anchored to completion time.
    if (Date.now() - corpusSlot.resolvedAt < CORPUS_TTL_MS) return corpusSlot.promise;
  }
  const slot: CorpusSlot = {} as CorpusSlot;
  slot.promise = timed("corpus assembly", assembleCorpus)
    .then((value) => {
      slot.resolvedAt = Date.now();
      return value;
    })
    .catch((err) => {
      // CRITICAL: clear the slot on rejection so a transient Sleeper failure does not
      // permanently pin a rejected promise for the rest of the TTL window — the next
      // caller gets a fresh attempt instead of an immediately-rethrown error forever.
      // Guard against a newer slot already having replaced this one (e.g. a `fresh`
      // call raced ahead of this rejection).
      if (corpusSlot === slot) corpusSlot = null;
      throw err;
    });
  corpusSlot = slot;
  return slot.promise;
}

/** Read the "viewing as" roster from the cookie (request scope only). */
async function readSelectedRosterId(): Promise<number | null> {
  try {
    const { cookies } = await import("next/headers");
    const raw = (await cookies()).get("parquet_roster")?.value;
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null; // not in a request scope (e.g. tests)
  }
}

export async function getLeagueHistory(
  opts: { fresh?: boolean; meRosterId?: number } = {},
): Promise<LeagueHistory> {
  const corpus = await getCorpus(opts.fresh);
  const selected =
    opts.meRosterId ?? (await readSelectedRosterId());

  let me: Me;
  if (selected != null && corpus.rostersById.has(selected)) {
    const r = corpus.rostersById.get(selected)!;
    const user = r.ownerId ? corpus.usersById.get(r.ownerId) : undefined;
    me = {
      userId: user?.userId ?? r.ownerId ?? "",
      rosterId: selected,
      displayName: user?.displayName ?? `Roster ${selected}`,
      teamName: user?.teamName ?? null,
    };
  } else {
    me = resolveMe(corpus.defaultMeUserId, corpus.users, corpus.rosters);
  }

  // The lens is settled; now the seat. In legacy mode (no AUTH_SECRET) this reduces
  // to `me.userId` and nothing downstream can tell the difference, which is the
  // whole backward-compatibility contract.
  const seat = await readSeat();
  const authorId = viewAuthorId(seat, me.userId);

  const { defaultMeUserId: _drop, ...rest } = corpus;
  void _drop;
  return { ...rest, me, authorId };
}

/** Invalidate the in-process corpus cache. Test hook, and the last resort for a
 *  writer that genuinely changed something the corpus derives from Sleeper. */
export function invalidateHistory(): void {
  corpusSlot = null;
}

/**
 * Publish one just-written annotation into the cached corpus, so the writer sees their
 * own note on the very next read WITHOUT the corpus being thrown away.
 *
 * WHY THIS EXISTS. `/api/annotations` used to call `invalidateHistory()` after a
 * successful upsert, which threw away the whole corpus to publish one row: the next read
 * paid a full cold start - ~145 Sleeper requests and the 1.4s D25 calls a budget to
 * protect - plus a freshly minted `players` Map, which misses lib/valuation's WeakMap
 * and revalues every player in the league. A one-key write should not cost a league.
 * Annotations are the ONLY thing in the corpus that this process writes; everything else
 * it holds comes from Sleeper and is stale on a clock, not on our own writes. So the
 * write is applied to the cached copy directly and the TTL is left to do the job it was
 * always doing.
 *
 * WHAT IT DOES NOT REACH, MEASURED RATHER THAN ASSUMED. Next compiles route handlers
 * and server components in different layers, and this module is instantiated ONCE PER
 * LAYER: probed on the running dev server, `/api/annotations` and a page rendering the
 * same import reported different module instances, so the route handler's corpus and
 * the page's corpus are two separate caches. `invalidateHistory()` from this route
 * therefore never reached a reader's corpus either - a page render caught up on the
 * five-minute TTL, and the writer saw their own note immediately because `LedgerItem`
 * holds the text in React state, not because the server had it. That is a real and
 * separate defect (a capture is not durably visible to the reader's corpus for up to
 * five minutes) and it is NOT what this function claims to fix; what changes here is
 * that the write stops costing a reassembly to accomplish nothing. Within one layer -
 * which is what the tests exercise and what a single module registry gives you - the
 * publication is exact.
 *
 * WHY IN-PLACE MUTATION IS SAFE HERE, specifically:
 *
 *  - IDENTITY IS PRESERVED, WHICH IS THE POINT. `getLeagueHistory` shallow-spreads the
 *    corpus, so `h.annotations` IS this Map for every request served from this corpus,
 *    and `h.players` is untouched. lib/valuation's `valuesByCorpus` WeakMap keys on
 *    `h.players`, so it keeps its hit - the whole saving this change is after.
 *  - THE MUTATION IS ADDITIVE AND SCOPED TO ONE KEY. Every reader in the app reaches
 *    annotations through `myAnnotation`, a keyed lookup by (transactionId, ownerId) with
 *    no memoization behind it; nothing derives a cached aggregate from this Map that a
 *    new key could invalidate. The worst a concurrent in-flight render can observe is
 *    the writer's own note arriving a few milliseconds early, which is the behaviour the
 *    invalidation existed to produce.
 *  - THE RACE WITH A CONCURRENT ASSEMBLY CANNOT LOSE THE ROW, because the slot is read
 *    and awaited HERE rather than captured by the caller. Whatever corpus the current
 *    slot resolves to is the one mutated. An assembly that started before the database
 *    commit and therefore missed the row is still the slot we await and set into; an
 *    assembly that starts after the commit reads the row from the database itself. In
 *    both directions the next reader sees the note.
 *  - NO CACHED CORPUS AT ALL is not a failure. The next read assembles one and
 *    `loadAnnotations` reads the row it was just handed.
 *
 * Caller contract: only ever call this with a row the database ACCEPTED. Publishing an
 * unsaved note into the cache would show the writer a note that vanishes on the next
 * TTL expiry, which is the lie D36 exists to prevent, wearing a different hat.
 */
export async function publishAnnotation(a: Annotation): Promise<void> {
  const slot = corpusSlot;
  if (!slot) return;
  try {
    const corpus = await slot.promise;
    corpus.annotations.set(annotationKey(a.transactionId, a.ownerId), a);
  } catch {
    // A failed assembly clears its own slot (see getCorpus); there is nothing to
    // publish into, and the next read will assemble and load this row from the DB.
  }
}
