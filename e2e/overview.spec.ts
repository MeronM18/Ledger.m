import { afterWelcome, expect, test } from "./test";

const MONTH = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long" }).format(new Date());

test("the overview: headline figures, safe to spend, the month against the budget, what's due, where it went, the latest transactions, goals", async ({ page }) => {
  await page.request.put("/api/budgets/monthly", { data: { amount: 5000 } });
  await page.goto("/");
  await afterWelcome(page);

  // Four headline figures, each a link to its page, with what it's measured against.
  const spent = page.getByRole("region", { name: `Spent in ${MONTH}` });
  // Both measured against last month through the same day.
  await expect(spent.locator("p:visible", { hasText: /^(\w+ by the \d+(st|nd|rd|th)|\w{3}): \$[\d,]+$/ })).toBeVisible();
  await expect(page.getByRole("region", { name: `Income in ${MONTH}` }).locator("p:visible", { hasText: /^(\w+ by the \d+(st|nd|rd|th)|\w{3}): \$[\d,]+$/ })).toBeVisible();
  const worth = page.getByRole("region", { name: "Net worth" });
  await expect(worth.getByRole("link", { name: "Net worth" })).toHaveAttribute("href", "/accounts");
  // Money you can reach, net of the cards: the bank, the Cash asset, what's owed.
  const cash = page.getByRole("region", { name: "Cash after cards" });
  await expect(cash.locator("p:visible", { hasText: /owed on cards|on cards/ })).toBeVisible();

  // What's safe to spend, with the sum laid out.
  const safe = page.getByRole("region", { name: "Safe to spend" });
  const sum = safe.getByRole("list", { name: "How it's worked out" });
  await expect(sum.getByText("In checking")).toBeVisible();
  await expect(sum.getByText("Owed on cards")).toBeVisible();
  await expect(safe.getByText(/over the next \d+ days|until your/)).toBeVisible();

  // Beside them, the month against the monthly budget: what's left a day, and the limit.
  const budget = page.getByRole("region", { name: "Left to spend" });
  await expect(budget.getByText(/about \$[\d,]+ a day for the last \d+ days?|over your \$5,000 budget/)).toBeVisible();
  await expect(budget.getByText(/\d+% left|Over/).first()).toBeVisible();
  await expect(budget.getByText("$5,000.00")).toBeVisible();
  await expect(budget.getByRole("list", { name: "Budgets to watch" }).getByText("Food & Drink")).toBeVisible();

  // The month's chart: where the month is heading, day by day, or money in against spending by month.
  const chart = page.getByRole("region", { name: `Spending in ${MONTH}` });
  await expect(chart.getByText(/at this pace|spent so far/).first()).toBeVisible();
  await expect(chart.getByText(/budget \$5,000/)).toBeVisible();
  await expect(chart.locator(".recharts-area-curve")).toBeVisible();
  await chart.getByRole("radio", { name: "Month by month" }).click();
  await expect(chart.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expect(chart.getByText("Money in")).toBeVisible();

  // What's due, where the money went, and the latest transactions with what each one is.
  await expect(page.getByRole("region", { name: "Upcoming" }).getByText(/due in the next 14 days/)).toBeVisible();
  const where = page.getByRole("region", { name: "Where it went" });
  await expect(where.getByRole("img", { name: /spending by category: Rent & Utilities \d+%/ })).toBeVisible();
  const recent = page.getByRole("region", { name: "Recent transactions" });
  await expect(recent.getByRole("row")).toHaveCount(8); // the header and seven
  await expect(recent.getByRole("cell", { name: "Card payment" }).first()).toBeVisible();

  // The goals that most need you.
  const goals = page.getByRole("region", { name: "Goals" });
  await expect(goals.getByText(/saved of \$[\d,]+ across/)).toBeVisible();

  // Only what needs doing sits above it all: here, a bank to reconnect.
  await expect(page.getByRole("status", { name: "Needs your attention" }).getByText(/stopped syncing/)).toBeVisible();
});

test("the overview's two columns end level with no gaps, and a phone leads with what's safe to spend", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await afterWelcome(page);
  const bottom = (name: string | RegExp) => page.getByRole("region", { name }).evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
  await expect.poll(async () => Math.abs((await bottom("Goals")) - (await bottom("Where it went")))).toBeLessThanOrEqual(1);

  // One column on a phone: what's safe to spend first, then the headline figures, then the chart.
  await page.setViewportSize({ width: 390, height: 844 });
  const top = (name: string | RegExp) => page.getByRole("region", { name }).evaluate((el) => el.getBoundingClientRect().top);
  await expect.poll(async () => (await top("Safe to spend")) < (await top("Net worth"))).toBe(true);
  expect(await top("Net worth")).toBeLessThan(await top(/^Spending in /));
  expect(await top(/^Spending in /)).toBeLessThan(await top("Upcoming"));
});
