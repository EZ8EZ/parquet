/**
 * Prisma client singleton. Guards against exhausting connections during Next.js
 * hot-reload in dev by caching on globalThis.
 */
import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis;
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
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
export function databaseConfigured() {
  const raw = process.env.DATABASE_URL;
  return typeof raw === "string" && raw.trim().length > 0;
}
/**
 * Pull the diagnosable bits out of whatever Prisma threw.
 *
 * Deliberately duck-typed rather than `instanceof PrismaClientKnownRequestError`:
 * the errors that matter most here are the ones we did NOT anticipate (the incident
 * that prompted this was SQLSTATE 42P10, raised by Postgres itself when an upsert's
 * ON CONFLICT target no longer matched any unique index), and narrowing by class
 * would drop exactly those into an "unknown error" bucket with nothing to diagnose.
 */
export function describeDbError(err) {
  const e = err;
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
