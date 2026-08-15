/**
 * `pnpm seed` — seed one demo Decision Ledger annotation so the revealed-vs-stated
 * feature has signal on first run. Only applies to the fixture corpus (the trade
 * id is fixture-specific). Idempotent. Safe to skip for real Sleeper data.
 */
import "./_env";
async function main() {
  const { providerName } = await import("../lib/providers");
  if (providerName() !== "fixture") {
    console.log("Seed skipped: only seeds the fixture corpus.");
    return;
  }
  const { ingestAll } = await import("../lib/ingest");
  const { prisma } = await import("../lib/db");
  await ingestAll({ log: () => {} });
  // The 2022 rebuild trade — user's STATED strategy at the moment of conviction.
  // Authored by "u1", the fixture's own EZ8 seat (see providers/fixture/generate.ts
  // and history.ts's FIXTURE_SEED_ANNOTATIONS, which this mirrors).
  const demo = {
    transactionId: "fx-2022-rebuildA",
    ownerId: "u1",
    reasoning:
      "Full rebuild. I'm getting younger and stockpiling first-round picks. " +
      "Not chasing wins for the next 2-3 years - the goal is a young core that " +
      "peaks together. Moving every veteran who isn't part of the future.",
    posture: "rebuild",
  };
  const exists = await prisma.ingestedTransaction.findUnique({
    where: { transactionId: demo.transactionId },
  });
  if (!exists) {
    console.log(
      "Seed note: rebuild trade not found in corpus (non-fixture data?). Skipping.",
    );
    return;
  }
  await prisma.annotation.upsert({
    where: {
      transactionId_ownerId: {
        transactionId: demo.transactionId,
        ownerId: demo.ownerId,
      },
    },
    create: demo,
    update: { reasoning: demo.reasoning, posture: demo.posture },
  });
  console.log("Seeded demo annotation on fx-2022-rebuildA (stated: rebuild).");
  console.log(
    "The 2025 win-now pivot (fx-2025-pivot) is left UNannotated on purpose —",
  );
  console.log(
    "it drives the 'unannotated decisions' badge and the contradiction.",
  );
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
