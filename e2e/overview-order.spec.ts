import { afterWelcome, expect, mockWrites, test } from "./test";

const gripLabels = (page: import("@playwright/test").Page) =>
  page.evaluate(() => [...document.querySelectorAll("button[aria-label^='Move ']")].map((b) => b.getAttribute("aria-label")!.slice(5)));

test("overview cards can be rearranged, and the order is kept", async ({ page }) => {
  await page.goto("/");
  await afterWelcome(page);
  expect((await gripLabels(page))[0]).toBe("Net worth");

  // Keyboard: lift Net worth, move it down one, drop it. Each step waits
  // for the last to land, as a person's key presses would: an arrow
  // pressed before the lifted card is on screen has nothing to move yet.
  await page.getByRole("button", { name: "Move Net worth" }).first().focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".border-dashed")).toHaveCount(1);
  // The grid rearranges live, before the drop. dnd-kit starts listening for
  // arrows a tick after the lift, and one that lands before then only
  // scrolls the page, so press again, but only while the card hasn't moved.
  await expect(async () => {
    if ((await gripLabels(page))[0] === "Net worth") await page.keyboard.press("ArrowDown");
    expect((await gripLabels(page)).slice(0, 2)).toEqual(["Needs your attention", "Net worth"]);
  }).toPass({ intervals: [250, 500, 1000] });
  await page.keyboard.press("Space");
  await expect(page.locator(".border-dashed")).toHaveCount(0);
  await expect.poll(async () => (await gripLabels(page)).slice(0, 2)).toEqual(["Needs your attention", "Net worth"]);

  await expect
    .poll(async () => (await mockWrites(page)).find((w) => w.table === "ui_preferences")?.body)
    .toMatchObject({ key: "card_order:overview", value: expect.arrayContaining(["net-worth", "attention"]) });

  await page.reload();
  await afterWelcome(page);
  expect((await gripLabels(page)).slice(0, 2)).toEqual(["Needs your attention", "Net worth"]);
});
