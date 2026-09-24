import { test, expect } from "./test";

// Every page renders its real content, with no error state, no thrown or
// logged errors (checked by the fixture) and nothing wider than the screen.
const PAGES = [
  { path: "/", heading: /Good (morning|afternoon|evening)/, shows: "Safe to spend" },
  { path: "/transactions", heading: "Transactions", shows: "Kroger" },
  { path: "/subscriptions", heading: "Subscriptions", shows: "Netflix" },
  { path: "/spending", heading: "Spending", shows: "Food & Drink" },
  { path: "/income", heading: "Income", shows: "What you can count on" },
  { path: "/budgets", heading: "Budgets", shows: "Food & Drink" },
  { path: "/cash-flow", heading: "Cash flow", shows: "Coming up" },
  { path: "/goals", heading: "Goals", shows: "Emergency fund" },
  { path: "/year-in-review", heading: "Year in review", shows: "Where it went" },
  { path: "/assets", heading: "Assets", shows: "Honda Civic" },
  { path: "/accounts", heading: "Accounts", shows: "Credit utilization" },
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
