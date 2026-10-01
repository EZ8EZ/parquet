#!/bin/sh
# Reproduce. Network steps (sports-reference <=12 req/min, 5s sleeps) are cached in raw/.
# 1 raw pulls: Sleeper players/stats/projections, BBRef draft pages 2020-26, CBB season index + school-year pages, Wikipedia draft pages
#   (curl commands were run inline; see fetch_cbb.py for the CBB crawler)
python3 parse_draft.py            # BBRef draft pages -> draft_raw.json
python3 match_sleeper.py          # name match -> draft_sleeper.json (+games cross-check)
python3 fetch_cbb.py gonzaga:2020 # CBB school-year pages (cached)
.venv/bin/python build_dataset.py # -> dataset.json / dataset.csv
.venv/bin/python analysis.py && .venv/bin/python analysis2.py && .venv/bin/python analysis3.py && .venv/bin/python analysis4.py   # -> results.json
