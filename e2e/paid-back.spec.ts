import { afterWelcome, expect, mockWrites, test } from "./test";

/** This month's Food & Drink spending on the overview, as a number. */
async function foodThisMonth(page: import("@playwright/test").Page): Promise<number> {
  await page.goto("/budgets");
  await afterWelcome(page);
  // Wait for the amount itself: with no welcome animation to sit through
  // (it plays once a session), the page can still be filling in.
  const pattern = /Food & Drink[\s\S]*?\$([\d,]+\.\d{2})/;
  await expect(page.locator("main")).toContainText(pattern);
  const text = await page.locator("main").innerText();
  const match = text.match(pattern);
  return Number(match![1].replace(/,/g, ""));
}

test("a charge paid back in cash counts only your share, and never touches Assets", async ({ page }) => {
  const before = await foodThisMonth(page);

  await page.goto("/transactions");
  await afterWelcome(page);
  await page.getByPlaceholder(/search/i).fill("kroger");
  const row = page.locator("[data-transaction]").filter({ hasText: "Kroger" }).first();
  const amounts = (await row.innerText()).match(/\$[\d,]+\.\d{2}/g)!;
  const charge = Number(amounts.at(-1)!.replace(/[^\d.]/g, ""));
  // The day's heading above it.
  const chargeDate = new Date((await row.locator("xpath=ancestor::section[1]").getAttribute("aria-label"))!);
  await row.click();

  await page.getByLabel("Someone paid me back in cash for this").check();
  await page.getByLabel("Amount paid back").fill("40");
  await expect(page.getByText(/Your share, \$[\d,.]+, is what counts as spending/)).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Transaction updated")).toBeVisible();

  await expect(row.getByText("Paid back $40.00")).toBeVisible();
  await expect(row.getByText("Edited")).toHaveCount(0);

  const writes = await mockWrites(page);
  expect(writes.some((w) => w.table === "transaction_overrides" && (w.body as { reimbursed_amount?: number } | null)?.reimbursed_amount === 40)).toBe(true);
  expect(writes.some((w) => w.table === "manual_assets"), "the Cash asset was changed").toBe(false);

  // The month's Food & Drink spending drops by exactly what was paid back
  // (when the charge is this month's, which the newest Kroger charge is
  // except on the 1st).
  expect(charge).toBeGreaterThan(40);
  const after = await foodThisMonth(page);
  if (chargeDate.getMonth() === new Date().getMonth()) expect(Math.round((before - after) * 100) / 100).toBe(40);
});

test("an Apple Card purchase can be paid back too, in full", async ({ page }) => {
  await page.goto("/transactions");
  await afterWelcome(page);
  await page.getByPlaceholder(/search/i).fill("whole foods");
  const row = page.locator("[data-transaction]").filter({ hasText: "Whole Foods" }).first();
  await row.click();

  await page.getByLabel("Someone paid me back in cash for this").check();
  await page.getByRole("button", { name: "All of it" }).click();
  await expect(page.getByText("None of it counts as your spending.")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Transaction updated")).toBeVisible();
  await expect(row.getByText("Paid back in full")).toBeVisible();

  const writes = await mockWrites(page);
  expect(writes.some((w) => w.table === "manual_transactions" && w.method === "PATCH" && "reimbursed_amount" in ((w.body as object | null) ?? {}))).toBe(true);
  expect(writes.some((w) => w.table === "manual_assets"), "the Cash asset was changed").toBe(false);
});

test("more than the charge is refused", async ({ page }) => {
  await page.goto("/transactions");
  const res = await page.request.put("/api/transactions/does-not-matter/paid-back", { data: { amount: 5, manual: false } });
  expect(res.status()).toBe(404);
});
