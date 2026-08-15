import { NextResponse } from "next/server";
import { z } from "zod";
import { getLeagueHistory } from "@/lib/history";
import { runAnalyst } from "@/lib/analyst";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const Body = z.object({
  question: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(20)
    .optional(),
});
export async function POST(req) {
  let json;
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
  const result = await runAnalyst(
    h,
    parsed.data.question,
    parsed.data.history ?? [],
  );
  return NextResponse.json(result);
}
