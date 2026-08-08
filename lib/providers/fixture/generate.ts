/**
 * Deterministic synthetic-corpus generator for the FixtureProvider.
 *
 * Produces five seasons (2022–2026) of a 14-team dynasty league with a COHERENT
 * narrative, so the differentiated features have real signal to surface:
 *
 *  - "You" (roster 1) follow a scripted arc: a 2022–2023 rebuild (sell vets for
 *    youth + picks) then a 2025 WIN-NOW PIVOT (spend two firsts on a 33-year-old).
 *    That deliberate contradiction is what the revealed-vs-stated engine and the
 *    adversarial analyst are built to catch.
 *  - Each other manager has a behavioral archetype (churner, hoarder, ghost,
 *    panic-seller, name-chaser, streamer, balanced) so the dossiers differ.
 *
 * Everything is seeded — same output every run, so tests are stable.
 */
import type {
  BracketGame,
  DraftMeta,
  DraftPick,
  DraftPickRef,
  LeagueDetail,
  LeagueUser,
  Matchup,
  Player,
  Roster,
  TradedPick,
  Transaction,
  User,
} from "../types";
import { CURATED, MANAGERS, fillerPlayers, type Archetype } from "./data";

export const SEASONS = ["2022", "2023", "2024", "2025", "2026"] as const;
export type Season = (typeof SEASONS)[number];
export const CURRENT_SEASON: Season = "2026";
const N_TEAMS = 14;
const ROSTER_SLOTS = 16;

export const SCORING_SETTINGS: Record<string, number> = {
  pts: 0.5, reb: 1, ast: 1, stl: 2, blk: 2, to: -1, tpm: 0.5,
  dd: 1, td: 2, bonus_pt_40p: 2, bonus_pt_50p: 2, ff: -2, tf: -2,
};
export const ROSTER_POSITIONS = [
  "PG", "SG", "SF", "PF", "C", "UTIL", "UTIL",
  "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN",
];

export function leagueIdFor(season: string): string {
  return `fx-nba-${season}`;
}
function prevLeagueId(season: string): string | null {
  const idx = SEASONS.indexOf(season as Season);
  return idx > 0 ? leagueIdFor(SEASONS[idx - 1]) : null;
}

// ---------- Deterministic RNG ----------
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Players ----------
function buildPlayers(): { players: Player[]; rankOf: Map<string, number> } {
  const base = [
    ...CURATED,
    ...fillerPlayers(190, CURATED.length),
  ];
  const players: Player[] = [];
  const rankOf = new Map<string, number>();
  base.forEach((p, i) => {
    const playerId = `p${i + 1}`;
    const rank = i + 1;
    // age2022 = age as of the 2022 season; current age = +4 seasons to 2026.
    const age = p.age2022 + 4;
    const byear = 2026 - age;
    const [first, ...rest] = p.name.split(" ");
    rankOf.set(playerId, rank);
    players.push({
      playerId,
      fullName: p.name,
      firstName: first,
      lastName: rest.join(" "),
      team: null,
      position: p.pos,
      fantasyPositions: [p.pos],
      age,
      yearsExp: Math.max(0, age - 19),
      birthDate: `${byear}-01-01`,
      injuryStatus: null,
      injuryBodyPart: null,
      injuryNotes: null,
      depthChartOrder: null,
      status: "ACT",
      number: ((i * 3) % 55) + 1,
      searchRank: rank,
      espnId: null,
    });
  });
  return { players, rankOf };
}

/**
 * ROSTER SUCCESSION — the fixture's one team that changes hands.
 *
 * Mirrors the real league's own handover exactly (NSL roster 11: NSLKB 2022-2024,
 * kdewitt4 2025-, see lib/principals.ts's header): one seat, one cutover season,
 * everything before it belongs to the departing manager and everything from it on
 * belongs to the successor. Roster 9 was picked because its archetype ("churner",
 * `archetypeConfig`) already generates several trades a season with rotating
 * counterparties — exactly the shape needed to make "zero real deals", "22 trades for
 * someone who made 4" and "a busiest pairing blending two people" all reproducible
 * without any bespoke scripting, the same way the rest of this generator earns its
 * corpus from the archetype loop rather than hand-writing every transaction.
 *
 * `u15` is deliberately NOT one of the fourteen `MANAGERS` entries: that array is
 * walked 1:1 against `N_TEAMS` rosters everywhere else in this file (archetype,
 * waiver/trade volume, draft slot). Keeping the successor out of it means every one
 * of those loops is completely undisturbed by the handover — the only thing that
 * changes is WHO owns roster 9's seat once `SUCCESSION.cutoverSeason` arrives.
 */
