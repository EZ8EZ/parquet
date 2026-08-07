-- Fixes a data-attribution bug: `Annotation` had no author column, so a note
-- captured under one manager's own team was indistinguishable from a note on the
-- OTHER side of the same trade (both share one Sleeper transactionId), and the
-- strategy engine attributed whichever one it found to whoever the viewer was
-- currently "viewing as". See DECISIONS.md D22 for why the durable identity is
-- the platform user id (ownerId / principal), never a roster id.

-- 1. Add the column nullable first so existing rows can be backfilled before the
--    NOT NULL constraint lands.
ALTER TABLE "Annotation" ADD COLUMN "ownerId" TEXT;

-- 2. Backfill existing rows.
--
--    Inspected live (2026-08-07): exactly two Annotation rows exist, transactionId
--    1302736887999401984 and 1297427526674575360. Both are trades on the real NSL
--    Fantasy Hoops league (leagueId 1347007735815766016) where roster 6 is a
--    participant, and roster 6's owner is Sleeper user 882695796544577536 (EZ8,
--    "5-Year Plan" - the app's DEFAULT_SLEEPER_USERNAME / operator account). This
--    app has never had an author column, so every existing row was captured by
--    whoever was using the ledger UI - there is no way today's data could contain a
--    row from anyone else, and both rows independently confirm the same owner.
--    This is a DATA-VERIFIED backfill, not a guess: it was reached by joining every
--    existing transactionId against the live Sleeper transaction feed and checking
--    trade participants, not by assuming EZ8 owns everything.
--
--    If a future run of this migration ever hits a DB where that join is NOT
--    unambiguous (rows on trades with no common participant, or a deployment with
--    more than one real author already in play), do not reuse this literal - back
--    it out and attribute case by case instead. Nothing about this statement makes
--    that determination automatically; it encodes a decision already verified by
--    hand for this one dataset.
UPDATE "Annotation"
SET "ownerId" = '882695796544577536'
WHERE "ownerId" IS NULL;

-- 3. Now required.
ALTER TABLE "Annotation" ALTER COLUMN "ownerId" SET NOT NULL;

-- 4. Swap the uniqueness constraint: was "one annotation per transaction, globally"
--    (wrong - a trade has two sides), now "one annotation per transaction PER
--    AUTHOR" (right - each side's reasoning is independent).
DROP INDEX "Annotation_transactionId_key";
CREATE UNIQUE INDEX "Annotation_transactionId_ownerId_key" ON "Annotation"("transactionId", "ownerId");

-- 5. Author lookups (scoping reads to "my own annotations") are now a normal
--    access path, not just an incidental join.
CREATE INDEX "Annotation_ownerId_idx" ON "Annotation"("ownerId");
