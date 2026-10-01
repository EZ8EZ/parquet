#!/bin/sh
# Re-runnable: fetches Sleeper public data into ./data (skips files already present) then runs every analysis and merges results.json.
set -e
cd "$(dirname "$0")"
mkdir -p "${CALIB_DATA:-../data}"
node fetch.mjs
node q1q2.mjs > out_q1q2.txt
node q2b.mjs   > out_q2b.txt
node q1b.mjs   > out_q1b.txt
node q3pre.mjs > out_q3pre.txt
node q3.mjs    > out_q3.txt
node q3b.mjs   > out_q3b.txt
node q4.mjs    > out_q4.txt
node q5.mjs    > out_q5.txt
node drift.mjs > out_drift.txt
node merge.mjs
