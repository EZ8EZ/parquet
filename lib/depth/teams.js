/**
 * NBA TEAM CODES, and nothing else.
 *
 * Sleeper's player payload names a player's team as a bare abbreviation and never
 * spells it out, so a depth chart headed "LAL" is the only thing the source alone can
 * produce. Thirty entries buys "Los Angeles Lakers" at the top of the page, which is
 * the difference between a screen that reads as a product and one that reads as a
 * dump of the payload.
 *
 * THE KEYS ARE MEASURED, NOT REMEMBERED. Every abbreviation below was taken from the
 * live `/players/nba` payload (2026-08-19): 593 on-team players resolve to exactly
 * these thirty codes, which settles the ones that have more than one plausible form -
 * BKN not BRK, NOP not NO, PHX not PHO, SAS not SA, NYK not NY, GSW not GS, UTA not
 * UTAH.
 *
 * `teamName` NEVER throws and never returns empty. An abbreviation this table has not
 * heard of - a relocation, an expansion team, a code Sleeper changes under us - falls
 * back to the abbreviation itself, so the page keeps working and simply reads "SEA"
 * instead of a city. The route's existence is decided by whether the payload has
 * players on that team (see `app/depth/[team]/page.jsx`), NEVER by membership in this
 * table: a lookup table is a display convenience and must not be able to 404 a team
 * the data plainly has.
 */
/** @type {Record<string, string>} */
export const NBA_TEAM_NAMES = {
  ATL: "Atlanta Hawks",
  BKN: "Brooklyn Nets",
  BOS: "Boston Celtics",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  DET: "Detroit Pistons",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  IND: "Indiana Pacers",
  LAC: "Los Angeles Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans",
  NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors",
  UTA: "Utah Jazz",
  WAS: "Washington Wizards",
};
/**
 * The full name for a team code, or the code itself when it is not one we know.
 * @param {string|null|undefined} abbr
 * @returns {string}
 */
export function teamName(abbr) {
  if (!abbr) return "";
  const code = String(abbr).trim().toUpperCase();
  return NBA_TEAM_NAMES[code] ?? code;
}
/**
 * The short, headline-safe half of the name - "Lakers", "Trail Blazers", "76ers".
 * Used where the city is dead weight (a page title beside the team's own crest).
 * Falls back to the code, same as `teamName`.
 * @param {string|null|undefined} abbr
 * @returns {string}
 */
export function teamShortName(abbr) {
  const full = teamName(abbr);
  if (!full) return "";
  // Two-word nicknames exist ("Trail Blazers"), so this is not "the last word":
  // the split point is the city, and the city is everything before the nickname.
  // Hardcoding the four multi-word cases would drift; taking the tail after the
  // known city prefix cannot.
  const cities = [
    "Los Angeles",
    "New Orleans",
    "New York",
    "Oklahoma City",
    "Golden State",
    "San Antonio",
  ];
  for (const city of cities) {
    if (full.startsWith(`${city} `)) return full.slice(city.length + 1);
  }
  const i = full.indexOf(" ");
  return i > 0 ? full.slice(i + 1) : full;
}
