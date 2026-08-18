/**
 * Print one claim link per manager. `pnpm claim-links [origin]`
 *
 * This exists because /commissioner's own Seats section cannot bootstrap itself: it
 * only renders for the deploy owner's seat, and the deploy owner cannot hold a seat
 * until somebody has handed him a claim link. That is a closed loop, and this script
 * is the way in. After the owner claims his own seat from this output, the in-app
 * section takes over and there is no further reason to run it.
 *
 * Runs entirely offline of the app: it reads the same league the app reads, signs
 * with the same secret the app verifies, and touches no database. Nothing here is
 * stored - the links are derived from (ownerId, AUTH_SECRET) every time, so running
 * it twice prints the same links and losing the output costs nothing.
 */
import "./_env.js";
import { claimUrl, authSecret } from "../lib/auth/seat.js";
import { activeLeagueId, getLeagueProvider } from "../lib/providers/index.js";
async function main() {
  const secret = authSecret();
  if (!secret) {
    console.error(
      "AUTH_SECRET is not set, so there is nothing to sign with and no seats to hand out.\n" +
        "Parquet is in single-user mode: everyone who opens it can already write as whoever\n" +
        "they are viewing. Set AUTH_SECRET to any long random string (and redeploy) to turn\n" +
        "multi-user mode on, then run this again.",
    );
    process.exitCode = 1;
    return;
  }
  // Default to local dev, because that is where this is run before the first deploy.
  const origin =
    process.argv[2] ?? process.env.PARQUET_ORIGIN ?? "http://localhost:3000";
  const provider = getLeagueProvider();
  const leagueId = activeLeagueId();
  const [users, rosters] = await Promise.all([
    provider.getUsers(leagueId),
    provider.getRosters(leagueId),
  ]);
  const byId = new Map(users.map((u) => [u.userId, u]));
  const managers = rosters
    .filter((r) => !!r.ownerId)
    .map((r) => ({
      ownerId: r.ownerId,
      displayName: byId.get(r.ownerId)?.displayName ?? r.ownerId,
      teamName: byId.get(r.ownerId)?.teamName ?? null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  console.log(`\nClaim links for ${managers.length} managers (${origin})\n`);
  console.log(
    "Send each manager THEIR OWN link and no one else's. A link is a key: whoever\n" +
      "holds it holds that seat until AUTH_SECRET is rotated.\n",
  );
  for (const m of managers) {
    const label = m.teamName
      ? `${m.displayName} (${m.teamName})`
      : m.displayName;
    console.log(label);
    console.log(`  ${claimUrl(m.ownerId, secret, origin)}\n`);
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
