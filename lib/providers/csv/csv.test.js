import { describe, expect, it } from "vitest";
import { CsvProvider, parseCsv } from "./index.js";
describe("parseCsv", () => {
  it("parses headers and rows", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n4,5,6");
    expect(rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
  });
  it("handles quoted fields containing commas and quotes", () => {
    const rows = parseCsv('name,note\n"Doe, John","says ""hi"""');
    expect(rows[0].name).toBe("Doe, John");
    expect(rows[0].note).toBe('says "hi"');
  });
});
describe("CsvProvider", () => {
  const bundle = {
    league:
      "league_id,name,season,sport,total_rosters,roster_positions,previous_league_id\n" +
      "L1,Test League,2025,nba,2,PG;SG;SF;PF;C,",
    users:
      "user_id,display_name,team_name,is_owner\n" +
      "u1,Alice,Alpha,true\n" +
      "u2,Bob,Bravo,false",
    rosters:
      "roster_id,owner_id,players,starters,wins,losses,fpts,fpts_against,ppts,waiver_budget_used\n" +
      "1,u1,p1;p2,p1;p2,10,4,4000.5,3800,4200,25\n" +
      "2,u2,p3;p4,p3;p4,4,10,3600,3900,3700,40",
    players:
      "player_id,full_name,position,age,search_rank,team\n" +
      "p1,Star Guard,PG,24,3,BOS\n" +
      "p3,Old Center,C,33,80,LAL",
    transactions:
      "transaction_id,season,week,type,status,creator,roster_ids,consenter_ids,adds,drops,draft_picks,waiver_bid,created_ms\n" +
      "t1,2025,3,trade,complete,u1,1;2,1;2,p3:1,p1:2,2026-1-2-1-2,,1700000000000\n" +
      "t2,2025,4,waiver,complete,u2,2,2,p9:2,,,15,1700100000000",
    traded_picks:
      "season,round,roster_id,owner_id,previous_owner_id\n" + "2026,1,2,1,2",
  };
  const p = CsvProvider.fromBundle(bundle);
  it("reads the league detail", async () => {
    const l = await p.getLeague("");
    expect(l.name).toBe("Test League");
    expect(l.season).toBe("2025");
    expect(l.rosterPositions).toEqual(["PG", "SG", "SF", "PF", "C"]);
    expect(l.totalRosters).toBe(2);
  });
  it("reads rosters with combined records", async () => {
    const rs = await p.getRosters();
    expect(rs).toHaveLength(2);
    expect(rs[0].players).toEqual(["p1", "p2"]);
    expect(rs[0].settings.fpts).toBeCloseTo(4000.5);
    expect(rs[0].settings.wins).toBe(10);
  });
  it("parses a trade transaction with adds/drops/picks", async () => {
    const wk3 = await p.getTransactions("", 3);
    expect(wk3).toHaveLength(1);
    const t = wk3[0];
    expect(t.type).toBe("trade");
    expect(t.adds).toEqual({ p3: 1 });
    expect(t.drops).toEqual({ p1: 2 });
    expect(t.draftPicks[0]).toMatchObject({
      season: "2026",
      round: 1,
      rosterId: 2,
      ownerId: 1,
      previousOwnerId: 2,
    });
  });
  it("parses a waiver with a bid", async () => {
    const wk4 = await p.getTransactions("", 4);
    expect(wk4[0].type).toBe("waiver");
    expect(wk4[0].waiverBid).toBe(15);
  });
  it("reads traded picks", async () => {
    const tp = await p.getTradedPicks();
    expect(tp[0]).toMatchObject({ season: "2026", round: 1, ownerId: 1 });
  });
});
