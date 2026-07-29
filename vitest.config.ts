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
    exclude: ["node_modules", ".next"],
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
