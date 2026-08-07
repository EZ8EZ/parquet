import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // e2e/ holds Playwright specs (*.spec.ts) - the include glob above already
    // wouldn't match that naming, but this is belt-and-suspenders: Playwright
    // specs must never run under vitest's node environment (no browser, no
    // webServer), so the directory is excluded outright rather than relying on
    // naming convention alone.
    exclude: ["node_modules", ".next", "e2e"],
    // Tests must NEVER touch the network. The app defaults to the live Sleeper
    // provider (so a zero-config deploy serves the real league), so the suite has to
    // pin the synthetic provider explicitly - otherwise any test that reaches a
    // provider silently starts making HTTP calls and becomes slow and flaky.
    env: {
      LEAGUE_PROVIDER: "fixture",
      DATABASE_URL: "file:./test-should-not-need-a-db.db",
    },
  },
});
