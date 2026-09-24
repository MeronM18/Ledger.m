import { afterWelcome, expect, mockWrites, test } from "./test";

test("budgets edit in place, and the month can be changed", async ({ page }) => {
  await page.goto("/budgets");
  await afterWelcome(page);
  await expect(page.getByText("Left to budget")).toBeVisible();
  await expect(page.getByText("Staying on track")).toBeVisible();

  // Change a budget right in the table.
  const food = page.getByRole("textbox", { name: "Food & Drink budget", exact: true });
  await food.fill("650");
  await food.press("Enter");
  await expect(page.getByText("Food & Drink budgeted at $650")).toBeVisible();
  await expect
    .poll(async () => (await mockWrites(page)).some((w) => w.table === "budgets" && (w.body as { monthly_amount?: number } | null)?.monthly_amount === 650))
    .toBe(true);

  // A category with spending and no budget can be given one the same way.
  const unbudgeted = page.locator("li").filter({ hasText: "No budget" }).first().getByRole("textbox");
  await unbudgeted.fill("100");
  await unbudgeted.press("Enter");
  await expect(page.getByText(/budgeted at \$100/)).toBeVisible();

  // Last month, then back.
  await page.getByRole("link", { name: "Previous month" }).click();
  await expect(page).toHaveURL(/\/budgets\?month=\d{4}-\d{2}$/);
  await expect(page.getByText("The whole month")).toBeVisible();
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByText("This month so far")).toBeVisible();
});