export const SUCCESSION = {
  rosterId: 9,
  predecessorUserId: "u9",
  successorUserId: "u15",
  /** First season the successor holds the roster; the last the predecessor does. */
  cutoverSeason: "2025",
} as const;

// ---------- Users ----------
function buildUsers(): { users: LeagueUser[]; archetypeOf: Archetype[] } {
  const users: LeagueUser[] = MANAGERS.map((m, i) => ({
    userId: `u${i + 1}`,
    displayName: m.displayName,
    avatar: null,
    teamName: m.teamName,
    isOwner: i === 0,
    isBot: false,
  }));
  // The successor. Same seat (roster 9, "Blockbuster"), new person, new team name —
  // a real handover usually comes with a rebrand, and a fixture that kept the old
  // team name on the new owner would let a display-name bug hide behind an
  // unchanged label.
  users.push({
    userId: SUCCESSION.successorUserId,
    displayName: "kdewitt4",
    avatar: null,
    teamName: "Second Wave",
    isOwner: false,
    isBot: false,
  });
  return { users, archetypeOf: MANAGERS.map((m) => m.archetype) };
}

/** Owner of `rosterId` as of `season` — the one seat where this can differ from the
 *  static `users[rosterId - 1]` mapping. Every roster snapshot and every draft-pick
 *  attribution goes through this so the succession is expressed exactly once. */
function ownerIdForSeason(rosterId: number, season: string, users: LeagueUser[]): string {
  if (rosterId === SUCCESSION.rosterId && season >= SUCCESSION.cutoverSeason) {
    return SUCCESSION.successorUserId;
  }
  return users[rosterId - 1].userId;
}

// ---------- Corpus types ----------
interface Pick {
  season: string;
  round: number;
  originalRoster: number;
  owner: number;
}
interface GenRoster {
  rosterId: number;
  players: Set<string>;
}

export interface FixtureCorpus {
  user: User;
  users: LeagueUser[];
  players: Player[];
  leagues: Record<string, LeagueDetail>;
  rosters: Record<string, Roster[]>;
  transactions: Record<string, Transaction[]>;
  matchups: Record<string, Matchup[]>;
  tradedPicks: Record<string, TradedPick[]>;
  /** Keyed by leagueId. */
  drafts: Record<string, DraftMeta[]>;
  /** Keyed by draftId. */
  draftPicks: Record<string, DraftPick[]>;
  /** Winners bracket per leagueId. Keyed the same way rosters and matchups are. */
  brackets: Record<string, BracketGame[]>;
}

/**
 * A synthetic six-team winners bracket from the fixture's own standings.
 *
 * The fixture exists so every feature works offline, and a champion is now one of
 * those features - without this, the demo's Season Recap would have to say "no
 * champion on record" while the live league shows four.
 *
 * Deterministic, like everything else here (no randomness, house rule). Seeds come
 * from the season's real fixture standings; the higher seed advances, EXCEPT that in
 * the semi-finals of odd-indexed seasons the lower seed wins. That single documented
 * upset is what makes the demo exercise the case this feature exists for: a champion
 * who did not have the best regular-season record, and therefore should pick last
 * anyway.
 */
function buildBracket(rosters: Roster[], seasonIndex: number): BracketGame[] {
  const seeds = [...rosters]
    .sort(
      (a, b) =>
        b.settings.wins - a.settings.wins ||
        b.settings.fpts - a.settings.fpts ||
        a.rosterId - b.rosterId,
    )
    .slice(0, 6)
    .map((r) => r.rosterId);
  if (seeds.length < 6) return [];

  const [s1, s2, s3, s4, s5, s6] = seeds;
  const upset = seasonIndex % 2 === 1;
  const game = (
    matchId: number,
    round: number,
    t1: number,
    t2: number,
    winner: number,
    placement: number | null = null,
  ): BracketGame => ({
    matchId,
    round,
    placement,
    team1: t1,
    team2: t2,
    winner,
    loser: winner === t1 ? t2 : t1,
  });

  // Round 1: seeds 1 and 2 have byes.
  const g1 = game(1, 1, s3, s6, s3);
  const g2 = game(2, 1, s4, s5, s4);
  // Semi-finals: the documented upset flips these, and only these.
  const g3 = game(3, 2, s1, g2.winner!, upset ? g2.winner! : s1);
  const g4 = game(4, 2, s2, g1.winner!, upset ? g1.winner! : s2);
  // Final and third-place game.
  const g5 = game(5, 3, g3.winner!, g4.winner!, g3.winner!, 1);
  const g6 = game(6, 3, g3.loser!, g4.loser!, g3.loser!, 3);
  return [g1, g2, g3, g4, g5, g6];
}

