import { expect, test } from "@playwright/test";
import { REDIRECTS, primarySurfaces, utilitySurfaces } from "../lib/nav";
import { expectNoConsoleErrors, primeLens, watchConsole } from "./helpers";

/**
 * THE ALWAYS-VISIBLE NAVIGATION CONTRACT. Whatever `primarySurfaces()` returns must be
 * reachable from an arbitrary route without opening anything, and the Menu button
 * must open the utility menu.
 */
test("the four tabs are visible on every route without opening anything", async ({
  page,
}) => {
  const guard = watchConsole(page);
  await primeLens(page);
  await page.goto("/deals");
  const row = page.getByRole("navigation", { name: "Primary" });
  await expect(row).toBeVisible();
  for (const s of primarySurfaces()) {
    const link = row.getByRole("link", { name: s.short, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", s.href);
  }
  // /deals is filed under League, so League is the lit tab.
  await expect(row.getByRole("link", { name: "League", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(row.getByRole("button", { name: "Menu", exact: true })).toBeVisible();
  expectNoConsoleErrors(guard);
});

test("the Menu opens search and every utility page", async ({ page }) => {
  const guard = watchConsole(page);
  await primeLens(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog).toBeVisible();
  for (const s of utilitySurfaces()) {
    const link = dialog.getByRole("link", { name: new RegExp(s.label) });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expectNoConsoleErrors(guard);
});

for (const r of REDIRECTS) {
  test(`${r.source} redirects to ${r.destination}`, async ({ page }) => {
    await primeLens(page);
    await page.goto(r.source);
    await expect(page).toHaveURL(new RegExp(`${r.destination}$`));
  });
}
