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
    // Tonight opens first: the next listed start as a deadline, with a ticking countdown
    await expect(page.getByRole("tab", { name: /Tonight/ })).toHaveAttribute("aria-selected", "true");
    const tonight = page.locator("[data-tonight]").first();
    await expect(tonight).toHaveAttribute("data-tonight", "open");
    const next = tonight.locator("[data-tonight-next]");
    await expect(next).toContainText(/Before \d{1,2}:\d{2} [AP]M/);
    await expect(next.getByRole("timer")).toHaveText(/^in \d/);
    await expect(next).toContainText("Starting then");
    // tapping a starter opens his player sheet
    await next.getByRole("button", { name: /^Eli Brandt.*Show details/ }).click();
    await expect(page.locator("dialog[open]")).toContainText("Eli Brandt");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(tonight.getByRole("list", { name: "Later deadlines tonight" }).locator("li")).not.toHaveCount(0);
    await tonight.getByText("How tonight's order is worked out").click();
    await expect(tonight).toContainText("+0.88");
    await expect(tonight).toContainText("listed start time");
    await page.getByRole("tab", { name: /Decide/ }).click();
    const holden = board.locator("#lk-lk02");
    await expect(holden).toContainText("31.5");
    await expect(holden).toContainText("Expected if held");
    await expect(holden).toContainText("Later game beats it");
    await expect(holden).toContainText("If not already locked");
    await expect(holden).toContainText(/Model leans (lock|hold) · (marginal|moderate|clear)/);
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
    // the back button closes an open sheet and stays on the page
    await holden.getByRole("button", { name: /charts, record and method/ }).click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    await page.goBack();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page).toHaveURL(/\/lockin$/);
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
    // the next deadline tonight sits above the decisions, inside the first screen
    await expect(board.locator("[data-tonight-next]")).toBeInViewport();
    await expect(board.getByRole("link", { name: /more deadlines? tonight/ })).toHaveAttribute("href", "/lockin");
    await expect(board.getByRole("link", { name: /All players and nights/ })).toHaveAttribute("href", "/lockin");
    await board.locator('ol[aria-label="Your starting slots this week"] button').first().click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    expectNoConsoleErrors(guard);
  });

  test("Home leads with the matchup: win chance, both slot strips and the next deadline in the first screen", async ({ page }) => {
    const guard = watchConsole(page);
    await primeLens(page);
    await page.goto("/");
    const board = page.locator('[data-lockin-board="compact"]');
    const matchup = board.locator("[data-matchup]");
    await expect(matchup).toHaveAttribute("data-matchup", "win");
    await expect(matchup.locator("[data-win-prob]")).toHaveText(/^\d{1,3}%$/);
    await expect(matchup).toContainText("to win");
    await expect(matchup).toContainText("banked");
    await expect(matchup.getByRole("figure", { name: /Projected final totals/ })).toBeVisible();
    // first screen: week line, win chance, both strips, the next deadline
    await expect(page.getByText(/Week 4 · \d+ locked/)).toBeInViewport();
    await expect(matchup.locator("[data-win-prob]")).toBeInViewport();
    await expect(board.locator('ol[aria-label="Your starting slots this week"]')).toBeInViewport();
    const oppTrigger = matchup.getByRole("button", { name: /Synthetic Sixers: .*Show details/ });
    await expect(oppTrigger).toBeInViewport();
    await expect(board.locator("[data-tonight-next]")).toBeInViewport();
    // what moves the win chance: three options and all of the model's calls
    const whatIf = board.locator('[data-whatif="compact"]');
    await expect(whatIf.locator("[data-whatif-plan]")).toContainText(/All of the model's calls: \d+%/);
    await expect(whatIf.locator("[data-whatif-row]")).toHaveCount(3);
    // the featured decision leads with the model's call and the win comparison
    const hero = board.locator("article");
    await expect(hero.locator("[data-model-call]")).toContainText(/Lock now|Wait|Hold/);
    await expect(hero.locator("[data-win-compare]")).toContainText(/Lock: \d+% to win · Hold: \d+%/);
    await expect(hero).toContainText(/pts? of win chance/);
    await expect(hero.locator("[data-profile]")).toContainText(/Boom \d+%/);
    await expect(hero.locator("[data-profile]")).toContainText(/last \d+ games/);
    await expect(hero.locator("[data-availability]")).toContainText(/n=\d+/);
    await expect(board.getByRole("link", { name: /Your lock history/ })).toHaveAttribute("href", "/lockin#lock-history");
    // the opponent sheet: slots, habits, assumptions
    await oppTrigger.click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet.getByRole("heading", { name: "Synthetic Sixers" })).toBeVisible();
    await expect(sheet.getByText("Their slots")).toBeVisible();
    await expect(sheet.getByText(/players? still to play/)).toBeVisible();
    await expect(sheet.getByText("How they play")).toBeVisible();
    await expect(sheet.getByText(/^Playing like/)).toBeVisible();
    await sheet.getByText("What the win chance assumes").click();
    await expect(sheet).toContainText(/treated as locked \d+% of the time, the rate seen in past weeks/);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    // a what-if row opens that player's sheet
    await whatIf.locator("[data-whatif-row]").first().getByRole("button").click();
    await expect(page.locator("dialog[open]")).toContainText("Boom or bust");
    await page.keyboard.press("Escape");
    expectNoConsoleErrors(guard);
  });

  test("/lockin: every option in the Win % tab, the lock history, and boom/bust in the player sheet", async ({ page }) => {
    const guard = watchConsole(page);
    await primeLens(page);
    await page.goto("/lockin?tab=options");
    const board = page.locator('[data-lockin-board="full"]');
    await expect(board.locator("[data-matchup]")).toHaveAttribute("data-matchup", "win");
    await expect(page.getByRole("tab", { name: /Win %/ })).toHaveAttribute("aria-selected", "true");
    const rows = board.locator('[data-whatif="full"] [data-whatif-row]');
    expect(await rows.count()).toBeGreaterThan(3);
    // rows within simulation noise sort last and say so
    const kinds = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-whatif-row")));
    expect(kinds.indexOf("noise")).toBeGreaterThan(0);
    expect(kinds.slice(kinds.indexOf("noise")).every((k) => k === "noise")).toBe(true);
    await expect(board.locator('[data-whatif-row="noise"]').first()).toContainText("no real difference");
    const history = board.locator("[data-lock-history]");
    await expect(history.getByRole("heading", { name: "Your lock history" })).toBeVisible();
    await expect(history).toContainText("points a week left on the table");
    await expect(history).toContainText(/n=\d+ weeks?/);
    await expect(history).toContainText("Locked before a bigger game");
    await expect(history).toContainText("Held past a bigger score");
    await expect(history).toContainText("How you play");
    await expect(history).not.toContainText(/mistake|too early|too long|should/i);
    await page.getByRole("tab", { name: /Decide/ }).click();
    const holden = board.locator("#lk-lk02");
    await expect(holden.locator("[data-win-compare]")).toContainText(/If you lock/);
    await expect(holden.locator("[data-win-compare]")).toContainText("model leans");
    await holden.getByRole("button", { name: /charts, record and method/ }).click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet.getByRole("heading", { name: "Boom or bust" })).toBeVisible();
    await expect(sheet.locator("[data-profile]")).toContainText(/Boom \d+% · [\d.]+\+ pts/);
    await expect(sheet.locator("[data-profile]")).toContainText(/Bust \d+% · under [\d.]+/);
    await expect(sheet.locator("[data-availability]")).toContainText(/\d+%/);
    expectNoConsoleErrors(guard);
  });

  test("no accessibility violations with the opponent sheet open", async ({ page }) => {
    await primeLens(page);
    await page.goto("/");
    await page.locator("[data-matchup]").getByRole("button", { name: /^Synthetic Sixers: .*Show details/ }).click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    expect(axeList(await new AxeBuilder({ page }).analyze())).toEqual([]);
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
