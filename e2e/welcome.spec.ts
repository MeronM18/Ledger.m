import { expect, test } from "./test";

test.use({ reducedMotion: "no-preference" });

test("the welcome animation plays on a full load, clears itself and doesn't replay between pages", async ({ page }) => {
  await page.goto("/");
  const overlay = page.locator(".welcome");
  await expect(overlay).toHaveCount(1);
  await expect(overlay).toHaveCount(0, { timeout: 6_000 });

  await page.getByRole("link", { name: "Income" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Income" })).toBeVisible();
  await expect(overlay).toHaveCount(0);
});

test("a click doesn't skip it or reach the page underneath", async ({ page }) => {
  await page.goto("/");
  const overlay = page.locator(".welcome");
  await expect(overlay).toHaveCount(1);
  await page.mouse.click(640, 200);
  await page.waitForTimeout(400);
  await expect(overlay).toHaveAttribute("data-phase", "playing");
  await expect(page).toHaveURL(/\/$/);
  await expect(overlay).toHaveCount(0, { timeout: 6_000 });
});

test("a key press skips it", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".welcome")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".welcome")).toHaveCount(0, { timeout: 2_000 });
});
