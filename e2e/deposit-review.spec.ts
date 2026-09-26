import { afterWelcome, expect, mockWrites, test } from "./test";

type Write = { method: string; table: string; body: unknown };
const body = (w: Write) => (w.body ?? {}) as Record<string, unknown>;

test("a deposit that isn't pay or interest is asked about on the Overview, and income sticks", async ({ page }) => {
  await page.goto("/");
  await afterWelcome(page);
  const card = page.getByRole("region", { name: "Deposits to review" });
  await expect(card).toBeVisible();
  // The Zelle and the check, not the paychecks, interest or the transfer to savings.
  await expect(card.getByRole("listitem")).toHaveCount(2);
  await expect(card).toContainText("Zelle Transfer");
  await expect(card).toContainText("Zelle payment from JORDAN LEE");
  await expect(card).not.toContainText("Paycheck");

  await card.getByRole("group", { name: /\$200\.00/ }).getByRole("button", { name: "Income" }).click();
  await expect(page.getByText("$200.00 counted as income")).toBeVisible();
  await expect(card.getByRole("listitem")).toHaveCount(1);

  const writes = await mockWrites(page);
  expect(writes.some((w) => w.table === "transaction_overrides" && body(w).category === "INCOME")).toBe(true);
  expect(writes.some((w) => w.table === "ui_preferences" && body(w).key === "deposit_reviews")).toBe(true);

  // Answered for good: it stays gone after a reload.
  await page.reload();
  await expect(page.getByRole("region", { name: "Deposits to review" }).getByRole("listitem")).toHaveCount(1);
});

