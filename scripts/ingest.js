/**
 * `pnpm ingest` — full historical pull, idempotent. Safe to re-run.
 * Usage: pnpm ingest [leagueId]
 */
import "./_env";
async function main() {
  const { ingestAll } = await import("../lib/ingest");
  const leagueId = process.argv[2];
  const started = Date.now();
  const summary = await ingestAll({
    leagueId,
    log: (m) => console.log(m),
  });
  console.log("\n─── Ingest complete ───");
  console.log(`Provider:          ${summary.provider}`);
  console.log(`League:            ${summary.leagueId}`);
  console.log(`Seasons:           ${summary.seasons.join(", ")}`);
  console.log(`Transactions:      ${summary.totalTransactions}`);
  console.log(`New this run:       ${summary.newTransactions}`);
  console.log(`Players:           ${summary.players}`);
  console.log(
    `Elapsed:           ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Ingest failed:", e);
    process.exit(1);
  });
