import { test, expect } from "./test";

// Every page renders its real content, with no error state, no thrown or
// logged errors (checked by the fixture) and nothing wider than the screen.
const PAGES = [
  { path: "/", heading: /Good (morning|afternoon|evening)/, shows: "Safe to spend" },
  { path: "/transactions", heading: "Transactions", shows: "Kroger" },
  { path: "/recurring", heading: "Recurring", shows: "Netflix" },
  { path: "/reports/spending", heading: "Reports", shows: "Spending by category" },
  { path: "/reports/income", heading: "Reports", shows: "What you can count on" },
  { path: "/budgets", heading: "Budgets", shows: "Food & Drink" },
  { path: "/reports/cash-flow", heading: "Reports", shows: "Coming up" },
  { path: "/goals", heading: "Goals", shows: "Emergency fund" },
  { path: "/reports/year", heading: "Reports", shows: "Where it went" },
  { path: "/accounts", heading: "Accounts", shows: "Honda Civic" },
  { path: "/settings", heading: "Settings", shows: "Download backup" },
];

for (const { path, heading, shows } of PAGES) {
  test(`${path} renders`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText(shows).first()).toBeVisible();
    await expect(page.getByText(/Couldn.t load/)).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);
  });
}

test("pages that moved still open from their old addresses", async ({ page }) => {
  for (const [from, to] of [
    ["/spending", "/reports/spending"],
    ["/income", "/reports/income"],
    ["/cash-flow", "/reports/cash-flow"],
    ["/year-in-review", "/reports/year"],
    ["/assets", "/accounts"],
    ["/subscriptions", "/recurring"],
    ["/reports", "/reports/cash-flow"],
  ]) {
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`${to}$`));
  }
});
