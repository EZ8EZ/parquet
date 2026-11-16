/**
 * LINEUP SNAPSHOTS - capture the current week's lock-in lineups, because Sleeper does
 * not keep them.
 *
 *   node scripts/snapshot-lineups.js
 *
 * Sleeper's API exposes neither lock state nor mid-week lineup changes in lock-in mode,
 * and neither can be recovered later. Whether managers rotate starters mid-week is the
 * open question in the lock/hold backtest, and only periodic copies of
 * `GET /v1/league/{id}/matchups/{week}` can answer it. This script takes one such copy.
 * It is run hourly by .github/workflows/snapshot-lineups.yml on a `data` branch;
 * nothing in the app reads these files yet.
 *
 * What it does:
 *  1. week and season from `GET /v1/state/nba`;
 *  2. that week's matchups for the league (one request, ~8 KB, every roster);
 *  3. writes `{dir}/{season}/week-{NN}/{timestamp}.json` with the raw payload plus
 *     `fetchedAt`, `season`, `week`, `leagueId`, unless the payload is identical to the
 *     most recent snapshot for that week (quiet hours produce no file).
 *
 * Exit codes: 0 = wrote a file, skipped an identical payload, or out of season (no
 * matchups); 1 = HTTP failure or a payload that does not match the expected shape.
 * Writes go to a temp file and are renamed into place, so a failure never leaves a
 * partial snapshot.
 *
 * Env: SLEEPER_LEAGUE_ID (default: the app's own default, lib/providers/defaults.js),
 * SNAPSHOT_DIR (default `snapshots/lineups`), SNAPSHOT_WEEK (override the state week).
 *
 * Plain node 22: global fetch, no dependencies, so the workflow needs no install.
 * Timestamps are ISO 8601 basic format (20261116T014500Z): sortable, and free of the
 * colons that some filesystems refuse.
 */
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_SLEEPER_LEAGUE_ID } from "../lib/providers/defaults.js";

const API = "https://api.sleeper.app/v1";
const TIMEOUT_MS = 15_000;

export class SnapshotError extends Error {}

/** `2026-11-16T01:45:00.123Z` -> `20261116T014500Z` */
export function stampOf(date) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
}

/** Directory for one week's snapshots. */
export function weekDir(root, season, week) {
  return join(root, String(season), `week-${String(week).padStart(2, "0")}`);
}

/** Full path of one snapshot file. */
export function snapshotPath(root, season, week, date) {
  return join(weekDir(root, season, week), `${stampOf(date)}.json`);
}

/**
 * The matchups payload, checked for the fields the backtest depends on. Sleeper returns
 * `null` or `[]` for a week that does not exist; both mean "nothing to snapshot".
 * @returns {Array<object>|null} null when there are no matchups
 */
export function validateMatchups(json) {
  if (json == null) return null;
  if (!Array.isArray(json)) throw new SnapshotError("matchups payload is not an array");
  if (json.length === 0) return null;
  json.forEach((m, i) => {
    const where = `matchups[${i}]`;
    if (m === null || typeof m !== "object") throw new SnapshotError(`${where} is not an object`);
    if (typeof m.roster_id !== "number") throw new SnapshotError(`${where}.roster_id is not a number`);
    for (const key of ["starters", "players"]) {
      const v = m[key];
      if (v != null && !(Array.isArray(v) && v.every((x) => typeof x === "string")))
        throw new SnapshotError(`${where}.${key} is not an array of player ids`);
    }
    const sp = m.starters_points;
    if (sp != null && !(Array.isArray(sp) && sp.every((x) => typeof x === "number")))
      throw new SnapshotError(`${where}.starters_points is not an array of numbers`);
  });
  return json;
}

/** The state endpoint's week and season. */
export function validateState(json) {
  if (!json || typeof json !== "object") throw new SnapshotError("state payload is not an object");
  const week = Number(json.week);
  const season = json.season;
  if (!Number.isInteger(week)) throw new SnapshotError("state.week is not an integer");
  if (typeof season !== "string" || !/^\d{4}$/.test(season))
    throw new SnapshotError("state.season is not a year");
  return { week, season, seasonType: json.season_type ?? null };
}

/** Most recent snapshot file in a week directory, or null. */
export function latestSnapshot(dir) {
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return null;
  }
  if (!names.length) return null;
  names.sort();
  return join(dir, names[names.length - 1]);
}

/** True when `payload` equals the payload stored in `file` (serialized byte for byte). */
export function sameAsSnapshot(file, payload) {
  if (!file) return false;
  try {
    const prev = JSON.parse(readFileSync(file, "utf8"));
    return JSON.stringify(prev.payload) === JSON.stringify(payload);
  } catch {
    return false; // unreadable previous file: write a fresh one rather than skip
  }
}

/** Write atomically: temp file in the same directory, then rename. */
export function writeSnapshot(path, record) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n");
  renameSync(tmp, path);
}

async function getJson(fetchImpl, url) {
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new SnapshotError(`${url}: request failed (${err?.name ?? "error"}: ${err?.message ?? err})`);
  }
  if (!res.ok) throw new SnapshotError(`${url}: HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new SnapshotError(`${url}: response is not JSON`);
  }
}

/**
 * One snapshot run. Returns what happened; throws SnapshotError on failure.
 * @returns {Promise<{ status: "written"|"identical"|"no-matchups", path?: string, season?: string, week?: number }>}
 */
export async function snapshot({
  leagueId = process.env.SLEEPER_LEAGUE_ID || DEFAULT_SLEEPER_LEAGUE_ID,
  root = process.env.SNAPSHOT_DIR || "snapshots/lineups",
  weekOverride = process.env.SNAPSHOT_WEEK,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const state = validateState(await getJson(fetchImpl, `${API}/state/nba`));
  const week = weekOverride ? Number(weekOverride) : state.week;
  if (!(week >= 1)) return { status: "no-matchups", season: state.season, week };
  const payload = validateMatchups(
    await getJson(fetchImpl, `${API}/league/${leagueId}/matchups/${week}`),
  );
  if (!payload) return { status: "no-matchups", season: state.season, week };
  const dir = weekDir(root, state.season, week);
  if (sameAsSnapshot(latestSnapshot(dir), payload))
    return { status: "identical", season: state.season, week };
  mkdirSync(dir, { recursive: true });
  const fetchedAt = now();
  const path = snapshotPath(root, state.season, week, fetchedAt);
  writeSnapshot(path, {
    fetchedAt: fetchedAt.toISOString(),
    season: state.season,
    week,
    leagueId,
    payload,
  });
  return { status: "written", path, season: state.season, week };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  snapshot().then(
    (r) => {
      if (r.status === "written") console.log(`wrote ${r.path}`);
      else if (r.status === "identical")
        console.log(`unchanged since the last snapshot of ${r.season} week ${r.week}; nothing written`);
      else console.log(`no matchups for ${r.season} week ${r.week}; nothing written`);
    },
    (err) => {
      console.error(`snapshot-lineups: ${err instanceof SnapshotError ? err.message : err?.stack ?? err}`);
      process.exit(1);
    },
  );
}
