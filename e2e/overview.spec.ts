import { afterWelcome, expect, test } from "./test";

const MONTH = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long" }).format(new Date());

test("the overview: net worth and its line, the latest transactions, the next payment, spending, where it went", async ({ page }) => {
  await page.goto("/");
  await afterWelcome(page);

  // Net worth, how it moved over the range picked, and its line.
  const worth = page.getByRole("region", { name: "Net worth" });
  await expect(worth.getByText(/over the last month/)).toBeVisible();
  await expect(worth.getByRole("img", { name: /Net worth over the last month: from \$[\d,.]+ to \$[\d,.]+/ })).toBeVisible();
  await worth.getByRole("radio", { name: "the last year" }).click();
  await expect(worth.getByText(/over the last year/)).toBeVisible();
  await expect(worth.getByRole("link", { name: /Accounts/ })).toHaveAttribute("href", "/accounts");

  // The next payment due, with what else is due in two weeks.
  const next = page.getByRole("region", { name: "Next payment" });
  await expect(next.getByText(/Card payment|Bill|Installment/)).toBeVisible();
  await expect(next.getByText(/today|tomorrow|in \d+ days/)).toBeVisible();

  // Spending by the day, week or month, against the usual.
  const spending = page.getByRole("region", { name: "Spending" });
  await expect(spending.getByText("this month")).toBeVisible();
  await spending.getByRole("radio", { name: "Day" }).click();
  await expect(spending.getByText("today")).toBeVisible();
  await expect(spending.getByRole("img", { name: /Spending, the last 7 days:/ })).toBeVisible();

  // Where this month's money went, and the latest transactions with what each one is.
  const where = page.getByRole("region", { name: "Where it went" });
  await expect(where.getByRole("img", { name: new RegExp(`${MONTH} spending by category: Rent & Utilities \\d+%`) })).toBeVisible();
  const recent = page.getByRole("region", { name: "Recent transactions" });
  await expect(recent.getByRole("row")).toHaveCount(9); // the header and eight
  await expect(recent.getByRole("cell", { name: "Card payment" }).first()).toBeVisible();

  // Only what needs doing sits above it all: here, a bank to reconnect.
  await expect(page.getByRole("status", { name: "Needs your attention" }).getByText(/stopped syncing/)).toBeVisible();
});

test("the overview's two columns end level, and a phone leads with net worth", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await afterWelcome(page);
  const bottom = (name: string) => page.getByRole("region", { name }).evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
  await expect.poll(async () => Math.abs((await bottom("Recent transactions")) - (await bottom("Where it went")))).toBeLessThanOrEqual(1);

  // One column on a phone: net worth, then the next payment, spending, the transactions, where it went.
  await page.setViewportSize({ width: 390, height: 844 });
  const top = (name: string) => page.getByRole("region", { name }).evaluate((el) => el.getBoundingClientRect().top);
  await expect.poll(async () => (await top("Net worth")) < (await top("Next payment"))).toBe(true);
  expect(await top("Next payment")).toBeLessThan(await top("Spending"));
  expect(await top("Spending")).toBeLessThan(await top("Recent transactions"));
  expect(await top("Recent transactions")).toBeLessThan(await top("Where it went"));
});
