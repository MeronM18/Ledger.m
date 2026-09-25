import type { Page } from "@playwright/test";
import { afterWelcome, expect, test } from "./test";

const money = (text: string | null) => Number((text ?? "").replace(/[^\d.-]/g, ""));

test("transactions: each row says what it is, and a card payment names the card it paid", async ({ page }) => {
  await page.goto("/transactions");
  await afterWelcome(page);
  const row = (name: string) => page.locator("[data-transaction]").filter({ hasText: name }).first();

  // The payment from checking and the same payment landing on the card, each naming the other side.
  const fromChecking = row("To Chase Freedom Flex");
  await expect(fromChecking).toContainText("Card payment");
  const onCard = row("Payment Thank You-Mobile");
  await expect(onCard).toContainText(/From Total Checking/);
  await expect(onCard).toContainText("Card payment");

  // The panel says it isn't spending, and where it came from.
  await onCard.click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("Paid from")).toBeVisible();
  await expect(panel.getByText("Not spending")).toBeVisible();
  await expect(panel.getByText(/the purchases on the card already count/)).toBeVisible();
  await page.keyboard.press("Escape");

  // A purchase on a card says it was paid with it, and counts as spending in its category.
  await row("Shell").click();
  await expect(panel.getByText("Paid with")).toBeVisible();
  await expect(panel.getByText("Spending in Transportation")).toBeVisible();
  await page.keyboard.press("Escape");

  // The kinds as tabs: card payments alone, then spending with no card payment in it.
  await page.getByRole("radio", { name: /^Card payments/ }).click();
  const rows = page.locator("[data-transaction]");
  await expect(rows.first()).toBeVisible();
  await expect(rows.filter({ hasNotText: "Card payment" })).toHaveCount(0);
  await page.getByRole("radio", { name: /^Spending/ }).click();
  await expect(rows.first()).toBeVisible();
  await expect(rows.filter({ hasText: "Card payment" })).toHaveCount(0);

  // Money moved into an account a goal follows says which goal it's for.
  await page.getByRole("radio", { name: /^Transfers/ }).click();
  await expect(rows.filter({ hasText: "Start a business" }).first()).toBeVisible();
});

/** This month's spending as each page shows it. */
async function spendingEverywhere(page: Page) {
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()).slice(0, 7);

  await page.goto("/");
  await afterWelcome(page);
  const overview = page.locator("[data-slot=card]").filter({ has: page.getByText(/^\w+ \d{4} spending$/) });
  const overviewTotal = money(await overview.locator(".font-mono").first().textContent());

  await page.goto("/budgets");
  const budgetsTotal = money(await page.getByText(/spent of \$2,500/).locator(".font-mono").first().textContent());

  await page.goto("/reports/spending");
  const spendingTotal = money(await page.getByTestId("summary-total").textContent());

  await page.goto(`/transactions?month=${month}&kind=spending`);
  const transactionsTotal = money(await page.getByTestId("summary-spending").textContent());

  await page.goto("/reports/cash-flow");
  const cashFlowTotal = money(await page.getByText("Total expenses", { exact: true }).locator("xpath=..").locator(".font-mono").textContent());

  return { overviewTotal, budgetsTotal, spendingTotal, transactionsTotal, cashFlowTotal };
}

test("the month's spending is the same on Overview, Budgets, Spending, Transactions and Cash flow", async ({ page }) => {
  await page.goto("/budgets");
  await afterWelcome(page);
  const monthly = page.getByRole("textbox", { name: "Monthly budget" });
  await monthly.fill("2500");
  await monthly.press("Enter");
  await expect(page.getByText("Monthly budget set to $2,500")).toBeVisible();

  const totals = await spendingEverywhere(page);
  expect(totals.overviewTotal).toBeGreaterThan(0);
  for (const [page, total] of Object.entries(totals)) expect(total, page).toBe(totals.overviewTotal);
});

test("goals: each month's deposits against what the plan needs, the latest activity, and spending against the budget", async ({ page }) => {
  await page.goto("/goals");
  await afterWelcome(page);
  const business = page.locator("[data-slot=card]").filter({ has: page.getByRole("heading", { name: "Start a business", exact: true }) });

  const months = business.getByRole("region", { name: "Start a business, month by month" });
  await expect(months.getByText(/so far: \$[\d,]+ moved in/)).toBeVisible();
  await expect(months.getByText(/^needed \$[\d,]+$/)).toBeVisible();
  await expect(business.getByRole("list", { name: "Start a business milestones" }).getByRole("listitem")).toHaveCount(4);

  const activity = business.getByRole("region", { name: "Start a business, latest activity" });
  await expect(activity.getByRole("listitem").first()).toBeVisible();
  await activity.getByRole("link", { name: /in Transactions/ }).click();
  await expect(page).toHaveURL(/\/transactions\?account=/);

  // The top of Goals ties back to Budgets.
  await page.goto("/goals");
  await expect(page.getByText(/^\w+ so far$/)).toBeVisible();
  await page.getByRole("link", { name: /Set a monthly budget/ }).click();
  await expect(page).toHaveURL(/\/budgets$/);
});
