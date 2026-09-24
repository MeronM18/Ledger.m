import { afterWelcome, expect, test } from "./test";

test("the Filters menu sorts and narrows the transactions list", async ({ page }) => {
  await page.goto("/transactions");
  await afterWelcome(page);
  const rows = page.locator("tbody tr");
  const summary = page.getByText(/^\d+ transactions? · /);
  const before = await summary.textContent();

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByLabel("Sort by").click();
  await page.getByRole("option", { name: "Amount: high to low" }).click();
  // The biggest amount in the list is the paycheck or rent.
  await expect(rows.first()).toContainText(/Paycheck|Rent/);

  await page.getByRole("switch").first().click(); // Hide transfers & card payments
  await expect(page.getByRole("button", { name: "Filters (1 on)" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Payment Thank You-Mobile")).toHaveCount(0);
  await expect(summary).not.toHaveText(before!);

  await page.getByRole("button", { name: "Filters (1 on)" }).click();
  await page.getByRole("radio", { name: "Money in" }).click();
  await expect(rows.first()).toContainText("Paycheck");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
  await expect(summary).toHaveText(before!);
});
