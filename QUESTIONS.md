# QUESTIONS.md — Things only Eric can answer

Numbered. None of these block v1 — reasonable defaults were chosen and logged in
DECISIONS.md. This is the decision queue for when Eric is back.

1. **League confirmed on Sleeper.** EZ8 → user_id `882695796544577536`, league
   "NSL Fantasy Hoops", full 5-season chain (2022–2026), `league_id`
   `1347007735815766016`. No Fantrax fallback needed. ✅ (No action; FYI.)

2. **Which roster is yours?** The app currently identifies "you" by matching
   `owner_id` to the resolved user_id. Confirm your team name/roster_id so the
   home screen "you vs them" framing is right if co-owners exist.

3. **Player headshots.** `NEXT_PUBLIC_USE_PLAYER_PHOTOS` defaults false (monogram
   avatars). NBA/Getty headshots aren't licensed for redistribution. Do you want
   real photos for personal local use only, and should we invest in background
   removal for the monogram fallback? (Deferred per brief.)

4. **Stats source upgrade.** v1 valuation uses Sleeper `search_rank` + age/role.
   Do you want to wire balldontlie.io (free tier) for real per-game production to
   sharpen values? It's abstracted behind `StatsProvider`; a drop-in swap.

5. **Scoring is a points league** (pts 0.5, reb 1, ast 1, stl/blk 2, TO -1, 3PM
   0.5, DD +1, TD +2, 40/50-pt bonuses, technical/flagrant -2). The valuation
   weights positional scarcity off this. Confirm these are current for 2026 —
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
