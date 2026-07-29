import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { invalidateHistory } from "@/lib/history";

export const dynamic = "force-dynamic";

const Body = z.object({
  transactionId: z.string().min(1),
  reasoning: z.string().min(1).max(4000),
  posture: z.string().max(40).nullish(),
});

export async function POST(req: Request) {
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
  try {
    const saved = await prisma.annotation.upsert({
      where: { transactionId },
      create: { transactionId, reasoning, posture: posture ?? null },
      update: { reasoning, posture: posture ?? null },
    });
    invalidateHistory();
    return NextResponse.json({ ok: true, persisted: true, annotation: saved });
  } catch {
    // No database configured (e.g. Vercel without Postgres). Don't error the UI.
    return NextResponse.json(
      {
        ok: true,
        persisted: false,
        message:
          "Saved for this session, but not persisted - connect a database (set DATABASE_URL to a Postgres store) to keep annotations.",
      },
      { status: 200 },
    );
  }
}

export async function GET() {
  try {
    const all = await prisma.annotation.findMany({ orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ annotations: all });
  } catch {
    return NextResponse.json({ annotations: [] });
  }
}