test("a Zelle paying back a charge comes off that charge, and can be undone", async ({ page }) => {
  await page.goto("/");
  await afterWelcome(page);
  const card = page.getByRole("region", { name: "Deposits to review" });
  await card.getByRole("group", { name: /\$45\.00/ }).getByRole("button", { name: "Paid me back" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "What was this deposit?" })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Paid back a charge" })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("textbox", { name: "Search charges" }).fill("kroger");
  await dialog.getByRole("radiogroup", { name: "The charge they paid back" }).getByRole("radio").first().click();
  await expect(dialog.getByText(/is what counts as spending|won't count as your spending/)).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/comes off Kroger/)).toBeVisible();

  let writes = await mockWrites(page);
  expect(writes.some((w) => w.table === "transaction_overrides" && body(w).reimbursed_amount === 45)).toBe(true);
  expect(writes.some((w) => w.table === "transaction_overrides" && body(w).category === "TRANSFER_IN")).toBe(true);

  // Undo puts it back to be asked again, and takes the $45 off the charge.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(card.getByRole("group", { name: /\$45\.00/ })).toBeVisible();
  writes = await mockWrites(page);
  expect(writes.some((w) => w.table === "transaction_overrides" && w.method !== "GET" && body(w).reimbursed_amount === null)).toBe(true);
});

test("paid back for something paid in cash records the cash purchase", async ({ page }) => {
  await page.goto("/");
  await afterWelcome(page);
  const card = page.getByRole("region", { name: "Deposits to review" });
  await card.getByRole("group", { name: /\$45\.00/ }).getByRole("button", { name: "Paid me back" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Paid back cash I spent" }).click();
  await dialog.getByLabel("What you paid for").fill("Dinner at Olive Garden");
  await dialog.getByLabel("You paid, in all").fill("90");
  await expect(dialog.getByText(/Your share, \$45\.00, counts as spending\./)).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Dinner at Olive Garden added as a cash purchase/)).toBeVisible();

  const writes = await mockWrites(page);
  const purchase = writes.find((w) => w.table === "manual_transactions" && w.method === "POST");
  expect(body(purchase!)).toMatchObject({ name: "Dinner at Olive Garden", amount: 90, payment_method: "Cash", reimbursed_amount: 45 });
});

test("your own money from cash comes out of Cash, and a new deposit is an alert", async ({ page }) => {
  await page.goto("/");
  const res = await page.request.post("/api/alerts/check");
  expect(res.ok()).toBe(true);
  // Recorded for the bell (and pushed, unless the run already sent its most).
  const alerts = (await mockWrites(page)).filter((w) => w.table === "alert_events").map((w) => body(w));
  expect(alerts.find((a) => a.kind === "deposit-review")).toMatchObject({ title: "$45.00 came in: what was it?" });

  await afterWelcome(page);
  const card = page.getByRole("region", { name: "Deposits to review" });
  await card.getByRole("group", { name: /\$45\.00/ }).getByRole("button", { name: "My own money" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "From my cash" })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("$45.00 came from your cash")).toBeVisible();
  const writes = await mockWrites(page);
  expect(writes.some((w) => w.table === "manual_assets" && w.method === "PATCH")).toBe(true);
});

test("a deposit split between cash handed over and income, then changed and undone from Reviewed", async ({ page }) => {
  await page.goto("/");
  await afterWelcome(page);
  const card = page.getByRole("region", { name: "Deposits to review" });
  await card.getByRole("group", { name: /\$45\.00/ }).getByRole("button", { name: "Split" }).click();

  // $30 was cash handed over for it, the rest is income.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Split this deposit" })).toBeVisible();
  await dialog.getByLabel("Part 1 amount").fill("30");
  await expect(dialog.getByLabel("Part 2 amount")).toHaveValue("15");
  await expect(dialog.getByText("Adds up to $45.00")).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Split into 2 parts")).toBeVisible();

  let writes = await mockWrites(page);
  expect(writes.some((w) => w.table === "transaction_overrides" && body(w).category === "INCOME")).toBe(true);
  expect(writes.some((w) => w.table === "manual_assets" && w.method === "PATCH")).toBe(true);

  // It's under Reviewed, with both parts.
  await card.getByRole("radio", { name: /^Reviewed/ }).click();
  const reviewed = card.getByRole("list", { name: "Reviewed" });
  const row = reviewed.getByRole("listitem").filter({ hasText: "Zelle Transfer" });
  await expect(row).toContainText("From my cash");
  await expect(row).toContainText("$30.00");
  await expect(row).toContainText("Income");
  await expect(row).toContainText("$15.00");

  // Change it to all income.
  await row.getByRole("button", { name: "Change" }).click();
  await expect(dialog.getByRole("heading", { name: "Change what this deposit was" })).toBeVisible();
  await dialog.getByRole("button", { name: "Remove part 1" }).click();
  await expect(dialog.getByRole("radio", { name: "Income" })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("$45.00 counted as income")).toBeVisible();
  await expect(row).not.toContainText("From my cash");

  // And undo it: it goes back to be reviewed.
  await row.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Zelle Transfer is back in Deposits to review")).toBeVisible();
  writes = await mockWrites(page);
  expect(writes.filter((w) => w.table === "manual_assets" && w.method === "PATCH").length).toBeGreaterThanOrEqual(2);
});

test("adding a transaction by hand picks how it was paid", async ({ page }) => {
  await page.goto("/transactions");
  await afterWelcome(page);
  await page.getByRole("button", { name: "Add transaction" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("20");
  await dialog.getByLabel("Name / merchant").fill("Farmers Market");
  const methods = dialog.getByRole("radiogroup", { name: "Payment method" });
  await methods.getByRole("radio", { name: "Check" }).click();
  await expect(methods.getByRole("radio", { name: "Check" })).toHaveAttribute("aria-checked", "true");
  // Anything not listed goes under Other.
  await methods.getByRole("radio", { name: "Other" }).click();
  await dialog.getByLabel("Other payment method").fill("Money order");
  await methods.getByRole("radio", { name: "Zelle" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Transaction added")).toBeVisible();

  const writes = await mockWrites(page);
  expect(body(writes.find((w) => w.table === "manual_transactions" && w.method === "POST")!)).toMatchObject({ name: "Farmers Market", payment_method: "Zelle" });
});
