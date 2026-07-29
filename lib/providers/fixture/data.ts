/**
 * Static seed data for the FixtureProvider.
 *
 * Player names are real (public factual data, not copyrighted) so the showcase
 * reads realistically. Attributes (age, rank) are approximate and only need to be
 * internally consistent — the fixture exists to exercise the app end-to-end with
 * zero external dependencies, not to be a live data source.
 */

export type Sport = "nba";

/** Ordered roughly by dynasty value (best first). search_rank = index + 1. */
export const CURATED: Array<{ name: string; pos: string; age2022: number }> = [
  // Superstars
  { name: "Luka Doncic", pos: "PG", age2022: 23 },
  { name: "Nikola Jokic", pos: "C", age2022: 27 },
  { name: "Giannis Antetokounmpo", pos: "PF", age2022: 27 },
  { name: "Ja Morant", pos: "PG", age2022: 22 },
  { name: "Jayson Tatum", pos: "SF", age2022: 24 },
  { name: "Anthony Edwards", pos: "SG", age2022: 20 },
  { name: "Joel Embiid", pos: "C", age2022: 28 },
  { name: "Shai Gilgeous-Alexander", pos: "PG", age2022: 23 },
  { name: "Devin Booker", pos: "SG", age2022: 25 },
  { name: "Trae Young", pos: "PG", age2022: 23 },
  { name: "Zion Williamson", pos: "PF", age2022: 21 },
  { name: "LaMelo Ball", pos: "PG", age2022: 20 },
  { name: "Tyrese Haliburton", pos: "PG", age2022: 22 },
  { name: "Donovan Mitchell", pos: "SG", age2022: 25 },
  { name: "Jaylen Brown", pos: "SG", age2022: 25 },
  // Tier 2
  { name: "Stephen Curry", pos: "PG", age2022: 34 },
  { name: "Kevin Durant", pos: "SF", age2022: 33 },
  { name: "Bam Adebayo", pos: "C", age2022: 24 },
  { name: "Cade Cunningham", pos: "PG", age2022: 20 },
  { name: "Evan Mobley", pos: "PF", age2022: 21 },
  { name: "Scottie Barnes", pos: "SF", age2022: 20 },
  { name: "Karl-Anthony Towns", pos: "C", age2022: 26 },
  { name: "De'Aaron Fox", pos: "PG", age2022: 24 },
  { name: "Darius Garland", pos: "PG", age2022: 22 },
  { name: "Anthony Davis", pos: "PF", age2022: 29 },
  { name: "Jaren Jackson Jr.", pos: "PF", age2022: 22 },
  { name: "Tyrese Maxey", pos: "PG", age2022: 21 },
  { name: "Domantas Sabonis", pos: "C", age2022: 26 },
  { name: "Pascal Siakam", pos: "PF", age2022: 28 },
  { name: "Franz Wagner", pos: "SF", age2022: 20 },
  // Tier 3
  { name: "Desmond Bane", pos: "SG", age2022: 24 },
  { name: "Jalen Brunson", pos: "PG", age2022: 25 },
  { name: "Paolo Banchero", pos: "PF", age2022: 19 },
  { name: "Jimmy Butler", pos: "SF", age2022: 32 },
  { name: "Kawhi Leonard", pos: "SF", age2022: 31 },
  { name: "Paul George", pos: "SF", age2022: 32 },
  { name: "Damian Lillard", pos: "PG", age2022: 31 },
  { name: "Kyrie Irving", pos: "PG", age2022: 30 },
  { name: "Brandon Ingram", pos: "SF", age2022: 24 },
  { name: "Dejounte Murray", pos: "PG", age2022: 25 },
  { name: "Jalen Green", pos: "SG", age2022: 20 },
  { name: "Alperen Sengun", pos: "C", age2022: 19 },
  { name: "Jrue Holiday", pos: "PG", age2022: 32 },
  { name: "Jamal Murray", pos: "PG", age2022: 25 },
  { name: "Julius Randle", pos: "PF", age2022: 27 },
  { name: "Rudy Gobert", pos: "C", age2022: 30 },
  { name: "Mikal Bridges", pos: "SF", age2022: 25 },
  { name: "Jarrett Allen", pos: "C", age2022: 24 },
  { name: "Myles Turner", pos: "C", age2022: 26 },
  { name: "Zach LaVine", pos: "SG", age2022: 27 },
  // Tier 4 — vets + depth (the "aging" pool for win-now pivots)
  { name: "Khris Middleton", pos: "SF", age2022: 30 },
  { name: "DeMar DeRozan", pos: "SF", age2022: 32 },
  { name: "CJ McCollum", pos: "SG", age2022: 30 },
  { name: "Fred VanVleet", pos: "PG", age2022: 28 },
  { name: "Bradley Beal", pos: "SG", age2022: 28 },
  { name: "LeBron James", pos: "SF", age2022: 37 },
  { name: "Chris Paul", pos: "PG", age2022: 37 },
  { name: "Nikola Vucevic", pos: "C", age2022: 31 },
  { name: "Jakob Poeltl", pos: "C", age2022: 26 },
  { name: "Deandre Ayton", pos: "C", age2022: 23 },
  { name: "Kristaps Porzingis", pos: "C", age2022: 26 },
  { name: "OG Anunoby", pos: "SF", age2022: 24 },
  { name: "RJ Barrett", pos: "SG", age2022: 22 },
  { name: "Jabari Smith Jr.", pos: "PF", age2022: 19 },
  { name: "Josh Giddey", pos: "PG", age2022: 19 },
  { name: "Bennedict Mathurin", pos: "SG", age2022: 20 },
  { name: "Keegan Murray", pos: "PF", age2022: 21 },
  { name: "Jaden Ivey", pos: "PG", age2022: 20 },
  { name: "Walker Kessler", pos: "C", age2022: 20 },
  { name: "Tyler Herro", pos: "SG", age2022: 22 },
  { name: "Immanuel Quickley", pos: "PG", age2022: 22 },
  { name: "Jonathan Kuminga", pos: "PF", age2022: 19 },
  { name: "Jalen Suggs", pos: "PG", age2022: 20 },
  { name: "Jordan Poole", pos: "SG", age2022: 22 },
  { name: "Anfernee Simons", pos: "SG", age2022: 22 },
  { name: "Kyle Kuzma", pos: "PF", age2022: 26 },
  { name: "John Collins", pos: "PF", age2022: 24 },
  { name: "Aaron Gordon", pos: "PF", age2022: 26 },
  { name: "Jerami Grant", pos: "PF", age2022: 28 },
  { name: "Bobby Portis", pos: "PF", age2022: 27 },
  { name: "Draymond Green", pos: "PF", age2022: 32 },
  { name: "Klay Thompson", pos: "SG", age2022: 32 },
  { name: "Andrew Wiggins", pos: "SF", age2022: 27 },
  { name: "Marcus Smart", pos: "PG", age2022: 28 },
  { name: "Terry Rozier", pos: "PG", age2022: 28 },
  { name: "Buddy Hield", pos: "SG", age2022: 29 },
  { name: "Bogdan Bogdanovic", pos: "SG", age2022: 29 },
  { name: "Tobias Harris", pos: "PF", age2022: 29 },
  { name: "D'Angelo Russell", pos: "PG", age2022: 26 },
  { name: "Spencer Dinwiddie", pos: "PG", age2022: 29 },
  { name: "Collin Sexton", pos: "PG", age2022: 23 },
  { name: "Jusuf Nurkic", pos: "C", age2022: 27 },
  { name: "Clint Capela", pos: "C", age2022: 28 },
  { name: "Wendell Carter Jr.", pos: "C", age2022: 23 },
  { name: "Onyeka Okongwu", pos: "C", age2022: 21 },
  { name: "Herbert Jones", pos: "SF", age2022: 23 },
  { name: "Trey Murphy III", pos: "SF", age2022: 22 },
  { name: "Cam Thomas", pos: "SG", age2022: 20 },
];

