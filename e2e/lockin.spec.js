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
    // the move is asked for DECIDE_BUFFER_MIN before the listed tip, which stays visible
    await expect(next).toContainText(/(By \d{1,2}:\d{2} [AP]M · tips|Decide now · tips) \d{1,2}:\d{2}/);
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
    await page.getByRole("tab", { name: /Calls/ }).click();
    await expect(board.locator('li[data-call="then_start"]').first()).toContainText(/Then start Ike Novak at C/);
    const holden = board.locator("#lk-lk02");
    await expect(holden).toContainText("31.5");
    await expect(holden).toContainText("Expected if held");
    await expect(holden).toContainText("Later game beats it");
    await expect(holden).toContainText(/if not already locked/i);
    // a wait's lean is the call at the deadline
    await expect(holden).toContainText(/(At the deadline: m|M)odel leans (lock|hold) · (marginal|moderate|clear)/);
    await holden.getByRole("button", { name: /charts, record and method/ }).click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet.getByRole("heading", { name: "Bryce Holden" })).toBeVisible();
    // the sheet is four short tabs: Call first, then Form, Week, Vs opponents
    await expect(sheet.getByText(/Filled dots beat 31\.5/)).toBeVisible();
    await sheet.getByRole("tab", { name: "Vs opponents" }).click();
    await expect(sheet.getByText("History only")).toBeVisible();
    await sheet.getByRole("tab", { name: "Form" }).click();
    await expect(sheet.getByText("Last 15 games")).toBeVisible();
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
    await page.getByRole("tab", { name: "Week" }).click();
    await expect(page.getByRole("table", { name: /games this week/ })).toBeVisible();
    await page.locator("#lockin-method summary").click();
    await expect(page.locator("#lockin-method")).toContainText("+9.4");
    expectNoConsoleErrors(guard);
  });

  test("Home (direction A): the scoreboard and every call on the first screens, each with the model's lean and rough win chances", async ({ page }) => {
    const guard = watchConsole(page);
    await primeLens(page);
    await page.goto("/");
    const board = page.locator('[data-lockin-board="compact"]');
    await expect(board.locator('ol[aria-label="Your starting slots this week"] > li')).toHaveCount(7);
    // state lives in the tiles: no "0.0" for a player who has not played
    await expect(board.locator('[data-slot-state="yet"]').first()).not.toContainText("0.0");
    const calls = board.getByRole("list", { name: "Your calls" });
    await expect(calls.locator("li")).not.toHaveCount(0);
    const first = calls.locator("li").first();
    await expect(first).toContainText("on the table");
    await expect(first).toContainText(/(At the deadline: m|M)odel leans (lock|hold) · (marginal|moderate|clear)/);
    await expect(first.locator("[data-win-compare]")).toContainText(/Rough win chance/);
    await expect(first.locator("[data-win-compare]")).toContainText(/if lock\s*\d+%/);
    // a wait headline names the call at the deadline, never a bare chip
    for (const row of await calls.locator('li[data-call="wait"]').all()) {
      await expect(row).toContainText(/(Wait until .+, then (lock|hold) · (locks|(.+ )?tips) at \d{1,2}:\d{2}|Decide now)/);
      await expect(row).toContainText(/At the deadline: model leans/);
    }
    // the bench move the hero's win chance assumes is a call too, with its decide-by time and condition
    const move = calls.locator('li[data-call="then_start"]').first();
    await expect(move).toContainText(/Then start Ike Novak at C from Fri 7:30 PM/);
    await expect(move).toContainText(/by Fri 7:20 PM · tips 7:30/);
    await expect(move).toContainText(/If Eli Brandt's score tonight is under 16\.9/);
    await expect(board.getByRole("heading", { name: new RegExp(`^Your calls · ${await calls.locator("li").count()}$`) })).toBeVisible();
    await expect(board.getByRole("link", { name: /Lock history/ })).toHaveAttribute("href", "/lockin?tab=history");
    await expect(board.getByRole("link", { name: /Your players: form and opponents/ })).toHaveAttribute("href", "/lockin?tab=players");
    await expect(board.getByRole("link", { name: /^Every night/ })).toHaveAttribute("href", "/lockin?tab=week");
    await first.getByRole("button").first().click();
    await expect(page.locator("dialog[open]")).toContainText("Boom or bust");
    await page.keyboard.press("Escape");
    await board.locator('ol[aria-label="Your starting slots this week"] button').first().click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    expectNoConsoleErrors(guard);
  });

  test("Home leads with the scoreboard: rough win chance, both rows, Tonight, and the opponent sheet", async ({ page }) => {
    const guard = watchConsole(page);
    await primeLens(page);
    await page.goto("/");
    const board = page.locator('[data-lockin-board="compact"]');
    const matchup = board.locator("[data-scoreboard]");
    await expect(matchup).toHaveAttribute("data-matchup", "win");
    await expect(matchup.locator("[data-win-prob]")).toHaveText(/^\d{1,3}%$/);
    await expect(matchup).toContainText("to win");
    await expect(matchup).toContainText("rough");
    await expect(matchup).toContainText("banked");
    await expect(matchup).toContainText("Projected");
    // first screen: the week heading, the win chance, both rows, Tonight
    await expect(page.getByRole("heading", { level: 1, name: /Week 4/ })).toBeInViewport();
    await expect(matchup.locator("[data-win-prob]")).toBeInViewport();
    await expect(board.locator('ol[aria-label="Your starting slots this week"]')).toBeInViewport();
    const oppTrigger = matchup.getByRole("button", { name: /Synthetic Sixers: .*Show details/ });
    await expect(oppTrigger).toBeInViewport();
    await expect(board.locator("[data-tonight]").first()).toBeVisible();
    // the scorebug steps aside on the scoreboard page
    await expect(page.locator(".desk-statusbar")).toBeHidden();
    // "rough" explains itself
    await matchup.getByRole("button", { name: /^Rough:/ }).click();
    await expect(page.locator("dialog[open]")).toContainText("did not win more matchups");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    // the opponent sheet: slots, habits, assumptions
    await oppTrigger.click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet.getByRole("heading", { name: "Synthetic Sixers" })).toBeVisible();
    await expect(sheet.getByText("Their slots")).toBeVisible();
    await expect(sheet.getByText(/players? still to play/)).toBeVisible();
    await expect(sheet).toContainText("narrower than reality");
    await expect(sheet.getByText("How they play")).toBeVisible();
    await expect(sheet.getByText(/^Playing like/)).toBeVisible();
    await sheet.getByText("What the win chance assumes").click();
    await expect(sheet).toContainText(/treated as locked \d+% of the time, the rate seen in past weeks/);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    expectNoConsoleErrors(guard);
  });

  test("what-if: assume a slot, see the bar and the changed rough win chance, keep it to the lock board, reset", async ({ page }) => {
    const guard = watchConsole(page);
    await primeLens(page);
    await page.goto("/");
    const board = page.locator('[data-lockin-board="compact"]');
    const before = await board.locator("[data-win-prob]").innerText();
    await expect(board.locator("[data-whatif-bar]")).toHaveCount(0);
    // their PG (locked by inference): treat it as playing on
    await board.getByRole("button", { name: /^Their PG .*What if$/ }).click();
    const sheet = page.locator("dialog[open] [data-assume-sheet]");
    await expect(sheet.getByRole("button", { name: "Treat as playing on" })).toBeVisible();
    await sheet.getByRole("button", { name: "Treat as playing on" }).click();
    await page.waitForURL(/assume=t0O/, { waitUntil: "commit" });
    const bar = board.locator("[data-whatif-bar]");
    await expect(bar).toContainText("1 assumed");
    await expect(bar).toContainText(/Rough win chance \d+% → \d+% with your assumptions/);
    await expect(bar).toContainText("The app had this slot as locked; you're treating it as playing on");
    await expect(board.locator("[data-win-prob]")).not.toHaveText(before);
    // the assumed tile is marked as an assumption, never with the lock glyph
    await expect(board.locator('[data-assumed="open"]')).toHaveCount(1);
    // your own unknown slot does not offer "playing on", and says why
    await board.getByRole("button", { name: /^SG .*What if$/ }).click();
    await expect(page.locator("dialog[open] [data-assume-sheet]")).toContainText("Playing on changes nothing here");
    await expect(page.locator("dialog[open] [data-assume-sheet]").getByRole("button", { name: "Treat as playing on" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    // links to the lock board keep it, and from the lock board This Week keeps it, badge hidden
    await expect(board.getByRole("link", { name: /Your players: form and opponents/ })).toHaveAttribute("href", /assume=t0O/);
    await page.goto("/lockin?assume=t0O");
    const weekTab = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: /^This Week/ });
    await expect(weekTab).toHaveAttribute("href", "/?assume=t0O");
    await expect(weekTab).not.toContainText(/calls? open/);
    // a hand-typed token the board cannot honour is dropped (their SG has no games left; leading zero)
    await page.goto("/?assume=t1O,m01L");
    await expect(board.locator("[data-whatif-bar]")).toHaveCount(0);
    await page.goto("/?assume=t0O");
    await bar.getByRole("button", { name: "Reset" }).click();
    await page.waitForURL((u) => !u.search.includes("assume"), { waitUntil: "commit" });
    await expect(board.locator("[data-whatif-bar]")).toHaveCount(0);
    await expect(board.locator("[data-win-prob]")).toHaveText(before);
    expectNoConsoleErrors(guard);
  });

  test("what-if panel: lock a slot at a typed score, see it on the tile and in the bar; Players tab and past games vs each opponent", async ({ page }) => {
    const guard = watchConsole(page);
    await primeLens(page);
    await page.goto("/");
    const before = await page.locator("[data-win-prob]").first().innerText();
    await page.getByRole("button", { name: /What if: lock players or type scores/ }).click();
    const panel = page.locator("dialog[open] [data-whatif-panel]");
    const row = panel.locator("li").first();
    await row.getByRole("button", { name: "Locked" }).click();
    await row.locator("input").fill("0");
    await panel.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/assume=m0L0(?:&|$)/);
    const bar = page.locator("[data-whatif-bar]");
    await expect(bar).toContainText(/locked at 0\.0 \(typed\)/);
    await expect(page.locator('[data-slot-state][data-assumed="locked"]').first()).toContainText("0.0");
    // the bar starts from the win chance the page showed before the assumption
    await expect(bar.locator("[data-whatif-change]")).toContainText(before.replace(/\s+/g, ""));
    // a bad score is refused in the tile sheet, a good one applies
    await page.goto("/lockin?tab=calls");
    const rivals = page.locator("[data-rivals]").first();
    await expect(rivals).toContainText(/If you let [\d.]+ go, who could beat it at/);
    await expect(rivals).toContainText(/his own games/);
    await expect(rivals).toContainText(/At least one of them beats [\d.]+: \d+%/);
    await page.getByRole("tab", { name: "Players" }).click();
    const first = page.locator('[aria-label$="Charts and past games"]').first();
    await expect(first).toBeVisible();
    await first.click();
    await page.locator("dialog[open]").getByRole("tab", { name: "Vs opponents" }).click();
    await expect(page.locator("dialog[open]")).toContainText("Past games vs this week's opponents");
    expectNoConsoleErrors(guard);
  });

  test("/lockin: every option in the Win % tab, the lock history, and boom/bust in the player sheet", async ({ page }) => {
    const guard = watchConsole(page);
    await primeLens(page);
    await page.goto("/lockin?tab=options");
    const board = page.locator('[data-lockin-board="full"]');
    await expect(board.locator("[data-matchup]")).toHaveAttribute("data-matchup", "win");
    await expect(page.getByRole("tab", { name: /Win %/ })).toHaveAttribute("aria-selected", "true");
    const table = board.locator('[data-whatif="full"]');
    // one row per call, three cells each; exactly one cell per row is the model's call
    const rows = table.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);
    for (const row of await rows.all()) await expect(row.locator('[data-whatif-row="plan"]')).toHaveCount(1);
    await expect(table.locator('[data-whatif-row="noise"]').first()).toContainText("≈ same");
    await expect(table).toContainText("Rough win chance by call");
    await expect(table.getByText("How far to trust these")).toBeVisible();
    await page.getByRole("tab", { name: /^History/ }).click();
    const history = board.locator("[data-lock-history]");
    await expect(history.getByRole("heading", { name: "Your lock history" })).toBeVisible();
    await expect(history).toContainText("points a week");
    await expect(history).toContainText("Between what you banked and each player");
    await expect(history).toContainText(/n=\d+ weeks?/);
    await expect(history).toContainText("Locked before a bigger game");
    await expect(history).toContainText("Held past a bigger score");
    await expect(history).toContainText("How you play");
    await expect(history).not.toContainText(/mistake|too early|too long|should/i);
    await page.getByRole("tab", { name: /Calls/ }).click();
    const holden = board.locator("#lk-lk02");
    // win chances sit beside the lean (which rests on points) as information
    await expect(holden.locator("[data-win-compare]")).toContainText("Rough win chance");
    await expect(holden.locator("[data-win-compare]")).toContainText(/if lock\s*\d+%/);
    await expect(holden.locator("[data-win-compare]")).not.toContainText("model leans");
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
    // Closing pops the history entry the sheet pushed (components/ui/Sheet.jsx), and
    // history.back() is asynchronous: wait for it to land, or the next goto races it.
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.waitForFunction(() => !window.history.state?.parquetSheet);
    await page.goto("/");
    // QA round 4: axe ran before Home had settled (page-has-heading-one failed 3/5 runs while
    // the server HTML has the h1). Wait for Home's URL and its h1 before scanning.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(axeList(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
});
