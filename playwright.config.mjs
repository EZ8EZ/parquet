import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, E2E_PORT } from "./e2e/constants.js";
/**
 * PLAYWRIGHT E2E CONFIG - mobile-first smoke coverage against the fixture provider.
 *
 * 390x844 is the design viewport (see DESIGN.md / README.md) and the only project
 * here: a desktop-only E2E suite on a mobile-first app would be testing a layout
 * nobody actually uses. Base device is Chromium's "Pixel 7" (mobile UA, touch,
 * `isMobile`) with the viewport pinned to exactly 390x844 rather than that device's
 * own 412x839, so this always matches the app's stated design viewport regardless
 * of how Playwright's device list drifts.
 *
 * The dev server this drives is hermetic on purpose, mirroring
 * .github/workflows/ci.yml's `build` job:
 *   - LEAGUE_PROVIDER=fixture needs no network and no league credentials.
 *   - DATABASE_URL is a syntactically valid placeholder Prisma never dials at
 *     runtime (annotation reads/writes degrade to "not persisted" without a real
 *     one - see app/api/annotations/route.ts - so the suite never needs a database).
 *   - NEXT_PUBLIC_USE_PLAYER_PHOTOS is forced off so nothing in the suite depends on
 *     Sleeper's CDN. LLM_BASE_URL/LLM_API_KEY were pinned empty here for the same
 *     reason until /analyst was shelved (SHELVED.md, S7); the app makes no outbound
 *     LLM call from anywhere now, so there is nothing left to pin off.
 * It runs on its own port (3199), distinct from a developer's own `next dev` on
 * 3000, so this suite never fights a manually-running server for the port.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${E2E_PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    env: {
      LEAGUE_PROVIDER: "fixture",
      // Placeholder only - prisma reads the datasource url but this suite never
      // dials it (see the header comment above).
      DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci",
      NEXT_PUBLIC_USE_PLAYER_PHOTOS: "false",
    },
  },
});