/**
 * Seasons that get a rookie draft. Matches the pick ledger (which starts at 2023),
 * so every traded pick in the fixture is traceable. 2022 was the startup, which in
 * this narrative predates the ledger and has nothing to trace.
 */
const DRAFT_SEASONS = ["2023", "2024", "2025", "2026"] as const;
const DRAFT_ROUNDS = 3;
export function draftIdFor(season: string): string {
  return `fx-draft-${season}`;
}

// ---------- Generator ----------
export function generateCorpus(): FixtureCorpus {
  const rng = mulberry32(88); // "EZ8"
  const { players, rankOf } = buildPlayers();
  const { users, archetypeOf } = buildUsers();
  const playerVal = (pid: string) => Math.max(1, 320 - (rankOf.get(pid) ?? 300));

  // Snake draft top 224 players across 14 teams.
  const rosters: GenRoster[] = Array.from({ length: N_TEAMS }, (_, i) => ({
    rosterId: i + 1,
    players: new Set<string>(),
  }));
  const ordered = [...players].sort(
    (a, b) => (a.searchRank ?? 999) - (b.searchRank ?? 999),
  );
  let di = 0;
  for (let round = 0; round < ROSTER_SLOTS; round++) {
    const order = round % 2 === 0 ? [...rosters] : [...rosters].reverse();
    for (const r of order) {
      if (di < ordered.length) r.players.add(ordered[di++].playerId);
    }
  }
  const rosterOf = new Map<string, number>();
  rosters.forEach((r) => r.players.forEach((p) => rosterOf.set(p, r.rosterId)));
  const freeAgents = new Set<string>(
    ordered.slice(di).map((p) => p.playerId),
  );

  // Helper: id -> player by name (for scripting).
  const idByName = new Map<string, string>();
  players.forEach((p) => idByName.set(p.fullName, p.playerId));
  const pid = (name: string) => {
    const id = idByName.get(name);
    if (!id) throw new Error(`fixture: unknown player ${name}`);
    return id;
  };

  // Scripted assets are protected from waiver drops and archetype trades so the
  // narrative trades below are always valid. (Scripted recordTrade moves them
  // directly regardless.)
  const protectedSet = new Set<string>(
    [
      "Damian Lillard", "Chris Paul", "Cam Thomas",
      "Scottie Barnes", "Franz Wagner", "Khris Middleton",
    ].map((n) => pid(n)),
  );
  const worstNonProtected = (roster: number, exclude?: string) =>
    [...rosters[roster - 1].players]
      .filter((p) => p !== exclude && !protectedSet.has(p))
      .sort((a, b) => (rankOf.get(b) ?? 0) - (rankOf.get(a) ?? 0))[0];

  // Force key assets onto specific rosters so scripted trades are valid.
  // Swaps a non-protected player back to keep roster sizes constant at 16.
  function place(playerId: string, target: number) {
    const cur = rosterOf.get(playerId);
    if (cur === target) return;
    if (cur == null) {
      freeAgents.delete(playerId);
      rosters[target - 1].players.add(playerId);
      rosterOf.set(playerId, target);
      const worst = worstNonProtected(target, playerId);
      if (worst) {
        rosters[target - 1].players.delete(worst);
        freeAgents.add(worst);
        rosterOf.delete(worst);
      }
      return;
    }
    const back = worstNonProtected(target);
    rosters[cur - 1].players.delete(playerId);
    rosters[target - 1].players.add(playerId);
    rosterOf.set(playerId, target);
    if (back) {
      rosters[target - 1].players.delete(back);
      rosters[cur - 1].players.add(back);
      rosterOf.set(back, cur);
    }
  }
  // "You" (r1) get the vets the rebuild will sell + a young core.
  place(pid("Damian Lillard"), 1);
  place(pid("Chris Paul"), 1);
  place(pid("Cam Thomas"), 1);
  // Counterparties hold what "you" will later acquire.
  place(pid("Scottie Barnes"), 8);
  place(pid("Franz Wagner"), 13);
  place(pid("Khris Middleton"), 6); // the 33-yo win-now target (age 33 in 2025)

  // Pick ledger: each roster owns its own R1–R3 for the next 4 seasons.
  const picks: Pick[] = [];
  for (let r = 1; r <= N_TEAMS; r++) {
    for (let yr = 2023; yr <= 2029; yr++) {
      for (let round = 1; round <= 3; round++) {
        picks.push({ season: String(yr), round, originalRoster: r, owner: r });
      }
    }
  }
  const findPick = (season: string, round: number, original: number) =>
    picks.find(
      (p) =>
        p.season === season &&
        p.round === round &&
        p.originalRoster === original,
    );

  const transactions: Record<string, Transaction[]> = {};
  const matchups: Record<string, Matchup[]> = {};
  const rosterSnapshots: Record<string, Roster[]> = {};
  const tradedPickSnapshots: Record<string, TradedPick[]> = {};
  const seasonSeq: Record<string, number> = {};
  const seasonWins: Record<string, Record<number, number>> = {};
  const seasonLosses: Record<string, Record<number, number>> = {};
  const seasonFpts: Record<string, Record<number, number>> = {};

  function tsFor(season: string, week: number, seq: number) {
    const y = parseInt(season, 10);
    return Date.UTC(y, 9, 20) + week * 7 * 86400_000 + seq * 3600_000;
  }
  function nextId(season: string) {
    seasonSeq[season] = (seasonSeq[season] ?? 0) + 1;
    return { seq: seasonSeq[season], id: `fx-${season}-${seasonSeq[season]}` };
  }

  function recordTrade(opts: {
    season: string;
    week: number;
    a: number;
    b: number;
    aOut: string[];
    bOut: string[];
    aPicksOut?: Array<[string, number, number]>; // [season, round, original]
    bPicksOut?: Array<[string, number, number]>;
    creator: number;
    id?: string;
  }) {
    const { season, week, a, b, aOut, bOut, creator } = opts;
    const { seq } = nextId(season);
    const id = opts.id ?? `fx-${season}-${seq}`;
    const adds: Record<string, number> = {};
    const drops: Record<string, number> = {};
    for (const p of aOut) {
      if (rosterOf.get(p) !== a) continue;
      rosters[a - 1].players.delete(p);
      rosters[b - 1].players.add(p);
      rosterOf.set(p, b);
      adds[p] = b;
      drops[p] = a;
    }
    for (const p of bOut) {
      if (rosterOf.get(p) !== b) continue;
      rosters[b - 1].players.delete(p);
      rosters[a - 1].players.add(p);
      rosterOf.set(p, a);
      adds[p] = a;
      drops[p] = b;
    }
    const draftPicks: DraftPickRef[] = [];
    const movePick = (
      spec: [string, number, number],
      from: number,
      to: number,
    ) => {
      const pk = findPick(spec[0], spec[1], spec[2]);
      if (!pk || pk.owner !== from) return;
      pk.owner = to;
      draftPicks.push({
        round: pk.round,
        season: pk.season,
        rosterId: pk.originalRoster,
        ownerId: to,
        previousOwnerId: from,
      });
    };
    (opts.aPicksOut ?? []).forEach((s) => movePick(s, a, b));
    (opts.bPicksOut ?? []).forEach((s) => movePick(s, b, a));

    (transactions[season] ??= []).push({
      transactionId: id,
      type: "trade",
      status: "complete",
      season,
      week,
      created: tsFor(season, week, seq),
      statusUpdated: tsFor(season, week, seq),
      creator: `u${creator}`,
      rosterIds: [a, b],
      consenterIds: [a, b],
      adds,
      drops,
      draftPicks,
      waiverBid: null,
    });
  }

  function recordAddDrop(opts: {
    season: string;
    week: number;
    roster: number;
    type: "waiver" | "free_agent";
    bid?: number;
  }) {
    const { season, week, roster, type } = opts;
    const r = rosters[roster - 1];
    // drop the worst (highest rank) rostered player; add the best available FA.
    const rosteredSorted = [...r.players]
      .filter((p) => !protectedSet.has(p))
      .sort((x, y) => (rankOf.get(y) ?? 0) - (rankOf.get(x) ?? 0));
    const drop = rosteredSorted[0];
    const faSorted = [...freeAgents].sort(
      (x, y) => (rankOf.get(x) ?? 999) - (rankOf.get(y) ?? 999),
    );
    const add = faSorted[Math.floor(rng() * Math.min(8, faSorted.length))];
    if (!drop || !add) return;
    r.players.delete(drop);
    freeAgents.add(drop);
    rosterOf.delete(drop);
    r.players.add(add);
    freeAgents.delete(add);
    rosterOf.set(add, roster);
    const { seq, id } = nextId(season);
    (transactions[season] ??= []).push({
      transactionId: id,
      type,
      status: "complete",
      season,
      week,
      created: tsFor(season, week, seq),
      statusUpdated: tsFor(season, week, seq),
      creator: `u${roster}`,
      rosterIds: [roster],
      consenterIds: [roster],
      adds: { [add]: roster },
      drops: { [drop]: roster },
      draftPicks: [],
      waiverBid: type === "waiver" ? (opts.bid ?? 0) : null,
    });
  }

  // Pick a plausible counterparty for a given roster (avoid self, prefer active).
  function counterparty(self: number): number {
    for (let tries = 0; tries < 10; tries++) {
      const c = 1 + Math.floor(rng() * N_TEAMS);
      if (c !== self && archetypeOf[c - 1] !== "ghost") return c;
    }
    return self === 1 ? 2 : 1;
  }
  // A random rostered player from a team, biased by "kind".
  function pickPlayer(roster: number, kind: "best" | "mid" | "worst"): string {
    const arr = [...rosters[roster - 1].players]
      .filter((p) => !protectedSet.has(p))
      .sort((x, y) => (rankOf.get(x) ?? 999) - (rankOf.get(y) ?? 999));
    if (arr.length === 0) return "";
    if (kind === "best") return arr[Math.floor(rng() * Math.min(3, arr.length))];
    if (kind === "worst") return arr[arr.length - 1 - Math.floor(rng() * 3)];
    return arr[Math.floor(arr.length / 2)];
  }

  // ---------- Simulate each season ----------
  for (const season of SEASONS) {
    seasonWins[season] = {};
    seasonLosses[season] = {};
    seasonFpts[season] = {};
    for (let r = 1; r <= N_TEAMS; r++) {
      seasonWins[season][r] = 0;
      seasonLosses[season][r] = 0;
      seasonFpts[season][r] = 0;
    }
    // Matchups + weekly W/L (needed before panic trades).
    const weeks = 20;
    const weeklyLoss: Record<number, Set<number>> = {};
    const mlist: Matchup[] = [];
    for (let w = 1; w <= weeks; w++) {
      weeklyLoss[w] = new Set();
      const order = [...Array(N_TEAMS).keys()].map((i) => i + 1);
      // rotating pairing
      const rot = order.slice(1);
      const shift = (w - 1) % rot.length;
      const rotated = [order[0], ...rot.slice(shift), ...rot.slice(0, shift)];
      for (let i = 0; i < N_TEAMS; i += 2) {
        const ra = rotated[i];
        const rb = rotated[i + 1];
        const matchupId = i / 2 + 1;
        const strength = (r: number) =>
          [...rosters[r - 1].players]
            .map(playerVal)
            .sort((x, y) => y - x)
            .slice(0, 10)
            .reduce((s, v) => s + v, 0);
        const pa = 360 + strength(ra) / 12 + (rng() - 0.5) * 90;
        const pb = 360 + strength(rb) / 12 + (rng() - 0.5) * 90;
        mlist.push({ rosterId: ra, matchupId, points: Math.round(pa * 10) / 10, week: w });
        mlist.push({ rosterId: rb, matchupId, points: Math.round(pb * 10) / 10, week: w });
        seasonFpts[season][ra] += pa;
        seasonFpts[season][rb] += pb;
        if (pa >= pb) {
          seasonWins[season][ra]++;
          seasonLosses[season][rb]++;
          weeklyLoss[w].add(rb);
        } else {
          seasonWins[season][rb]++;
          seasonLosses[season][ra]++;
          weeklyLoss[w].add(ra);
        }
      }
    }
    matchups[season] = mlist;

    // Archetype-driven transactions for each roster.
    for (let r = 1; r <= N_TEAMS; r++) {
      const arch = archetypeOf[r - 1];
      if (arch === "you") continue; // scripted below
      const cfg = archetypeConfig(arch);
      // waivers / FA
      const moves = cfg.waivers + Math.floor(rng() * 2);
      for (let m = 0; m < moves; m++) {
        recordAddDrop({
          season,
          week: 1 + Math.floor(rng() * weeks),
          roster: r,
          type: rng() < 0.5 ? "waiver" : "free_agent",
          bid: Math.floor(rng() * 40),
        });
      }
      // trades
      for (let t = 0; t < cfg.trades; t++) {
        const c = counterparty(r);
        let week = 1 + Math.floor(rng() * 18);
        if (arch === "panic") {
          // place the trade the week after a loss
          for (let w = 2; w <= weeks; w++) {
            if (weeklyLoss[w - 1].has(r)) {
              week = w;
              break;
            }
          }
        }
        buildArchetypeTrade(arch, r, c, season, week);
      }
    }

    // ---------- Scripted "you" (roster 1) ----------
    // Steady waiver/FA activity so the corpus is rich.
    for (let m = 0; m < 6; m++) {
      recordAddDrop({
        season,
        week: 2 + Math.floor(rng() * (weeks - 2)),
        roster: 1,
        type: rng() < 0.5 ? "waiver" : "free_agent",
        bid: Math.floor(rng() * 50),
      });
    }
    if (season === "2022") {
      // REBUILD MOVE A — sell a vet for youth + a future first.
      recordTrade({
        season, week: 8, a: 1, b: 8,
        aOut: [pid("Damian Lillard")],
        bOut: [pid("Scottie Barnes")],
        bPicksOut: [["2024", 1, 8]],
        creator: 1,
        id: "fx-2022-rebuildA",
      });
    }
    if (season === "2023") {
      // REBUILD MOVE B — another vet out for youth + a first.
      recordTrade({
        season, week: 6, a: 1, b: 13,
        aOut: [pid("Chris Paul")],
        bOut: [pid("Franz Wagner")],
        bPicksOut: [["2025", 1, 13]],
        creator: 1,
        id: "fx-2023-rebuildB",
      });
    }
    if (season === "2025") {
      // WIN-NOW PIVOT — spend TWO firsts on a 33-year-old. The contradiction.
      recordTrade({
        season, week: 5, a: 1, b: 6,
        aOut: [pid("Cam Thomas")],
        bOut: [pid("Khris Middleton")],
        aPicksOut: [
          ["2026", 1, 1],
          ["2027", 1, 1],
        ],
        creator: 1,
        id: "fx-2025-pivot",
      });
    }

    // Snapshot rosters + traded picks at season end.
    rosterSnapshots[season] = rosters.map((r) =>
      toDomainRoster(r, season, seasonWins, seasonLosses, seasonFpts, users),
    );
    tradedPickSnapshots[season] = picks
      .filter((p) => p.owner !== p.originalRoster)
      .map((p) => ({
        round: p.round,
        season: p.season,
        rosterId: p.originalRoster,
        ownerId: p.owner,
        previousOwnerId: p.originalRoster,
      }));
  }

  // ---------- Assemble leagues ----------
  const leagues: Record<string, LeagueDetail> = {};
  for (const season of SEASONS) {
    const id = leagueIdFor(season);
    leagues[id] = {
      leagueId: id,
      name: "NSL Fantasy Hoops",
      season,
      sport: "nba",
      status: season === CURRENT_SEASON ? "in_season" : "complete",
      previousLeagueId: prevLeagueId(season),
      totalRosters: N_TEAMS,
      rosterPositions: ROSTER_POSITIONS,
      scoringSettings: SCORING_SETTINGS,
      settings: {
        num_teams: N_TEAMS,
        taxi_slots: 3,
        pick_trading: 1,
        playoff_teams: 6,
        waiver_budget: 100,
        // The fixture fabricates real FAAB bid amounts on its waiver transactions
        // (see generateTransaction's `waiverBid`), so it has to declare itself a
        // FAAB league (Sleeper waiver_type 2) to match - otherwise isFaabLeague()
        // would read this as a rolling-priority league with bids that should not
        // exist, and the fixture-vs-live scenarios would test the wrong path.
        waiver_type: 2,
      },
    };
  }

  const rostersOut: Record<string, Roster[]> = {};
  const txOut: Record<string, Transaction[]> = {};
  const mOut: Record<string, Matchup[]> = {};
  const tpOut: Record<string, TradedPick[]> = {};
  const bracketsOut: Record<string, BracketGame[]> = {};
  for (const season of SEASONS) {
    const id = leagueIdFor(season);
    rostersOut[id] = rosterSnapshots[season];
    txOut[id] = transactions[season] ?? [];
    mOut[id] = matchups[season] ?? [];
    tpOut[id] = tradedPickSnapshots[season];
    // Only a COMPLETE season has a decided bracket - the current one is still being
    // played, and inventing a champion for it is the one thing this must not do.
    bracketsOut[id] =
      season === CURRENT_SEASON
        ? []
        : buildBracket(rosterSnapshots[season], SEASONS.indexOf(season));
  }

  // ---------- Drafts (so pick lineage works fully offline) ----------
  // Deterministic and self-consistent with the pick ledger above: a pick that was
  // traded away resolves to the player the ACQUIRING roster actually drafted.
  const draftsOut: Record<string, DraftMeta[]> = {};
  const draftPicksOut: Record<string, DraftPick[]> = {};
  // Season-aware: a draft held in 2025 or 2026 is roster 9's successor's draft, not
  // the departed manager's, and `draftOrder`/`pickedBy` have to say so.
  const ownerUserId = (rosterId: number, season: string) =>
    ownerIdForSeason(rosterId, season, users) ?? null;

  // The 126 lowest-ranked players stand in for three rookie classes. Some are on
  // rosters today and some have washed out to free agency — realistic hit rate.
  const rookiePool = ordered.slice(Math.max(0, ordered.length - 42 * DRAFT_ROUNDS));

  const completeDraftSeasons = DRAFT_SEASONS.filter((s) => s !== CURRENT_SEASON);

  for (const season of DRAFT_SEASONS) {
    const leagueId = leagueIdFor(season);
    const draftId = draftIdFor(season);
    const isFuture = season === CURRENT_SEASON;

    // Draft order = reverse prior-season standings (worst picks first), ties by
    // roster id so the map is stable across runs.
    const prior = SEASONS[SEASONS.indexOf(season as Season) - 1];
    const wins = seasonWins[prior] ?? {};
    const order = Array.from({ length: N_TEAMS }, (_, i) => i + 1).sort(
      (a, b) => (wins[a] ?? 0) - (wins[b] ?? 0) || a - b,
    );
    const slotToRosterId: Record<number, number> = {};
    const draftOrder: Record<string, number> = {};
    order.forEach((rosterId, i) => {
      const slot = i + 1;
      slotToRosterId[slot] = rosterId;
      const uid = ownerUserId(rosterId, season);
      if (uid) draftOrder[uid] = slot;
    });

    draftsOut[leagueId] = [
      {
        draftId,
        leagueId,
        season,
        sport: "nba",
        status: isFuture ? "pre_draft" : "complete",
        type: "linear",
        rounds: DRAFT_ROUNDS,
        teams: N_TEAMS,
        startTime: Date.UTC(parseInt(season, 10), 8, 25),
        created: Date.UTC(parseInt(season, 10), 8, 1),
        slotToRosterId,
        draftOrder,
      },
    ];

    // A pre-draft season has no picks yet — the "future pick, unresolved" case.
    if (isFuture) {
      draftPicksOut[draftId] = [];
      continue;
    }

    const classIndex = completeDraftSeasons.indexOf(season);
    const made: DraftPick[] = [];
    for (let round = 1; round <= DRAFT_ROUNDS; round++) {
      for (let slot = 1; slot <= N_TEAMS; slot++) {
        const pickNo = (round - 1) * N_TEAMS + slot; // linear, not snake
        const original = slotToRosterId[slot];
        const ledger = findPick(season, round, original);
        const madeBy = ledger?.owner ?? original;
        const player =
          rookiePool[classIndex * 42 + pickNo - 1] ?? rookiePool[pickNo - 1];
        made.push({
          draftId,
          pickNo,
          round,
          draftSlot: slot,
          rosterId: madeBy,
          pickedBy: ownerUserId(madeBy, season),
          playerId: player?.playerId ?? null,
          isKeeper: false,
          playerName: player?.fullName ?? null,
          position: player?.position ?? null,
          team: player?.team ?? null,
        });
      }
    }
    draftPicksOut[draftId] = made;
  }

  return {
    user: {
      userId: "u1",
      username: "ez8",
      displayName: "EZ8",
      avatar: null,
    },
    users,
    players,
    leagues,
    rosters: rostersOut,
    transactions: txOut,
    matchups: mOut,
    tradedPicks: tpOut,
    drafts: draftsOut,
    draftPicks: draftPicksOut,
    brackets: bracketsOut,
  };

  // ----- inner helpers that close over state -----
  function buildArchetypeTrade(
    arch: Archetype,
    r: number,
    c: number,
    season: string,
    week: number,
  ) {
    if (arch === "hoarder") {
      // acquire a future first, give a mid player
      const give = pickPlayer(r, "mid");
      const get = pickPlayer(c, "worst");
      recordTrade({
        season, week, a: r, b: c,
        aOut: give ? [give] : [],
        bOut: get ? [get] : [],
        bPicksOut: [["2028", 1, c]],
        creator: r,
      });
    } else if (arch === "name-chaser") {
      // acquire the counterparty's best (name) player, give youth + a pick
      const get = pickPlayer(c, "best");
      const give = pickPlayer(r, "mid");
      recordTrade({
        season, week, a: r, b: c,
        aOut: give ? [give] : [],
        bOut: get ? [get] : [],
        aPicksOut: [["2027", 1, r]],
        creator: r,
      });
    } else if (arch === "panic") {
      // sell a good player for a lesser return (post-loss)
      const give = pickPlayer(r, "best");
      const get = pickPlayer(c, "worst");
      recordTrade({
        season, week, a: r, b: c,
        aOut: give ? [give] : [],
        bOut: get ? [get] : [],
        creator: r,
      });
    } else {
      // churner / balanced / streamer: even-ish player swap
      const give = pickPlayer(r, "mid");
      const get = pickPlayer(c, "mid");
      recordTrade({
        season, week, a: r, b: c,
        aOut: give ? [give] : [],
        bOut: get ? [get] : [],
        creator: r,
      });
    }
  }
}

