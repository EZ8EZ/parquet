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
    include: ["**/*.test.js", "**/*.test.jsx"],
    // e2e/ holds Playwright specs (*.spec.ts) - the include glob above already
    // wouldn't match that naming, but this is belt-and-suspenders: Playwright
    // specs must never run under vitest's node environment (no browser, no
    // webServer), so the directory is excluded outright rather than relying on
    // naming convention alone.
    // `.claude/worktrees/` holds whole checkouts of this repo, node_modules and all,
    // for agents working in isolation. Vitest's include glob walked straight into
    // them and ran third-party package test suites - 56 failures and 9 uncaught
    // exceptions from `tsconfig-paths`, none of them this project's code, and enough
    // noise to hide a real regression completely. Nothing under there is source. The
    // eslint config carries the same exclusion for the same reason.
    exclude: ["node_modules", ".next", "e2e", ".claude"],
    // Tests must NEVER touch the network. The app defaults to the live Sleeper
    // provider (so a zero-config deploy serves the real league), so the suite has to
    // pin the synthetic provider explicitly - otherwise any test that reaches a
    // provider silently starts making HTTP calls and becomes slow and flaky.
    env: {
      LEAGUE_PROVIDER: "fixture",
      DATABASE_URL: "file:./test-should-not-need-a-db.db",
    },
    // Informational only - no threshold gate. There's no established baseline yet
    // (this project has real UI test coverage via e2e instead of unit tests for
    // components - see D81's own note that 29 of 32 components carry no unit
    // test on purpose, since the Playwright suite is what actually renders them).
    // A coverage number here is a useful signal to look at, not a merge gate to
    // chase for its own sake.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["node_modules", ".next", "e2e", ".claude", "scripts", "**/*.test.js"],
    },
  },
});