const FIRST = [
  "Marcus", "Devon", "Tyrell", "Jaylen", "Cameron", "Isaiah", "Malik", "Xavier",
  "Terrance", "Darnell", "Elijah", "Dante", "Kobe", "Amari", "Deshawn", "Trevon",
  "Jamar", "Quincy", "Rashad", "Andre", "Brayden", "Kaleb", "Emmanuel", "Zaire",
];
const LAST = [
  "Powell", "Coleman", "Ferguson", "Hendricks", "Osei", "Vasquez", "Nowak",
  "Adeyemi", "Kowalski", "Petrov", "Sato", "Okafor", "Delgado", "Larsson",
  "Mbeki", "Reyes", "Ivanov", "Traore", "Silva", "Bautista", "Nakamura",
  "Diallo", "Horvat", "Ellis",
];
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

/** Deterministic filler pool to fill roster depth + free agency. */
export function fillerPlayers(count: number, startRank: number) {
  const out: Array<{ name: string; pos: string; age2022: number }> = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST[(i * 7) % FIRST.length];
    const last = LAST[(i * 5 + 3) % LAST.length];
    out.push({
      name: `${first} ${last}`,
      pos: POSITIONS[i % POSITIONS.length],
      age2022: 20 + ((i * 3) % 14),
    });
  }
  void startRank;
  return out;
}

export type Archetype =
  | "you"
  | "churner"
  | "hoarder"
  | "ghost"
  | "panic"
  | "name-chaser"
  | "streamer"
  | "balanced";

export const MANAGERS: Array<{
  displayName: string;
  teamName: string;
  archetype: Archetype;
}> = [
  { displayName: "EZ8", teamName: "Parquet Kings", archetype: "you" },
  { displayName: "yagevlevi", teamName: "Hardwood Capital", archetype: "churner" },
  { displayName: "PickHoarder", teamName: "Future Assets", archetype: "hoarder" },
  { displayName: "SilentSam", teamName: "Do Not Disturb", archetype: "ghost" },
  { displayName: "TiltMachine", teamName: "Full Tilt", archetype: "panic" },
  { displayName: "NostalgiaGM", teamName: "Old Reliable", archetype: "name-chaser" },
  { displayName: "WaiverWade", teamName: "Wire Warriors", archetype: "streamer" },
  { displayName: "SteadyEddie", teamName: "The Process", archetype: "balanced" },
  { displayName: "BigTrades", teamName: "Blockbuster", archetype: "churner" },
  { displayName: "VaultKeeper", teamName: "Draft Vault", archetype: "hoarder" },
  { displayName: "GhostProtocol", teamName: "Radio Silence", archetype: "ghost" },
  { displayName: "PanicPete", teamName: "Sell Low", archetype: "panic" },
  { displayName: "RingChaser", teamName: "Win Now", archetype: "name-chaser" },
  { displayName: "EvenKeel", teamName: "Balanced Books", archetype: "balanced" },
];
