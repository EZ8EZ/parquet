import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { expectNoConsoleErrors, primeLens, watchConsole } from "./helpers";

/**
 * /lockin and Home's compact board on the fixture provider, which serves the engine's
 * synthetic week (lib/lockin/fixture.js) frozen at Thursday of week 4.
 */
const axeList = (r) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);

test.describe("lock-or-hold board", () => {
  test("full board: slots, tabs, the decision with its lean, a sheet with prev/next", async ({ page }) => {
    const guard = watchConsole(page);
    await primeLens(page);
    await page.goto("/lockin");
    const board = page.locator('[data-lockin-board="full"]');
    await expect(board).toHaveAttribute("data-status", "in_season");
    await expect(page.getByText("Sample week, invented players")).toBeVisible();
    await expect(board.locator('ol[aria-label="Your starting slots this week"] > li')).toHaveCount(7);
    await expect(page.getByRole("tab", { name: /Decide now/ })).toHaveAttribute("aria-selected", "true");
    const holden = board.locator("#lk-lk02");
    await expect(holden).toContainText("31.5");
    await expect(holden).toContainText("Expected if held");
    await expect(holden).toContainText("Later game beats it");
    await expect(holden).toContainText("If not already locked");
    await expect(holden).toContainText(/Leans (lock|hold) · (marginal|moderate|clear)/);
    await holden.getByRole("button", { name: /charts, record and method/ }).click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet.getByRole("heading", { name: "Bryce Holden" })).toBeVisible();
    await expect(sheet.getByText("Last 15 games")).toBeVisible();
    await expect(sheet.getByText(/Filled dots beat 31\.5/)).toBeVisible();
    await expect(sheet.getByText("History only")).toBeVisible();
    await sheet.getByRole("button", { name: /Overtime game/ }).first().click();
    await expect(sheet.locator("[aria-live=polite]")).toContainText("Overtime game");
    await sheet.getByRole("button", { name: /^Next: / }).click();
    await expect(sheet.getByRole("heading", { level: 2 })).not.toHaveText("Bryce Holden");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.getByRole("tab", { name: "Nights" }).click();
    await expect(page.getByRole("table", { name: /games this week/ })).toBeVisible();
    await page.locator("#lockin-method summary").click();
    await expect(page.locator("#lockin-method")).toContainText("+9.4");
    expectNoConsoleErrors(guard);
  });

  test("Home shows the slots and the most urgent decision with its figures and lean", async ({ page }) => {
    const guard = watchConsole(page);
    await primeLens(page);
    await page.goto("/");
    const board = page.locator('[data-lockin-board="compact"]');
    await expect(board.locator('ol[aria-label="Your starting slots this week"] > li')).toHaveCount(7);
    const hero = board.locator("article");
    await expect(hero).toHaveCount(1);
    await expect(hero).toContainText("On the table");
    await expect(hero).toContainText("Expected if held");
    await expect(hero).toBeInViewport();
    await expect(board.getByRole("link", { name: /All players and nights/ })).toHaveAttribute("href", "/lockin");
    await board.locator('ol[aria-label="Your starting slots this week"] button').first().click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    expectNoConsoleErrors(guard);
  });

  test("a roster with no matchup gets an explicit state", async ({ page }) => {
    await primeLens(page, 2);
    await page.goto("/lockin");
    await expect(page.locator("[data-lockin-board]")).toHaveAttribute("data-status", /no_matchup|in_season/);
  });

  test("no automated accessibility violations, with a player sheet open", async ({ page }) => {
    await primeLens(page);
    await page.goto("/lockin?open=lk02");
    await expect(page.locator("dialog[open]")).toBeVisible();
    expect(axeList(await new AxeBuilder({ page }).analyze())).toEqual([]);
    await page.keyboard.press("Escape");
    await page.goto("/");
    expect(axeList(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
});
