-- Second gap found by the same audit (see the 20260807171300_init migration's own
-- header, and the DECISIONS.md entry): `schema.prisma` already carried
-- `@@index([createdAt])` on `Annotation`, and the real database (kept in sync by
-- `db push`, not by any migration) already had it - but no migration file had ever
-- recorded it. `prisma migrate diff` against a database built from the two prior
-- migrations found exactly this one statement of drift and nothing else, which is
-- the index this migration adds.

-- CreateIndex
CREATE INDEX "Annotation_createdAt_idx" ON "Annotation"("createdAt");
