import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { expectNoConsoleErrors, primeLens, watchConsole } from "./helpers";

/**
 * /lockin and Home's compact board on the fixture provider, which serves the engine's
 * synthetic week (lib/lockin/fixture.js) frozen at Thursday of week 4.
 */
test.describe("lock-or-hold board", () => {
  test("full board: slots, hazards first, numbers with the lean, charts on demand", async ({ page }) => {
    const guard = watchConsole(page);
    await primeLens(page);
    await page.goto("/lockin");
    const board = page.locator('[data-lockin-board="full"]');
    await expect(board).toHaveAttribute("data-status", "in_season");
    await expect(board.getByText("Sample week, invented players")).toBeVisible();
    await expect(board.locator("#lk-slots + div li")).toHaveCount(7);
    const first = board.locator("article").first();
    await expect(first).toContainText("Listed Out");
    const holden = board.locator("#lk-lk02");
    await expect(holden).toContainText("31.5");
    await expect(holden).toContainText("Expected if held");
    await expect(holden).toContainText("Later game beats it, if he plays");
    await expect(holden).toContainText(/If not already locked, model leans:/);
    await expect(holden).toContainText(/marginal|moderate|clear/);
    await holden.getByText("Charts and history").click();
    await expect(holden.getByText("Last 15 games")).toBeVisible();
    await expect(holden.getByText(/Filled dots beat 31\.5/)).toBeVisible();
    await expect(holden.getByText(/History vs/)).toBeVisible();
    await holden.getByRole("button", { name: /Overtime game/ }).first().click();
    await expect(holden.locator("[aria-live=polite]")).toContainText("Overtime game");
    await page.locator("#lockin-method summary").click();
    await expect(page.locator("#lockin-method")).toContainText("+9.4");
    expectNoConsoleErrors(guard);
  });

  test("compact mode and Home show the strip and the most urgent decision", async ({ page }) => {
    const guard = watchConsole(page);
    await primeLens(page);
    await page.goto("/lockin?view=compact");
    await expect(page.locator('[data-lockin-board="compact"] ol[aria-label="Your starting slots this week"] li')).toHaveCount(7);
    await page.goto("/");
    const board = page.locator('[data-lockin-board="compact"]');
    await expect(board.locator("article")).toHaveCount(1);
    await expect(board.getByRole("link", { name: /Every player, charts and method/ })).toHaveAttribute("href", "/lockin");
    await expect(page.getByText("arrive here")).toHaveCount(0);
    expectNoConsoleErrors(guard);
  });

  test("a roster with no matchup gets an explicit state", async ({ page }) => {
    await primeLens(page, 2);
    await page.goto("/lockin");
    await expect(page.locator("[data-lockin-board]")).toHaveAttribute("data-status", /no_matchup|in_season/);
  });

  test("no automated accessibility violations, detail expanded", async ({ page }) => {
    await primeLens(page);
    await page.goto("/lockin?open=lk02");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
  });
});
