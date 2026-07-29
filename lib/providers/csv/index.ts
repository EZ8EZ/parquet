/**
 * CsvProvider - fallback for any league platform that has no public API.
 *
 * Documented CSV schema (one file per entity, header row required). Semicolon
 * (`;`) separates list values inside a cell so commas remain the field delimiter.
 *
 *   league.csv        league_id,name,season,sport,total_rosters,roster_positions,previous_league_id
 *   users.csv         user_id,display_name,team_name,is_owner
 *   rosters.csv       roster_id,owner_id,players,starters,wins,losses,fpts,fpts_against,ppts,waiver_budget_used
 *   players.csv       player_id,full_name,position,age,search_rank,team
 *   transactions.csv  transaction_id,season,week,type,status,creator,roster_ids,consenter_ids,adds,drops,draft_picks,waiver_bid,created_ms
 *   traded_picks.csv  season,round,roster_id,owner_id,previous_owner_id
 *
 *   adds/drops cell : "playerId:rosterId;playerId:rosterId"
 *   draft_picks cell: "season-round-originalRoster-ownerRoster-prevRoster;..."
 *
 * `CsvProvider.fromEnv()` reads these from the directory in CSV_DIR.
 * `CsvProvider.fromBundle({...})` takes raw CSV strings (used by tests).
 */
import { z } from "zod";
import type {
  DraftPickRef,
  League,
  LeagueDetail,
  LeagueProvider,
  LeagueUser,
  Matchup,
  Player,
  Roster,
  TradedPick,
  Transaction,
  TransactionType,
  User,
} from "../types";

export type CsvBundle = Partial<
  Record<
    | "league"
    | "users"
    | "rosters"
    | "players"
    | "transactions"
    | "traded_picks",
    string
  >
>;

// ---- tiny RFC-4180-ish CSV parser (handles quoted fields with commas) ----
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.length) || rows.length) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = (r[i] ?? "").trim()));
    return obj;
  });
}

const list = (s: string) => (s ? s.split(";").filter(Boolean) : []);
const nums = (s: string) => list(s).map((x) => parseInt(x, 10));

function parseMap(s: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pair of list(s)) {
    const [pid, rid] = pair.split(":");
    if (pid) out[pid] = parseInt(rid, 10);
  }
  return out;
}
function parsePicks(s: string): DraftPickRef[] {
  return list(s).map((p) => {
    const [season, round, orig, owner, prev] = p.split("-");
    return {
      season,
      round: parseInt(round, 10),
      rosterId: parseInt(orig, 10),
      ownerId: parseInt(owner, 10),
      previousOwnerId: parseInt(prev, 10),
    };
  });
}

const LeagueRow = z.object({
  league_id: z.string(),
  name: z.string(),
  season: z.string(),
  sport: z.string().default("nba"),
  total_rosters: z.string().default("0"),
  roster_positions: z.string().default(""),
  previous_league_id: z.string().default(""),
});

export class CsvProvider implements LeagueProvider {
  readonly name = "csv";
  private constructor(private bundle: CsvBundle) {}

  static fromBundle(bundle: CsvBundle): CsvProvider {
    return new CsvProvider(bundle);
  }

