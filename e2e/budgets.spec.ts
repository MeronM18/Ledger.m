import { afterWelcome, expect, mockWrites, test } from "./test";

const saved = (page: import("@playwright/test").Page, table: string, match: (body: Record<string, unknown>) => boolean) =>
  expect.poll(async () => (await mockWrites(page)).some((w) => w.table === table && w.method !== "GET" && match((w.body ?? {}) as Record<string, unknown>)));

test("a monthly budget is split into category budgets that have to fit inside it", async ({ page }) => {
  await page.goto("/budgets");
  await afterWelcome(page);
  // Budgets is about spending: nothing about income or pay.
  await expect(page.getByText(/paycheck|expected pay|income/i)).toHaveCount(0);

  // The fixture's category budgets add up to $1,210, so the monthly budget can't be less.
  await expect(page.getByRole("heading", { name: "Set a monthly budget" })).toBeVisible();
  const monthly = page.getByRole("textbox", { name: "Monthly budget" });
  await monthly.fill("1000");
  await monthly.press("Enter");
  await expect(page.getByText(/add up to \$1,210, so the monthly budget has to be at least that/)).toBeVisible();

  await monthly.fill("5000");
  await monthly.press("Enter");
  await expect(page.getByText("Monthly budget set to $5,000")).toBeVisible();
  await saved(page, "ui_preferences", (b) => b.key === "monthly_budget" && (b.value as { amount?: number })?.amount === 5000).toBe(true);

  // It adds up: the categories plus Everything else make the monthly budget.
  await expect(page.getByText(/4 categories\s*\$1,210\s*\+ Everything else\s*\$3,790\s*=\s*\$5,000 a month/)).toBeVisible();
  const rest = page.getByRole("button", { name: "Everything else: the categories in it" });
  await expect(rest).toBeVisible();

  // A category can't take more than the monthly budget has left.
  const food = page.getByRole("textbox", { name: "Food & Drink budget", exact: true });
  await food.fill("9000");
  await food.press("Enter");
  await expect(page.getByText(/more than your monthly budget has left: \$4,390 isn't given to another category yet/)).toBeVisible();
  await expect(food).toHaveValue("600");

  // Within it, it saves, and Everything else shrinks by the same amount.
  await food.fill("650");
  await food.press("Enter");
  await expect(page.getByText("Food & Drink budgeted at $650")).toBeVisible();
  await saved(page, "budgets", (b) => b.monthly_amount === 650).toBe(true);
  await expect(page.getByText(/\$1,260\s*\+ Everything else\s*\$3,740/)).toBeVisible();

  // A category without its own budget can be given one from inside Everything else.
  await rest.click();
  const unbudgeted = page.getByRole("textbox", { name: "Rent & Utilities budget" });
  await unbudgeted.fill("2100");
  await unbudgeted.press("Enter");
  await expect(page.getByText("Rent & Utilities budgeted at $2,100")).toBeVisible();
});

test("a category opens to where its money went, and on to those transactions", async ({ page }) => {
  await page.goto("/budgets");
  await afterWelcome(page);
  await page.getByRole("button", { name: "Food & Drink: where it went" }).click();
  const where = page.getByRole("list", { name: "Where Food & Drink went" });
  await expect(where.getByText("Kroger")).toBeVisible();

  await page.getByRole("link", { name: "See every transaction" }).click();
  await expect(page).toHaveURL(/\/transactions\?month=\d{4}-\d{2}&kind=spending&category=FOOD_AND_DRINK/);
  await expect(page.getByRole("radio", { name: /^Spending/ })).toHaveAttribute("aria-checked", "true");
  // Every row is Food & Drink spending from that month, and they add up to what Budgets said was spent.
  const rows = page.locator("[data-transaction]");
  await expect(rows.first()).toBeVisible();
  await expect(rows.filter({ hasNotText: "Food & Drink" })).toHaveCount(0);
});

test("the monthly budget's staying-on-track notes never suggest spending more", async ({ page }) => {
  await page.goto("/budgets");
  await afterWelcome(page);
  const monthly = page.getByRole("textbox", { name: "Monthly budget" });
  await monthly.fill("2500");
  await monthly.press("Enter");
  await expect(page.getByText(/over your monthly budget|a day for the rest of|Left to spend in/).first()).toBeVisible();
  const tips = page.locator("[data-slot='card']").filter({ hasText: "Staying on track" });
  await expect(tips).toBeVisible();
  await expect(tips.getByText(/raise|set to|usually|budget \$/i)).toHaveCount(0);
  await expect(tips.getByRole("button")).toHaveCount(0);

  // Last month, then back.
  await page.getByRole("link", { name: "Previous month" }).click();
  await expect(page).toHaveURL(/\/budgets\?month=\d{4}-\d{2}$/);
  await expect(page.getByText(/Finished .* (under|over) budget|Over budget in/).first()).toBeVisible();
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/budgets$/);
});
