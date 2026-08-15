/**
 * Minimal .env.local loader for standalone tsx scripts (the Next.js runtime loads
 * env automatically; a bare `tsx` process does not). Import this FIRST, before any
 * module that reads process.env (e.g. the Prisma client).
 */
import { readFileSync } from "node:fs";
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // file may not exist; that's fine
  }
}
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "file:./dev.db";
