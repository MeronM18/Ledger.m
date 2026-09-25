import { afterWelcome, expect, mockWrites, test } from "./test";

const MONTH = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long" }).format(new Date());
const SPENT = `Spent in ${MONTH}`;

const gripLabels = (page: import("@playwright/test").Page) =>
  page.evaluate(() => [...document.querySelectorAll("button[aria-label^='Move ']")].map((b) => b.getAttribute("aria-label")!.slice(5)));

test("overview cards can be rearranged, and the order is kept", async ({ page }) => {
  await page.goto("/");
  await afterWelcome(page);
  expect((await gripLabels(page)).slice(0, 4)).toEqual(["Left to spend", SPENT, `Income in ${MONTH}`, "Net worth"]);

  // Keyboard: lift Left to spend, move it right one, drop it. Each step waits
  // for the last to land, as a person's key presses would: an arrow
  // pressed before the lifted card is on screen has nothing to move yet.
  await page.getByRole("button", { name: "Move Left to spend" }).first().focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".border-dashed")).toHaveCount(1);
  // The grid rearranges live, before the drop. dnd-kit starts listening for
  // arrows a tick after the lift, and one that lands before then only
  // scrolls the page, so press again, but only while the card hasn't moved.
  await expect(async () => {
    if ((await gripLabels(page))[0] === "Left to spend") await page.keyboard.press("ArrowRight");
    expect((await gripLabels(page)).slice(0, 2)).toEqual([SPENT, "Left to spend"]);
  }).toPass({ intervals: [250, 500, 1000] });
  await page.keyboard.press("Space");
  await expect(page.locator(".border-dashed")).toHaveCount(0);
  await expect.poll(async () => (await gripLabels(page)).slice(0, 2)).toEqual([SPENT, "Left to spend"]);

  await expect
    .poll(async () => (await mockWrites(page)).find((w) => w.table === "ui_preferences")?.body)
    .toMatchObject({ key: "card_order:overview", value: expect.arrayContaining(["spent-this-month", "left-to-spend"]) });

  await page.reload();
  await afterWelcome(page);
  expect((await gripLabels(page)).slice(0, 2)).toEqual([SPENT, "Left to spend"]);
});
