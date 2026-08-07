import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, describeDbError, prisma } from "@/lib/db";
import { getLeagueHistory, publishAnnotation, viewerAuthorId } from "@/lib/history";
import { readSeat, writeAuthorId } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const Body = z.object({
  transactionId: z.string().min(1),
  reasoning: z.string().min(1).max(4000),
  posture: z.string().max(40).nullish(),
});

/**
 * The one endpoint in this app that writes something PRIVATE, and therefore the one
 * that has to know who is asking rather than who is being looked at.
 *
 * It used to stamp `h.me.userId` - the "viewing as" lens, which is a non-httpOnly
 * cookie any reader can rewrite. That made the author field forgeable: flip the
 * cookie, write a note as a leaguemate, edit theirs while you were there. The stamp
 * now comes from the SIGNED seat instead (lib/auth/seat.ts), and the lens is not
 * consulted here at all.
 *
 * In legacy mode (no AUTH_SECRET) `writeAuthorId` returns the lens exactly as before,
 * so a single-user deploy is byte-for-byte unchanged and stays that way.
 */
export async function POST(req: Request) {
  // Seat first, corpus second: an unclaimed writer in multi-user mode should be
  // refused for the price of reading one cookie, not for the price of a league.
  const seat = await readSeat();
  if (seat.enforced && !seat.ownerId) {
    return NextResponse.json(
      {
        error: "no seat",
        message:
          "This browser has not claimed a seat, so it cannot write as anyone. Ask the commissioner for your claim link.",
      },
      { status: 401 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { transactionId, reasoning, posture } = parsed.data;

  const h = await getLeagueHistory();
  const ownerId = writeAuthorId(seat, h.me.userId);
  if (!ownerId) {
    return NextResponse.json({ error: "no seat" }, { status: 401 });
  }

  // THREE OUTCOMES, THREE ANSWERS. This route used to have two, and the missing one
  // lost a user's note in production: the catch below treated every database error as
  // "there is no database here", so when Postgres rejected an upsert whose ON CONFLICT
  // target no longer matched a unique index (SQLSTATE 42P10, after the composite
  // (transactionId, ownerId) index replaced the old transactionId-only one), the API
  // answered "saved for this session" and the reasoning was silently discarded. For an
  // app whose entire premise is capturing reasoning while you still remember it, that
  // is the worst failure available, and it must not be reachable by accident again.
  //
  //   no DATABASE_URL  -> expected, not an error. Ephemeral, and says so. HTTP 200.
  //   database refused -> a REAL failure. Says the note was not saved. HTTP 500.
  //   success          -> persisted.
  if (!databaseConfigured()) {
    return NextResponse.json(
      {
        ok: true,
        persisted: false,
        reason: "no-database",
        message:
          "Saved for this session, but not persisted - connect a database (set DATABASE_URL to a Postgres store) to keep annotations.",
      },
      { status: 200 },
    );
  }

  try {
    // The author is the seat holder - never guessed from the transaction itself,
    // since a trade has two sides and only one of them is writing this note, and
    // never taken from the lens, since the lens is not a credential.
    const saved = await prisma.annotation.upsert({
      where: { transactionId_ownerId: { transactionId, ownerId } },
      create: { transactionId, ownerId, reasoning, posture: posture ?? null },
      update: { reasoning, posture: posture ?? null },
    });
    // This used to be `invalidateHistory()`, which threw the entire corpus away to
    // publish one row: the next read re-ran `assembleCorpus` (~145 Sleeper requests,
    // D25's 1.4s budget) and minted a fresh `players` Map, which misses lib/valuation's
    // WeakMap and revalues the whole league. The saved row is now applied to the cached
    // corpus instead, so everything Sleeper owns keeps its TTL and one note costs one
    // `Map.set`. See `publishAnnotation` for why mutating in place is safe rather than
    // merely cheap, and for what it deliberately does NOT reach. Awaited rather than
    // fired and forgotten, so the note is in the cache before the response goes out.
    await publishAnnotation({
      transactionId: saved.transactionId,
      ownerId: saved.ownerId,
      reasoning: saved.reasoning,
      posture: saved.posture,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    });
    return NextResponse.json({ ok: true, persisted: true, annotation: saved });
  } catch (err) {
    // Logged with the code AND the message, because the incident above was diagnosable
    // only from the driver's own text - a generic "db error" line would have told
    // whoever read it nothing they could act on.
    const failure = describeDbError(err);
    console.error(
      `[annotations] write REJECTED by the database (transactionId=${transactionId} ownerId=${ownerId} code=${failure.code ?? "none"}): ${failure.message}`,
    );
    return NextResponse.json(
      {
        ok: false,
        persisted: false,
        reason: "db-error",
        error: "database rejected the write",
        code: failure.code,
        message:
          "Your note was NOT saved. The database is configured but rejected the write, so nothing was recorded - copy your text somewhere safe before leaving this page.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    // Scoped to whoever this request may READ as, which in multi-user mode is the
    // seat and only while the lens agrees with it (see viewAuthorId). Not currently
    // called from the UI - the ledger reads through getLeagueHistory - but an
    // unscoped debug endpoint would otherwise be the one place in the app that still
    // hands back every manager's private reasoning.
    const h = await getLeagueHistory();
    const author = viewerAuthorId(h);
    if (!author) return NextResponse.json({ annotations: [] });
    // Same distinction the write path makes, for the same reason: "there is no
    // database" is an empty list, but "the database errored" answering with an empty
    // list would report someone's captured reasoning as never having existed.
    if (!databaseConfigured()) {
      return NextResponse.json({ annotations: [], persisted: false });
    }
    const mine = await prisma.annotation.findMany({
      where: { ownerId: author },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ annotations: mine });
  } catch (err) {
    const failure = describeDbError(err);
    console.error(
      `[annotations] read failed (code=${failure.code ?? "none"}): ${failure.message}`,
    );
    return NextResponse.json(
      { error: "database read failed", code: failure.code },
      { status: 500 },
    );
  }
}
