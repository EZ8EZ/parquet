-- Baseline migration, added retroactively during the architecture/backend audit
-- (DECISIONS.md, "the architecture/backend health check" entry).
--
-- WHY THIS EXISTS. `prisma/migrations/` held exactly one migration
-- (20260807171323_annotation_author), an ALTER TABLE against an `Annotation` table
-- it assumed already existed. It did, in the real deployed database - but not
-- because any migration created it. This app's actual deploy path is `prisma db
-- push` (see `db:push` / `setup` in package.json), which syncs the schema directly
-- and writes no migration history, no `_prisma_migrations` row. So the one migration
-- file that DID exist was an island: verified against a real local Postgres 16
-- instance, `prisma migrate deploy` against a genuinely empty database failed with
-- `relation "Annotation" does not exist" (SQLSTATE 42P01) trying to apply it, and
-- `prisma migrate status` reported the migration as "not yet applied" even against
-- a database that `db push` had already brought fully in sync with schema.prisma -
-- the content was right, the bookkeeping was not.
--
-- This migration reconstructs the schema as it stood immediately BEFORE the
-- ownerId column existed (all four tables, `Annotation` with only the original
-- `transactionId` unique constraint) - generated via
-- `prisma migrate diff --from-empty --to-schema-datamodel <pre-ownerId schema>
-- --script`, not hand-written, so the SQL matches Prisma's own conventions and the
-- index name (`Annotation_transactionId_key`) the next migration's `DROP INDEX`
-- already depends on. Applying this one and then `annotation_author` in order now
-- reproduces the exact schema `db push` already produces - verified by diffing a
-- freshly `migrate deploy`'d database against a freshly `db push`'d one (see the
-- DECISIONS.md entry for the exact command and the "0 differences" result).
--
-- THIS DOES NOT TOUCH THE LIVE DATABASE. Since it was built by `db push`, it has no
-- `_prisma_migrations` table and will not retroactively believe it ran these
-- migrations just because this file now exists. Adopting `migrate deploy` against
-- that database (if that is ever wanted) needs one manual, one-time step first:
-- `prisma migrate resolve --applied 20260807171300_init` then
-- `prisma migrate resolve --applied 20260807171323_annotation_author`, which marks
-- both as already-applied without re-running their SQL against a database that
-- already has the columns and indexes they would have created. `db push` remains
-- the sanctioned path for this app either way (package.json never calls `migrate
-- deploy`); this migration exists so the migration HISTORY is honest and
-- replayable from empty, not so the deploy mechanism changes.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "posture" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestedTransaction" (
    "transactionId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "createdMs" BIGINT NOT NULL,
    "creator" TEXT,
    "payload" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestedTransaction_pkey" PRIMARY KEY ("transactionId")
);

-- CreateTable
CREATE TABLE "PlayerCacheEntry" (
    "playerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT,
    "team" TEXT,
    "age" INTEGER,
    "searchRank" INTEGER,
    "payload" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerCacheEntry_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "Meta" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Annotation_transactionId_key" ON "Annotation"("transactionId");

-- CreateIndex
CREATE INDEX "IngestedTransaction_season_idx" ON "IngestedTransaction"("season");

-- CreateIndex
CREATE INDEX "IngestedTransaction_type_idx" ON "IngestedTransaction"("type");
