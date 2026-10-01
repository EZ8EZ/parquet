# Product review - 2026-10-01, the morning after the rookie draft

A read of Parquet the way someone who has shipped consumer fantasy product would read it:
by the moment a manager is in, what decision they are making, and whether the app hands
them the number that decides it. Walked live as 5-Year Plan (roster 6) at 390px.

## The one-line verdict

Parquet is a superb **archive** and a weak **assistant**. It remembers everything and
measures honestly, but on the day it matters most - three weeks before tip-off, rookie
draft just finished, rosters over the limit - its front page talks about how many waiver
moves you made in 2024. The numbers were also quietly wrong where it hurt most (rookies),
which turned honest prose into bad advice. Today's work fixed the second problem and
started on the first.

## What a dynasty manager actually does, by moment

| Moment | The decision | The number that decides it | Where Parquet was | Now |
|---|---|---|---|---|
| Rookie draft just ended | Who do I cut, who goes to taxi? | Roster count vs limit; value of my bottom 3; taxi eligibility | Nowhere | **Before tip-off** panel on Home (when relevant) and /roster |
| Same week | Who will other teams have to drop? | Likely releases league-wide | Nowhere | Same panel: "Likely to hit waivers" |
| Same week | Did my draft go well? | Value over slot, against the market | Hindsight grades only | **The class, valued today** on /drafts/2026 |
| Any time | Is my rookie worth keeping / selling? | His price, on the right market | Priced off the redraft board: the 1.07 was worth 222 and /plan said cut him | Market blend + NBA draft capital (D116/D118) |
| Trade offer arrives | Is 3-for-1 good for me? | A value curve with the right convexity | Curve 2x too flat at the top - depth always "won" | Measured curve (D117): #10 vs two #30s ~ even |
| Trade window | Who do I call? | Partner need x my surplus x their window | Trade finder (good) | Unchanged; benefits from the fixed values |
| Deadline / playoffs | Buy or sell? | Window + fragility | /plan + RFI (good bones) | Unchanged |

## What was wrong, ranked by damage

1. **The price anchor.** Every value descended from `search_rank`, which is Sleeper's
   *redraft* ADP. Rookies and young players were systematically underpriced, vets over.
   That one input produced the worst advice in the app: "cut Keaton Wagler" and "package
   Darryn Peterson for a star" to a 5-15 rebuild. Fixed: D116 (measured dynasty/redraft
   blend), D118 (NBA draft capital for rookies; college stats measured and excluded).
2. **Spent picks still counted.** After the draft, used 2026 picks stayed on the books as
   11.7k of "pick capital", inflating totals, power ranks, TCI and the trade evaluator.
   Fixed: D115.
3. **The value curve's shape.** Too flat at the head and the tail, so every
   consolidation looked like a loss and depth looked like value. Fixed: D117.
4. **Hand-set pick curve.** Overpriced everything from about the 1.05 down (2-5x in
   rounds 2-3). Fixed: measured draft-night conversion curve (D116/D117).
5. **No present tense.** Home, /roster and /plan describe the past and the long run; none
   of them knew the season starts in three weeks or that the roster is over the limit.
   Partly fixed: the Before tip-off panel. See "Next" below.
6. **Absolute thresholds on a moving scale.** "Star" = 4500, "dead weight" = 250 would
   have silently changed meaning with any recalibration. Fixed: rank-anchored (D116).

## What is genuinely good - keep it

- The refusal to grade and the published methodology. Users trust a number they can
  argue with; this is the differentiator versus every trade calculator.
- Stated vs revealed strategy, the ledger, dossiers. Nobody else has these.
- /plan's numbered moves with a stated cost, and the trade finder's grouping.
- The editorial voice. It just needs to sit on top of a decision, not instead of one.

## Next, ranked (each is shippable on its own)

1. **Home leads with an action queue in season-phase order** - at most three cards, each a
   decision with its number and its tap target: roster crunch before lock; taxi moves
   before the taxi deadline (week 4); trade window (from /plan's top move); waiver
   targets (likely releases). The behavioral numbers move below the fold. The calendar is
   all in league settings already (`taxi_deadline`, `trade_deadline`, `playoff_week_start`).
2. **Model vs market, as a list.** The app now carries both its own price and Sleeper's
   market ordinal for every player. The gap is the most actionable signal in dynasty:
   "Parquet is higher than the market on X (buy), lower on Y (sell)". A /values filter and
   a Home card. It is a measurement of disagreement, not a verdict, so it is D6-clean.
3. **Every value states what it is compared to.** On rows: tier + league rank + market
   rank, and the source (blend / dynasty / redraft) with an as-of date.
4. **Cut the long-scroll prose by half on /roster and /plan.** Lead each section with its
   one sentence and number; put the method behind "how this works". /roster is ~4k px;
   the decision content fits in the first 900.
5. **Trade evaluator: show the consolidation effect explicitly** - "you get the best
   player in the deal; on this curve that is worth +N" - now that the curve is right.
6. **Draft recap, frozen.** Snapshot values on draft night so "value over slot" stops
   drifting daily, and show both the frozen and today's numbers.
7. **Taxi deadline and IR relief in the crunch engine** (it counts, but does not yet know
   that taxi moves become impossible after week 4, or that an OUT player can free a spot).

## Open statistical work (not product, but it gates trust)

- Re-measure the 0.23 production weight against the blended anchor (measured against
  redraft only).
- Star-tier age adjustment is still keyed on the redraft rank.
- Snapshot `/projections/nba/regular/{season}` on a schedule to see ADP behaviour from June
  to September (one live file cannot show it).
- Next year's NBA draft row for the rookie prior (D118) has to be pasted after the draft.
