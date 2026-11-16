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
