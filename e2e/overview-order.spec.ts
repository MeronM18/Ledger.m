import { afterWelcome, expect, mockWrites, test } from "./test";

const gripLabels = (page: import("@playwright/test").Page) =>
  page.evaluate(() => [...document.querySelectorAll("button[aria-label^='Move ']")].map((b) => b.getAttribute("aria-label")!.slice(5)));

test("overview cards can be rearranged, and the order is kept", async ({ page }) => {
  await page.goto("/");
  await afterWelcome(page);
  expect((await gripLabels(page))[0]).toBe("Net worth");

  // Keyboard: lift Net worth, move it down one, drop it.
  await page.getByRole("button", { name: "Move Net worth" }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect.poll(async () => (await gripLabels(page)).slice(0, 2)).toEqual(["Needs your attention", "Net worth"]);

  await expect
    .poll(async () => (await mockWrites(page)).find((w) => w.table === "ui_preferences")?.body)
    .toMatchObject({ key: "card_order:overview", value: expect.arrayContaining(["net-worth", "attention"]) });

  await page.reload();
  await afterWelcome(page);
  expect((await gripLabels(page)).slice(0, 2)).toEqual(["Needs your attention", "Net worth"]);
});