function archetypeConfig(arch: Archetype): { trades: number; waivers: number } {
  switch (arch) {
    case "churner": return { trades: 4, waivers: 3 };
    case "hoarder": return { trades: 2, waivers: 1 };
    case "ghost": return { trades: 0, waivers: 0 };
    case "panic": return { trades: 3, waivers: 2 };
    case "name-chaser": return { trades: 2, waivers: 2 };
    case "streamer": return { trades: 1, waivers: 9 };
    case "balanced": return { trades: 2, waivers: 4 };
    default: return { trades: 1, waivers: 2 };
  }
}

function toDomainRoster(
  r: { rosterId: number; players: Set<string> },
  season: string,
  wins: Record<string, Record<number, number>>,
  losses: Record<string, Record<number, number>>,
  fpts: Record<string, Record<number, number>>,
  users: LeagueUser[],
): Roster {
  const players = [...r.players];
  const w = wins[season][r.rosterId] ?? 0;
  const l = losses[season][r.rosterId] ?? 0;
  const fp = Math.round((fpts[season][r.rosterId] ?? 0) * 10) / 10;
  return {
    rosterId: r.rosterId,
    ownerId: ownerIdForSeason(r.rosterId, season, users),
    coOwners: [],
    players,
    starters: players.slice(0, 7),
    reserve: [],
    taxi: [],
    settings: {
      wins: w,
      losses: l,
      ties: 0,
      fpts: fp,
      fptsAgainst: Math.round(fp * (0.95 + (r.rosterId % 5) * 0.02) * 10) / 10,
      ppts: Math.round(fp * 1.06 * 10) / 10,
      waiverBudgetUsed: (r.rosterId * 7) % 100,
      waiverPosition: r.rosterId,
      totalMoves: 0,
    },
  };
}
