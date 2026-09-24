import { afterWelcome, expect, test } from "./test";

test("a card shows its product name and takes a closing day, and a payment shows what it paid for", async ({ page }) => {
  await page.goto("/accounts");
  await afterWelcome(page);
  const chase = page.locator("[data-slot=card]").filter({ hasText: "Last synced" }).filter({ hasText: "Chase" });
  await expect(chase.getByText("Chase Freedom Flex ••7788")).toBeVisible();

  await chase.getByRole("button", { name: "Edit Chase Freedom Flex" }).click();
  await page.getByLabel("Name").fill("Freedom Flex");
  await page.getByLabel("Statement closing day").fill("3");
  await page.getByLabel("Payment due day").fill("28");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(chase.getByText("Freedom Flex ••7788")).toBeVisible();
  await expect(chase.getByText(/closes the 3rd · due the 28th/)).toBeVisible();

  // The same payment, from checking: it finds the card by the amount landing on it.
  await page.goto("/transactions");
  await page.getByPlaceholder(/search/i).fill("chase");
  const payment = page.getByRole("row").filter({ hasText: "Total Checking" }).first();
  await payment.getByRole("button", { name: "See what this payment paid for" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /payment to Freedom Flex ••7788/ })).toBeVisible();
  await expect(dialog.getByText(/toward the statement from .* to .*/)).toBeVisible();
  await expect(dialog.getByText(/\d+ charges on this statement/)).toBeVisible();
  await expect(dialog.getByText("Kroger").first()).toBeVisible();
  await expect(dialog.getByText("This card's statement closes on the 3rd.")).toBeVisible();
});
