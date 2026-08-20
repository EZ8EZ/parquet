/**
 * Prisma client singleton. Guards against exhausting connections during Next.js
 * hot-reload in dev by caching on globalThis.
 *
 * Prisma 7 requires an explicit driver adapter at construction time - the schema
 * no longer carries a `url` (see prisma/schema.prisma). The adapter is built from
 * `DATABASE_URL` even when it is unset: constructing `PrismaPg` with an undefined
 * connection string does not throw, so D18's "no database configured" mode still
 * degrades on the first real query rather than on module load.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalForPrisma = globalThis;
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
/**
 * IS THERE A DATABASE AT ALL - the question every write path has to ask FIRST.
 *
 * D18 makes the database optional, and the write paths honour that by degrading to
 * "saved for this session, but not persisted" rather than erroring. The trap, and it
 * cost a real user a real note in production, is doing that in a `catch`: a catch
 * cannot tell "there is no database here" from "the database said no". Both arrive
 * as a thrown Prisma error, and reporting the second one as the first tells someone
 * their reasoning was safely captured while it is being discarded.
 *
 * So the two are separated by asking BEFORE the query rather than interpreting after
 * it. An absent `DATABASE_URL` is a configuration fact, knowable with certainty and
 * with no round trip; anything that goes wrong once a URL exists is a genuine failure
 * and must be reported as one.
 */
/** @returns {boolean} whether `DATABASE_URL` is set to a non-empty value */
export function databaseConfigured() {
  const raw = process.env.DATABASE_URL;
  return typeof raw === "string" && raw.trim().length > 0;
}
/**
 * @typedef {Object} DbErrorDescription
 * @property {string|null} code Prisma/Postgres error code, if one was present
 * @property {string} message
 */
/**
 * Pull the diagnosable bits out of whatever Prisma threw.
 *
 * Deliberately duck-typed rather than `instanceof PrismaClientKnownRequestError`:
 * the errors that matter most here are the ones we did NOT anticipate (the incident
 * that prompted this was SQLSTATE 42P10, raised by Postgres itself when an upsert's
 * ON CONFLICT target no longer matched any unique index), and narrowing by class
 * would drop exactly those into an "unknown error" bucket with nothing to diagnose.
 * @param {unknown} err
 * @returns {DbErrorDescription}
 */
export function describeDbError(err) {
  const e = /** @type {{ code?: unknown, meta?: { code?: unknown }, message?: unknown }} */ (
    err
  );
  const code =
    typeof e?.code === "string"
      ? e.code
      : typeof e?.meta?.code === "string"
        ? e.meta.code
        : null;
  const message =
    typeof e?.message === "string" && e.message.length > 0
      ? e.message
      : String(err);
  return { code, message };
}
