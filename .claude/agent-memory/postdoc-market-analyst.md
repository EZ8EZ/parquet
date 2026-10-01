# postdoc-market-analyst - memory

Lessons from past tasks, newest first. Read before starting; append when done.

## 2026-10-01
- Sleeper /projections/nba/regular/{season} snapshots 2021-2025: the ADP fields are preseason point-in-time, but the per-game STAT LINES are the realized season (rho 0.99) - a hindsight leak. Never use historical projection lines as predictors.
- search_rank on /players/nba is adp_std (redraft ADP) rounded; Spearman 1.000 for on-team players.
- Dynasty ADP does not beat redraft ADP on 1-5 season production; the log-space blend w_dyn=0.45 beats both. Report what you measured as production, not price.
- /stats bonus_pt_40p/50p are a 0/1 artefact; /stats blobs include TEAM_XXX pseudo-ids - drop non-numeric ids.
- Cost note: the full Q1-Q5 study ran ~307k tokens over ~18 min. Worth it - it changed the shipped design.
