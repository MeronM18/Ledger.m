import { afterWelcome, expect, mockWrites, test } from "./test";

test("the bell counts new alerts, lists them, and clears once opened", async ({ page }) => {
  await page.goto("/");
  await afterWelcome(page);
  const bell = page.locator("main").getByRole("button", { name: /^Alerts/ });
  await expect(bell).toHaveAttribute("aria-label", "Alerts, 2 new");

  await bell.click();
  const list = page.getByRole("dialog");
  await expect(list.getByText("Netflix renews in 3 days")).toBeVisible();
  await expect(list.getByText("2 new")).toBeVisible();
  await expect(bell).toHaveAttribute("aria-label", "Alerts");
  await expect
    .poll(async () => (await mockWrites(page)).find((w) => w.table === "ui_preferences")?.body)
    .toMatchObject({ key: "alerts_seen_at" });

  await page.keyboard.press("Escape");
  await page.reload();
  await afterWelcome(page);
  await expect(page.locator("main").getByRole("button", { name: /^Alerts/ })).toHaveAttribute("aria-label", "Alerts");
});
