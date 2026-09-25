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
  await expect(dialog.getByRole("heading", { name: "Someone paid you back" })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Search charges" }).fill("kroger");
  await dialog.getByRole("radiogroup", { name: "The charge they paid back" }).getByRole("radio").first().click();
  await expect(dialog.getByText(/is what counts as spending|won't count as your spending/)).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/comes off that charge/)).toBeVisible();

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
  await dialog.getByRole("radio", { name: "Something I paid in cash" }).click();
  await dialog.getByLabel("What you paid for").fill("Dinner at Olive Garden");
  await dialog.getByLabel("You paid, in all").fill("90");
  await expect(dialog.getByText("Your share, $45.00, counts as spending.")).toBeVisible();
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
  await page.getByRole("dialog").getByRole("radio", { name: /Cash I deposited/ }).click();
  await expect(page.getByText("$45.00 moved from your cash to the bank")).toBeVisible();
  const writes = await mockWrites(page);
  expect(writes.some((w) => w.table === "manual_assets" && w.method === "PATCH")).toBe(true);
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
