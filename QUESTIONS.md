# QUESTIONS.md - Things only Eric can answer

Numbered. None of these block v1 - reasonable defaults were chosen and logged in
DECISIONS.md. This is the decision queue for when Eric is back.

1. **League confirmed on Sleeper.** EZ8 → user_id `882695796544577536`, league
   "NSL Fantasy Hoops", full 5-season chain (2022-2026), `league_id`
   `1347007735815766016`. No a no-API platform fallback needed. ✅ (No action; FYI.)

2. **Which roster is yours?** The app currently identifies "you" by matching
   `owner_id` to the resolved user_id. Confirm your team name/roster_id so the
   home screen "you vs them" framing is right if co-owners exist.

3. **Player headshots.** `NEXT_PUBLIC_USE_PLAYER_PHOTOS` defaults false (monogram
   avatars). NBA/Getty headshots aren't licensed for redistribution. Do you want
   real photos for personal local use only, and should we invest in background
   removal for the monogram fallback? (Deferred per brief.)

4. **Stats source upgrade.** v1 valuation uses Sleeper `search_rank` + age/role.
   Do you want to wire a free external stats API (free tier) for real per-game production to
   sharpen values? It's abstracted behind `StatsProvider`; a drop-in swap.

5. **Scoring is a points league** (pts 0.5, reb 1, ast 1, stl/blk 2, TO -1, 3PM
   0.5, DD +1, TD +2, 40/50-pt bonuses, technical/flagrant -2). The valuation
   weights positional scarcity off this. Confirm these are current for 2026 -
   they're read live from the league object each ingest, so they self-correct.

6. **Anthropic API key.** Set `ANTHROPIC_API_KEY` to enable the conversational
   analyst. Without it the analyst degrades to a deterministic rules summary.
   Which model do you want it on? (Default: latest Sonnet for cost; Opus available.)

7. **Deployment target.** Ready for Vercel. Postgres swap is one env var + one
   schema line. Do you want a hosted Postgres (Vercel Postgres / Neon) provisioned,
   or keep it local SQLite for now?

8. **Notable non-trade decisions.** The ledger auto-prompts on trades. Should it
   also prompt on big waiver claims (FAAB over some threshold) and drops of
   rostered starters? Default: trades + FAAB claims above the league-median bid.

## 9. Lottery odds: flat or weighted by record? (MATERIAL to pick values)
Confirmed with Eric: all non-playoff teams are lottery-eligible, then reverse standings
order, champion picks last. With 8 of 14 making the playoffs that means picks 1-6 are
lottery and 7-14 are the playoff teams in reverse order.

What is NOT confirmed is the ODDS. The model currently assumes FLAT odds
(`pick.lotteryWeighting: 0`), which has one consequence worth knowing: under flat odds
every lottery team's first is worth exactly the same, because they all share the same
distribution. Finishing dead last buys you nothing over finishing 9th.

If the lottery is weighted toward the worst record, set `lotteryWeighting` above 0 and
the worst team's first becomes the most valuable pick in the league. This is a real
fork in how rebuilding is valued, so it is worth answering.

## 10. Lock-in scoring is not yet reflected in the valuation model
Eric confirmed this is a LOCK-IN league, not a traditional weekly-total league
(`game_mode: 1` in the league settings, which the app can detect).

That should change valuation, and currently does not:
- Lock-in rewards GAMES PLAYED volume and availability, so durability and schedule
  matter more than in a weekly-total format.
- Roster DEPTH is worth more, because you need bodies playing on any given night. The
  current rank decay (`rankDecay: 0.021`) is arguably too steep in the tail for a
  lock-in league: it prices the ~200th-ranked player at roughly 150 against 10,000 for
  the top asset.

This is deliberately NOT tuned by guesswork. Doing it properly needs per-player
games-played and minutes data, which is exactly the gap the `StatsProvider` interface
exists to fill (see #4). Tuning `rankDecay` by feel would be a fake fix that made the
numbers look considered while resting on nothing.

## 11. Ranking sources and custom rankings (Eric's idea, worth building)
Eric proposed ingesting ranking sources plus letting the user build their OWN ranking,
compare it against consensus, and have the difference feed back into values. The model
is well positioned for this: player value already keys off a single rank input, so a
rank override map is a small change rather than a rewrite. Open questions: which public
sources are acceptable to use, and whether a user ranking should REPLACE consensus or be
blended with it (blending is the more defensible default, with the weight exposed).
