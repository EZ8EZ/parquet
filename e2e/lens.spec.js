import { test, expect } from "@playwright/test";
import { LENS_COOKIE } from "../lib/auth/entry";
import { BASE_URL } from "./constants";

/**
 * A team cookie that names no roster ("999", "abc", "-1") is treated exactly like no
 * cookie: the visitor meets the team picker with `next=`, never another team's data.
 */
for (const value of ["999", "abc", "-1"]) {
  for (const path of ["/", "/roster", "/lockin"]) {
    test(`team cookie ${value} on ${path} goes to the picker`, async ({ page }) => {
      await page.context().addCookies([{ name: LENS_COOKIE, value, url: BASE_URL }]);
      await page.goto(path);
      await expect(page).toHaveURL(/\/teams(\?next=|$)/);
      if (path !== "/") expect(new URL(page.url()).searchParams.get("next")).toBe(path);
    });
  }
}

test("picking a team on a first visit lands on that team's page, not back on the picker", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/teams/);
  await page.locator("main").getByRole("button").first().click();
  await expect(page).not.toHaveURL(/\/teams/, { timeout: 15_000 });
  expect((await page.context().cookies()).some((c) => c.name === LENS_COOKIE)).toBe(true);
});
