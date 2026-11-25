import { expect, test } from "@playwright/test";
import { expectNoConsoleErrors, expectStableChrome, primeLens, watchConsole } from "./helpers";

/**
 * THIS WEEK under the fixture provider, which serves the lock-in engine's synthetic
 * week: the page renders the week header, the seven slots and the live decisions, and
 * none of the lifetime statistics that used to fill Home.
 */
test("This Week renders the engine fixture week and carries no lifetime stats", async ({
  page,
}) => {
  const guard = watchConsole(page);
  await primeLens(page);
  await page.goto("/");
  await expectStableChrome(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Your starting slots this week" })).toBeVisible();
  await expect(page).toHaveURL(/\/lockin$/);
  await expect(page.getByRole("tab", { name: /^Calls/ })).toBeVisible();
  await expect(page.locator("[data-lockin-board=full]")).toHaveAttribute("data-status", "in_season");
  await expect(page.getByText("How you deal, in three numbers")).toHaveCount(0);
  await expect(page.getByText(/decisions? to capture/)).toHaveCount(0);
  expectNoConsoleErrors(guard);
});

test("the Trade hub offers its three jobs on the first screen", async ({ page }) => {
  await primeLens(page);
  await page.goto("/trade");
  const jobs = page.getByRole("list", { name: "Trade jobs" });
  for (const name of ["Find a deal", "Check a deal", "Look up a value"]) {
    await expect(jobs.getByRole("link", { name: new RegExp(name) })).toBeInViewport();
  }
});
