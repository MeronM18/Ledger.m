import { afterWelcome, expect, mockWrites, test } from "./test";

const gripLabels = (page: import("@playwright/test").Page) =>
  page.evaluate(() => [...document.querySelectorAll("button[aria-label^='Move ']")].map((b) => b.getAttribute("aria-label")!.slice(5)));

test("overview cards can be rearranged, and the order is kept", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await afterWelcome(page);
  await expect.poll(() => gripLabels(page)).toEqual(["Net worth", "Recent transactions", "Next payment", "Spending", "Where it went"]);

  // Keyboard: lift Next payment, move it down one, drop it. dnd-kit starts
  // listening for arrows a tick after the lift, and one that lands before
  // then only scrolls the page, so press again, but only while it hasn't moved.
  await page.getByRole("button", { name: "Move Next payment" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".rounded-xl.border-dashed")).toHaveCount(1);
  await expect(async () => {
    if ((await gripLabels(page))[2] === "Next payment") await page.keyboard.press("ArrowDown");
    expect((await gripLabels(page))[2]).toBe("Spending");
  }).toPass({ intervals: [250, 500, 1000] });
  await page.keyboard.press("Space");
  await expect(page.locator(".rounded-xl.border-dashed")).toHaveCount(0);
  // Wherever it landed below Spending, that's the order kept (once the carried copy's grip is gone).
  await expect.poll(async () => (await gripLabels(page)).length).toBe(5);
  const moved = (await gripLabels(page)).slice(2);
  expect(moved[0]).toBe("Spending");
  const ids: Record<string, string> = { Spending: "spending-activity", "Next payment": "next-payment", "Where it went": "where-it-went" };

  await expect
    .poll(async () => (await mockWrites(page)).filter((w) => w.table === "ui_preferences").at(-1)?.body)
    .toMatchObject({ key: "card_order:overview-rail", value: moved.map((m) => ids[m]) });

  await page.reload();
  await afterWelcome(page);
  // Next payment streams in after the page (it's in Suspense), so wait for it to land in place.
  await expect.poll(async () => (await gripLabels(page)).slice(2)).toEqual(moved);
});
