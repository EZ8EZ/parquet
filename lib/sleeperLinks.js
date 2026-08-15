/**
 * Sleeper deep links.
 *
 * Parquet is a *companion* to the Sleeper app: every insight we surface should
 * have a one-tap path back into Sleeper to actually execute it. Sleeper has no
 * write API, so the best we can do is deep-link to the right screen and let the
 * user carry the thesis over in their head from there.
 *
 * ── How these URLs were verified ──────────────────────────────────────────────
 *
 * IMPORTANT, and the reason this file is so heavily commented: `sleeper.com` is
 * a client-rendered SPA, so **HTTP status codes cannot verify most of these
 * routes.** Everything under a known top-level segment returns a byte-identical
 * 200 shell:
 *
 *   200  /leagues/1347007735815766016              (real league)
 *   200  /leagues/thisisnotarealleagueid12345      (nonsense league id!)
 *   200  /leagues/1347007735815766016/bogus-subroute-xyz
 *   404  /totally-bogus-route-xyz                  (unknown *top-level* segment)
 *
 * The real and the nonsense league URL both returned exactly 8275 bytes with
 * `<title>Sleeper</title>`. So a 200 here proves only that `/leagues/*` is a
 * recognised prefix — it says nothing about whether a sub-route exists. Curl
 * alone would have happily "confirmed" routes that do not exist.
 *
 * Instead, the league routes below were verified against **Sleeper's own client
 * route table**, extracted from their production JS bundle
 * (`sleepercdn.com/js/bundle-<hash>.js`, referenced by the league page shell).
 * The complete `/leagues` route list it declares:
 *
 *   /leagues/:league            /leagues/:league/research
 *   /leagues/:league/league     /leagues/:league/scores
 *   /leagues/:league/managed    /leagues/:league/settings
 *   /leagues/:league/matchup    /leagues/:league/standings
 *   /leagues/:league/players    /leagues/:league/team
 *   /leagues/:league/predraft   /leagues/:league/trades
 *   /leagues/:league/trend
 *
 * That is the authoritative source for the three league routes used here, and
 * it is why the trade centre is `/trades` (plural) — `/trade` (singular) also
 * returns 200, but only because of the SPA catch-all described above. It is not
 * a real route.
 *
 * Player pages are a separate, genuinely server-rendered surface, so those *can*
 * be verified by status code and content:
 *
 *   200  text/html   /nba/players/1074    <title>Paul George Stats… - Sleeper</title>
 *   200  text/html   /nba/players/999999999   <title>Player Stats… - Sleeper</title>  (no name)
 *   404  text/html   /nba/bogus-xyz       <title>Sleeper - Page Not Found</title>
 *
 * Note the sport comes FIRST: `/nba/players/{id}`, not `/players/nba/{id}`.
 * `/players/nba/1074` *does* return 200 — but with
 * `content-type: application/json`; it is an internal JSON API endpoint that
 * dumps raw player fields, not a viewable page. Linking a user there would show
 * them a wall of JSON. (Cross-check: that JSON reports Fresno State / #13 /
 * 15 yrs exp, which matches the Paul George page title above, confirming id
 * 1074 resolves to the same player on both surfaces.)
 *
 * All status codes above observed 2026-07-29 via
 * `curl -s -o /dev/null -w "%{http_code}"` (plus `-I` for content types).
 *
 * ── On `sleeper://` app deep links ───────────────────────────────────────────
 *
 * Deliberately NOT implemented. Grepping the production bundle for `sleeper://`
 * returns zero matches, and the only app-install links Sleeper ships are plain
 * https (`sleeper.app/download`). There is no evidence of a documented custom
 * scheme, and an invented one would fail silently on the user's phone — strictly
 * worse than an https link, which iOS/Android hand off to the installed Sleeper
 * app automatically via universal links. So we return https URLs everywhere and
 * let the OS route them.
 *
 * ── Why these return `string | null` ─────────────────────────────────────────
 *
 * Parquet can run against the `fixture` provider, whose league ids look like
 * `fx-nba-2025` — not real Sleeper ids. Linking those would 404 the user into a
 * dead end. Each helper therefore returns `null` for an id that cannot be a
 * Sleeper id, and `<OpenInSleeper>` renders nothing when the href is null. That
 * makes a broken outbound link structurally impossible rather than a thing we
 * have to remember to guard at each call site.
 */
const WEB_BASE = "https://sleeper.com";
/**
 * True when `id` could be a real Sleeper id.
 *
 * Sleeper league and player ids are numeric strings (leagues are snowflake-style
 * and ~18 digits; player ids are short, e.g. `1074`). The fixture provider uses
 * `fx-nba-<season>`, so a digits-only test cleanly separates live ids from
 * fixture ids without hardcoding anything about the fixture format.
 */
function isNumericId(id) {
  return typeof id === "string" && /^\d+$/.test(id);
}
/**
 * The league's home screen on Sleeper.
 * Route: `/leagues/:league` — present in Sleeper's client route table.
 */
export function sleeperLeagueUrl(leagueId) {
  return isNumericId(leagueId) ? `${WEB_BASE}/leagues/${leagueId}` : null;
}
/**
 * The team (roster) screen on Sleeper.
 * Route: `/leagues/:league/team` — present in Sleeper's client route table.
 *
 * CAVEAT: that route takes **no roster identifier**. Sleeper's route table has
 * no `/team/:rosterId` variant, and the bundle shows no roster query param
 * (`?roster_id=` / `.get("roster_id")` both absent), so there is no way to
 * deep-link an *arbitrary* manager's team. The screen resolves to whichever team
 * the signed-in user owns in that league.
 *
 * That's exactly right for our only use case — the "my roster" page linking the
 * user to their own team. `rosterId` is accepted so call sites can pass the id
 * they naturally have (and so this signature survives if Sleeper ever adds a
 * per-roster route), but it is intentionally unused today.
 */
export function sleeperTeamUrl(leagueId, _rosterId) {
  const league = sleeperLeagueUrl(leagueId);
  return league ? `${league}/team` : null;
}
/*
 * `sleeperMatchupUrl()` — the league's matchup screen, where a lock-in slot actually
 * gets spent — stood here. Its only caller was /lab/startline, which was shelved
 * (SHELVED.md, S1), and Parquet now has no surface about a live week to link out of.
 *
 * The route survives in the table above and is verified: `/leagues/:league/matchup`,
 * singular (unlike `/trades`), and with no `/matchup/:week` variant. Anything that
 * needs it back needs three lines, not a re-verification.
 */
/**
 * The league's trade centre — where a proposal actually gets sent.
 * Route: `/leagues/:league/trades` (PLURAL — see the header note; `/trade`
 * singular is a SPA catch-all, not a real route).
 *
 * Sleeper has no write API, so we cannot prefill a proposal. This just lands the
 * user on the correct screen; the thesis they read on /trade is what they carry
 * over in their head (the copyable summary that used to sit beside this link was
 * removed from /trade - see DECISIONS D37).
 */
export function sleeperTradeUrl(leagueId) {
  const league = sleeperLeagueUrl(leagueId);
  return league ? `${league}/trades` : null;
}