  static fromEnv(): CsvProvider {
    const dir = process.env.CSV_DIR;
    if (!dir) throw new Error("CSV_DIR is required when LEAGUE_PROVIDER=csv");
    // Lazy require so bundlers don't pull fs into the client.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const read = (name: string) => {
      const fp = path.join(dir, `${name}.csv`);
      return fs.existsSync(fp) ? fs.readFileSync(fp, "utf8") : undefined;
    };
    return new CsvProvider({
      league: read("league"),
      users: read("users"),
      rosters: read("rosters"),
      players: read("players"),
      transactions: read("transactions"),
      traded_picks: read("traded_picks"),
    });
  }

  private rows(key: keyof CsvBundle): Record<string, string>[] {
    const text = this.bundle[key];
    return text ? parseCsv(text) : [];
  }

  private leagueRow() {
    const r = this.rows("league")[0];
    if (!r) throw new Error("csv: league.csv missing or empty");
    return LeagueRow.parse(r);
  }

  async getUser(username: string): Promise<User> {
    const owner = this.rows("users").find((u) => u.is_owner === "true");
    return {
      userId: owner?.user_id ?? "csv-user",
      username: username.toLowerCase(),
      displayName: owner?.display_name ?? username,
      avatar: null,
    };
  }

  async getLeagues(): Promise<League[]> {
    return [await this.getLeague("")];
  }

  async getLeague(_leagueId: string): Promise<LeagueDetail> {
    const l = this.leagueRow();
    return {
      leagueId: l.league_id,
      name: l.name,
      season: l.season,
      sport: l.sport,
      status: "complete",
      previousLeagueId: l.previous_league_id || null,
      totalRosters: parseInt(l.total_rosters, 10) || this.rows("rosters").length,
      rosterPositions: list(l.roster_positions),
      scoringSettings: {},
      settings: {},
    };
  }

  async getRosters(): Promise<Roster[]> {
    return this.rows("rosters").map((r) => ({
      rosterId: parseInt(r.roster_id, 10),
      ownerId: r.owner_id || null,
      coOwners: [],
      players: list(r.players),
      starters: list(r.starters),
      reserve: [],
      taxi: [],
      settings: {
        wins: parseInt(r.wins ?? "0", 10) || 0,
        losses: parseInt(r.losses ?? "0", 10) || 0,
        ties: 0,
        fpts: parseFloat(r.fpts ?? "0") || 0,
        fptsAgainst: parseFloat(r.fpts_against ?? "0") || 0,
        ppts: parseFloat(r.ppts ?? "0") || 0,
        waiverBudgetUsed: parseInt(r.waiver_budget_used ?? "0", 10) || 0,
        waiverPosition: 0,
        totalMoves: 0,
      },
    }));
  }

  async getUsers(): Promise<LeagueUser[]> {
    return this.rows("users").map((u) => ({
      userId: u.user_id,
      displayName: u.display_name,
      avatar: null,
      teamName: u.team_name || null,
      isOwner: u.is_owner === "true",
      isBot: false,
    }));
  }

  async getTransactions(_leagueId: string, week: number): Promise<Transaction[]> {
    return this.rows("transactions")
      .filter((t) => parseInt(t.week, 10) === week)
      .map((t) => ({
        transactionId: t.transaction_id,
        type: (t.type as TransactionType) ?? "free_agent",
        status: t.status || "complete",
        season: t.season,
        week: parseInt(t.week, 10) || 0,
        created: parseInt(t.created_ms ?? "0", 10) || 0,
        statusUpdated: parseInt(t.created_ms ?? "0", 10) || 0,
        creator: t.creator || null,
        rosterIds: nums(t.roster_ids),
        consenterIds: nums(t.consenter_ids),
        adds: parseMap(t.adds),
        drops: parseMap(t.drops),
        draftPicks: parsePicks(t.draft_picks),
        waiverBid: t.waiver_bid ? parseInt(t.waiver_bid, 10) : null,
      }));
  }

  async getMatchups(): Promise<Matchup[]> {
    return []; // CSV imports carry no matchup data in v1.
  }

  async getTradedPicks(): Promise<TradedPick[]> {
    return this.rows("traded_picks").map((p) => ({
      round: parseInt(p.round, 10),
      season: p.season,
      rosterId: parseInt(p.roster_id, 10),
      ownerId: parseInt(p.owner_id, 10),
      previousOwnerId: parseInt(p.previous_owner_id, 10),
    }));
  }

  async getPlayers(): Promise<Player[]> {
    return this.rows("players").map((p) => ({
      playerId: p.player_id,
      fullName: p.full_name,
      firstName: p.full_name.split(" ")[0] ?? "",
      lastName: p.full_name.split(" ").slice(1).join(" "),
      team: p.team || null,
      position: p.position || null,
      fantasyPositions: p.position ? [p.position] : [],
      age: p.age ? parseInt(p.age, 10) : null,
      yearsExp: null,
      birthDate: null,
      injuryStatus: null,
      depthChartOrder: null,
      status: "ACT",
      number: null,
      searchRank: p.search_rank ? parseInt(p.search_rank, 10) : null,
      espnId: null,
    }));
  }
}
