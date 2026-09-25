import { afterWelcome, expect, test } from "./test";

const MONTH = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long" }).format(new Date());

test("the overview leads with the month: what's left, spent, income and net worth, then the month's chart", async ({ page }) => {
  await page.request.put("/api/budgets/monthly", { data: { amount: 5000 } });
  await page.goto("/");
  await afterWelcome(page);

  // Four headline tiles, each a link to its page.
  const left = page.getByRole("region", { name: "Left to spend" });
  await expect(left.getByText(/^of \$5,000 · about \$[\d,]+ a day for \d+ days?$/)).toBeVisible();
  await expect(left.getByText(/\d+% left|Over/).first()).toBeVisible();
  const spent = page.getByRole("region", { name: `Spent in ${MONTH}` });
  await expect(spent.getByText(/ by the \d+(st|nd|rd|th): \$/)).toBeVisible();
  await expect(page.getByRole("region", { name: `Income in ${MONTH}` }).getByText(/in all$/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Net worth" })).toBeVisible();
  await expect(left.getByRole("link", { name: "Left to spend" })).toHaveAttribute("href", "/budgets");

  // The month's chart: how it stands against the budget, day by day, or month by month.
  const chart = page.getByRole("region", { name: `Spending in ${MONTH}` });
  await expect(chart.getByText(/spent of your \$5,000 budget, \d+ days? to go/)).toBeVisible();
  await expect(chart.getByText(/(ahead of|under) an even pace|over your budget|On pace/)).toBeVisible();
  await expect(chart.locator(".recharts-area-curve")).toBeVisible();
  await chart.getByRole("radio", { name: "Month by month" }).click();
  await expect(chart.locator(".recharts-bar-rectangle").first()).toBeVisible();

  // What's due, where the money went, and the latest transactions with what each one is.
  const upcoming = page.getByRole("region", { name: "Upcoming" });
  await expect(upcoming.getByText(/due in the next 14 days/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Where it went" }).getByText("Rent & Utilities")).toBeVisible();
  const recent = page.getByRole("region", { name: "Recent transactions" });
  await expect(recent.getByRole("row")).toHaveCount(8); // the header and seven
  await expect(recent.getByRole("cell", { name: "Card payment" }).first()).toBeVisible();

  // Only what needs doing sits above it all: here, a bank to reconnect.
  await expect(page.getByRole("status", { name: "Needs your attention" }).getByText(/stopped syncing/)).toBeVisible();
  // The old cards are gone.
  for (const gone of ["Safe to spend", "Recent alerts", "Subscriptions", "Goals"]) {
    await expect(page.getByRole("heading", { name: gone, exact: true })).toHaveCount(0);
  }
});
