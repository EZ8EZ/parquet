import { NextResponse } from "next/server";
import { z } from "zod";
import { getLeagueHistory } from "@/lib/history";
import { isPickSeasonSpent } from "@/lib/picks";
import { evaluateTrade } from "@/lib/trade";
export const dynamic = "force-dynamic";
// originalRosterId is what lets the evaluator price a pick by WHO OWES IT
// ("2027 1st (via Old Man Ball)") instead of as a generic round; slot covers the
// case where the draft order is already set. Zod strips unknown keys, so these
// must be declared or the client's pick attribution silently disappears.
const Pick = z.object({
  round: z.number().int(),
  season: z.string(),
  originalRosterId: z.number().int().optional(),
  slot: z.number().int().optional(),
});
// Bounded the same way `custom-rank`'s own order array is (lib/rankings/customOrder.js)
// - no real trade in a 14-team league ever approaches this, so the cap only exists to
// stop a hand-crafted body from making `evaluateTrade` walk an arbitrarily large array.
const MAX_ASSETS_PER_SIDE = 64;
const Side = z.object({
  playerIds: z.array(z.string()).max(MAX_ASSETS_PER_SIDE).default([]),
  picks: z.array(Pick).max(MAX_ASSETS_PER_SIDE).default([]),
});
const Body = z.object({ give: Side, get: Side });
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
  // D115: a pick from a season whose rookie draft has already run is spent - it is a
  // player now. The builder no longer offers one (its pools come from `pickCapital`),
  // so this only catches a hand-built body; refuse it rather than price a dead asset.
  const spent = [...parsed.data.give.picks, ...parsed.data.get.picks].find(
    (p) => isPickSeasonSpent(h, p.season),
  );
  if (spent) {
    return NextResponse.json(
      {
        error: `the ${spent.season} rookie draft is complete - its picks were used and can no longer be traded`,
      },
      { status: 400 },
    );
  }
  const evaluation = evaluateTrade(h, parsed.data);
  return NextResponse.json(evaluation);
}
