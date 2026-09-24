import { afterWelcome, expect, mockPushes, mockWrites, test } from "./test";

test("income shows the baseline to budget around and this month against it", async ({ page }) => {
  await page.goto("/income");
  await expect(page.getByText(/Your lowest month in the last year was/)).toBeVisible();
  await expect(page.getByText(/(above your baseline|to go to reach your baseline)/)).toBeVisible();
  await expect(page.getByText("Every month", { exact: true })).toBeVisible();
});

test("year in review switches years", async ({ page }) => {
  await page.goto("/year-in-review");
  await afterWelcome(page);
  const years = page.getByRole("navigation", { name: "Year" }).getByRole("link");
  const last = years.last();
  const lastYear = (await last.textContent())!.trim();
  await last.click();
  await expect(page).toHaveURL(new RegExp(`year=${lastYear}$`));
  await expect(page.getByText(lastYear, { exact: true }).first()).toBeVisible();
});

test("accounts: a bank that signed out offers Reconnect instead of Sync now", async ({ page }) => {
  await page.goto("/accounts");
  const card = page.locator("[data-slot=card]").filter({ hasText: "Fifth Third Bank" });
  await expect(card.getByText("Sign-in needed")).toBeVisible();
  await expect(card.getByRole("button", { name: "Reconnect" })).toBeVisible();
  await expect(card.getByRole("button", { name: /Sync now/ })).toHaveCount(0);
});

test("accounts: cards reorder from the keyboard and the order is kept", async ({ page }) => {
  await page.goto("/accounts");
  await afterWelcome(page);
  const titles = () => page.locator("[data-slot=card-title]").allTextContents();
  const before = (await titles()).filter((t) => t !== "Credit utilization");

  const grip = page.getByRole("button", { name: `Move ${before[1]}`, exact: true });
  // Pick up, move one place up, drop, with a beat between like a person
  // pressing keys (the drag measures the cards when it's picked up).
  await grip.focus();
  for (const key of ["Space", "ArrowUp", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }

  await expect.poll(async () => (await mockWrites(page)).some((w) => w.table === "ui_preferences")).toBe(true);
  await page.reload();
  const after = (await titles()).filter((t) => t !== "Credit utilization");
  expect(after.slice(0, 2)).toEqual([before[1], before[0]]);
});

test("settings: switching an alert off sticks and stops that alert", async ({ page }) => {
  await page.goto("/settings");
  await afterWelcome(page);
  const unusual = page.getByRole("switch", { name: /Unusual charges/ });
  await expect(unusual).toBeChecked();
  await unusual.click();
  await expect(unusual).not.toBeChecked();
  await expect.poll(async () => (await mockWrites(page)).some((w) => w.table === "ui_preferences")).toBe(true);

  await page.reload();
  await expect(page.getByRole("switch", { name: /Unusual charges/ })).not.toBeChecked();

  const res = await page.request.post("/api/alerts/check");
  expect(res.ok()).toBe(true);
  const titles = (await mockPushes(page)).map((p) => p.title);
  expect(titles.some((t) => t.includes("Unusual charge"))).toBe(false);
  expect(titles.some((t) => t.includes("Sign in to Fifth Third Bank again"))).toBe(true);
});

test("alerts: an unusually large charge is pushed", async ({ page }) => {
  await page.goto("/");
  const res = await page.request.post("/api/alerts/check");
  expect(res.ok()).toBe(true);
  const pushes = await mockPushes(page);
  expect(pushes.find((p) => p.title.includes("Unusual charge at Kroger"))?.message).toContain("$486.20");
});

test("settings: the backup downloads every table and no secrets", async ({ page }) => {
  await page.goto("/settings");
  await afterWelcome(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Download backup/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^ledger-m-backup-\d{4}-\d{2}-\d{2}\.json$/);

  const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8"));
  const backup = JSON.parse(text);
  expect(backup.app).toBe("Ledger.m");
  expect(backup.counts.transactions).toBeGreaterThan(100);
  expect(Object.keys(backup.tables)).toEqual(expect.arrayContaining(["transactions", "budgets", "savings_goals", "merchant_rules"]));
  expect(text).not.toContain("access_token");
  expect(text).not.toContain("transactions_cursor");
});
