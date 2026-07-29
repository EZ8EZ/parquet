import { NextResponse } from "next/server";
import { z } from "zod";
import { getLeagueHistory } from "@/lib/history";
import { evaluateTrade } from "@/lib/trade";

export const dynamic = "force-dynamic";

const Pick = z.object({ round: z.number().int(), season: z.string() });
const Side = z.object({
  playerIds: z.array(z.string()).default([]),
  picks: z.array(Pick).default([]),
});
const Body = z.object({ give: Side, get: Side });

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const h = await getLeagueHistory();
  const evaluation = evaluateTrade(h, parsed.data);
  return NextResponse.json(evaluation);
}
