#!/usr/bin/env node
// Ensures a Next dev server is reachable, starting one if needed. Prints its base
// URL to stdout on the LAST line so callers can `$(node ensure-server.mjs)`.
//
// Next 16 refuses a second `next dev` for the same directory even on a different
// port (see e2e/constants.ts), so this always reuses whatever is already up on
// the requested port rather than trying to spawn a redundant one.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const port = process.argv[2] || process.env.VISUAL_REVIEW_PORT || "3200";
const base = `http://localhost:${port}`;
const fixture = process.argv.includes("--fixture");

async function up() {
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(1500) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  if (await up()) {
    console.error(`[ensure-server] reusing server already up on ${base}`);
    console.log(base);
    return;
  }

  console.error(`[ensure-server] starting next dev on ${port}${fixture ? " (fixture provider)" : ""}`);
  const env = { ...process.env };
  if (fixture) {
    env.LEAGUE_PROVIDER = "fixture";
    env.NEXT_PUBLIC_USE_PLAYER_PHOTOS = "false";
  }
  const child = spawn("pnpm", ["exec", "next", "dev", "-p", port], {
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();

  for (let i = 0; i < 60; i++) {
    if (await up()) {
      console.log(base);
      return;
    }
    await sleep(1000);
  }
  console.error(`[ensure-server] timed out waiting for ${base}`);
  process.exit(1);
}

main();
