import { afterWelcome, expect, mockPushes, mockWrites, test } from "./test";

test("income shows the baseline to budget around and this month against it", async ({ page }) => {
  await page.goto("/reports/income");
  await expect(page.getByText(/Your lowest month in the last year was/)).toBeVisible();
  await expect(page.getByText(/(above your baseline|to go to reach your baseline)/)).toBeVisible();
  await expect(page.getByText("Every month", { exact: true })).toBeVisible();
});

test("income: the total for any period, narrowed by kind and by source", async ({ page }) => {
  await page.goto("/reports/income");
  await afterWelcome(page);
  await expect(page.getByText(/^Total income · /)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Period" })).toHaveText(/Last 12 months/);
  await expect(page.getByText("Spent", { exact: true })).toBeVisible();

  // Interest alone: spending isn't set against a slice of income.
  await page.getByRole("radio", { name: "Interest" }).click();
  await expect(page.getByText("Spent", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show all income" }).click();
  await expect(page.getByText("Spent", { exact: true })).toBeVisible();

  // Picking a source narrows the deposits to it.
  const source = page.getByRole("button", { name: /^United Mortgage Paycheck/ });
  await source.click();
  await expect(source).toHaveAttribute("aria-pressed", "true");
  const deposits = page.locator("li").filter({ hasText: /· (Paycheck|Interest|Other) ·/ });
  await expect(deposits.first()).toBeVisible();
  for (const text of await deposits.allInnerTexts()) expect(text).toContain("United Mortgage Paycheck");
});

test("reports: spending narrows to a category, and its totals match the list", async ({ page }) => {
  await page.goto("/reports/spending");
  await afterWelcome(page);
  const count = page.getByTestId("summary-count");
  const total = page.getByTestId("summary-total");
  const all = Number(await count.textContent());
  expect(all).toBeGreaterThan(0);

  // Picking a category narrows the list and the summary to it.
  const food = page.getByRole("button", { name: /Food & Drink/ }).first();
  const foodAmount = (await food.innerText()).match(/\$[\d,]+\.\d{2}/)![0];
  await food.click();
  await expect(count).not.toHaveText(String(all));
  await expect(total).toHaveText(foodAmount);
  const rows = page.locator("[data-transaction]");
  expect(await rows.count()).toBe(Number(await count.textContent()));
  for (const text of await rows.allInnerTexts()) expect(text).toContain("Food & Drink");

  // A row opens in the side panel.
  await rows.first().click();
  await expect(page.getByRole("dialog").getByText("Status", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // By merchant, as bars.
  await page.getByRole("combobox", { name: "Group by" }).click();
  await page.getByRole("option", { name: "By merchant" }).click();
  await page.getByRole("radio", { name: "Bars" }).click();
  await expect(page.getByText("Spending by merchant")).toBeVisible();
  await expect(count).toHaveText(String(all));

  // Over time is one total a month, so there's no grouping to pick.
  await page.getByRole("radio", { name: "Change over time" }).click();
  await expect(page.getByText("Spending over time")).toBeVisible();
  // The span the chart draws, not the period's days: this month in the year leading up to it.
  await expect(page.getByText(/^[A-Z][a-z]{2} \d{4} – [A-Z][a-z]{2} \d{4}$/)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Group by" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Total amounts" }).click();
  await expect(page.getByRole("combobox", { name: "Group by" })).toBeVisible();
});

test("reports: cash flow shows where the money came from and went", async ({ page }) => {
  await page.goto("/reports/cash-flow");
  await afterWelcome(page);
  for (const label of ["Total income", "Total expenses", "Net income", "Savings rate"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  const labels = page.locator('[aria-label="Where your money came from and went"] text');
  await expect(labels.filter({ hasText: /^Income\$/ })).toBeVisible();
  await expect(labels.filter({ hasText: /^Food & Drink\$/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Period" }).click();
  await page.getByRole("option", { name: "This year" }).click();
  await expect(page.getByText(/^Jan 1 – /)).toBeVisible();
  // Just the report: no forecast below it.
  await expect(page.getByText("Looking ahead")).toHaveCount(0);

  // The same money as a treemap, and month by month.
  await page.getByRole("radio", { name: "Treemap" }).click();
  await expect(page.getByRole("img", { name: "Where your money went, as tiles" })).toBeVisible();
  await expect(page.getByText(/Each tile is as big as its share of your income/)).toBeVisible();
  await page.getByRole("radio", { name: "Over time" }).click();
  await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expect(page.getByText("Income", { exact: true }).last()).toBeVisible();
});

test("year in review switches years", async ({ page }) => {
  await page.goto("/reports/year");
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
  const card = page.locator("[data-connection='Fifth Third Bank']");
  await expect(card.getByText("Sign-in needed")).toBeVisible();
  await expect(card.getByRole("button", { name: "Reconnect" })).toBeVisible();
  await expect(card.getByRole("button", { name: /Sync now/ })).toHaveCount(0);
});

test("accounts: groups reorder from the keyboard and the order is kept", async ({ page }) => {
  await page.goto("/accounts");
  await afterWelcome(page);
  // Each group's grip is labeled "Move <group>".
  const titles = () =>
    page.getByRole("button", { name: /^Move / }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")!.slice("Move ".length)));
  await expect(page.getByRole("button", { name: /^Move / }).first()).toBeVisible();
  const before = await titles();

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
  await expect.poll(async () => (await titles()).slice(0, 2)).toEqual([before[1], before[0]]);
});

test("accounts: grouped by what they are, with net worth over a chosen period and a summary", async ({ page }) => {
  await page.goto("/accounts");
  await afterWelcome(page);
  for (const group of ["Cash", "Credit cards"]) {
    await expect(page.getByRole("button", { name: `Move ${group}`, exact: true })).toBeVisible();
  }
  await expect(page.getByText("1 month change").first()).toBeVisible();
  await page.getByRole("combobox", { name: "Period" }).click();
  await page.getByRole("option", { name: "1 year" }).click();
  await expect(page.getByText("1 year change").first()).toBeVisible();

  // Pointing at a date on the net worth line reads that date, with over a
  // year of history too: the line was once keyed on "Sep 1"-style labels,
  // and pointing at the later of two took the tooltip to the earlier.
  await page.getByRole("combobox", { name: "Period" }).click();
  await page.getByRole("option", { name: "All time" }).click();
  await expect(page.getByRole("combobox", { name: "Period" })).toHaveText("All time");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  const chart = page.locator(".recharts-wrapper").first();
  // The last tick but one: recharts may nudge the last label in from the edge.
  const tick = chart.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value").nth(-2);
  const [month, year] = (await tick.textContent())!.split(" ");
  const tickX = await tick.evaluate((el) => {
    const text = el as SVGTextElement;
    const point = text.ownerSVGElement!.createSVGPoint();
    point.x = Number(text.getAttribute("x"));
    return point.matrixTransform(text.getScreenCTM()!).x;
  });
  const plot = (await chart.locator(".recharts-area-curve").boundingBox())!;
  await page.mouse.move(tickX - 40, plot.y + plot.height / 2);
  await page.mouse.move(tickX, plot.y + plot.height / 2, { steps: 4 });
  await expect(chart.locator(".recharts-tooltip-label")).toHaveText(new RegExp(`^${month}\\w* 1, ${year}$`));

  // Clicking that day takes its net worth apart, adding up to the line's value.
  const value = await chart.locator(".recharts-tooltip-item-value").textContent();
  await page.mouse.click(tickX, plot.y + plot.height / 2);
  const day = page.getByRole("region", { name: new RegExp(`^Net worth on ${month}\\w* 1, ${year}$`) });
  await expect(day.getByRole("rowheader", { name: "Cash", exact: true }).first()).toBeVisible();
  await expect(day.locator("tfoot td").first()).toHaveText(value!);
  await day.getByRole("button", { name: "Back to today" }).click();
  await expect(day).toHaveCount(0);

  // A group folds shut.
  await page.getByRole("button", { name: "Collapse Credit cards" }).click();
  await expect(page.getByRole("link", { name: "Chase Freedom Flex", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Credit cards" }).click();

  // An account opens its transactions.
  await page.getByRole("link", { name: "Chase Freedom Flex", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions\?account=/);
  await expect(page.getByRole("button", { name: "Filters (1 on)" })).toBeVisible();
  await expect(page.locator("[data-transaction]").first()).toContainText("Chase Freedom Flex");
});

test("goals: each goal says its next step, and its panel says where it stands and what to save", async ({ page }) => {
  await page.goto("/goals");
  await afterWelcome(page);

  // The list: a card per goal with its status and one next step.
  const card = page.getByRole("button", { name: /^Start a business:/ });
  await expect(card.getByText(/^(Ahead of pace|On pace|Behind pace)$/)).toBeVisible();
  await expect(card.getByText(/^(Move \$[\d,]+( more)? from your [A-Z][a-z]{2} \d+ paycheck|Save \$[\d,]+ a month to finish on time)$/)).toBeVisible();

  // Its panel has the rest.
  await card.click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText(/^\$[\d,]+ to go · \d+ months? left$/)).toBeVisible();
  await expect(panel.getByText("Save each month")).toBeVisible();
  await expect(panel.getByText(/about \d+% of your pay/)).toBeVisible();
  await expect(panel.getByText(/^From your [A-Z][a-z]{2} \d+ check$/)).toBeVisible();
  await expect(panel.getByText("At your current pace")).toBeVisible();
  await expect(panel.getByRole("group", { name: /saved over time/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // Tracked by hand: no pace to read, but still a monthly amount.
  await page.getByRole("button", { name: /^Japan trip:/ }).click();
  await expect(page.getByRole("dialog").getByText(/^Tracked by hand · by /)).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Save each month")).toBeVisible();
  await page.keyboard.press("Escape");

  // A new goal says what it would take before it's saved.
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByLabel("Target", { exact: true }).fill("8000");
  await page.getByLabel("Target date (optional)").fill("2030-06-30");
  await expect(page.getByRole("dialog").getByText(/^That's \$[\d,]+ a month for \d+ months, about \d+% of a typical month's pay\.$/)).toBeVisible();
});

test("recurring: a subscription whose price changed says by how much", async ({ page }) => {
  await page.goto("/recurring");
  await afterWelcome(page);
  // Spotify's latest charge went from $11.99 to $12.99.
  const spotify = page.getByRole("button", { name: /^Spotify,/ });
  await expect(spotify).toContainText("Up $1.00");
  await spotify.click();
  await expect(page.getByRole("dialog").getByText(/went up \$1\.00 \(8%\): \$12\.99 on .+, after \$11\.99 on /)).toBeVisible();
});

test("rewards: card purchases show what they earned, and Accounts adds it up", async ({ page }) => {
  await page.goto("/transactions");
  await afterWelcome(page);
  const row = (name: string) => page.locator("[data-transaction]").filter({ hasText: name }).first();
  // Dining on Freedom Flex shows its multiplier (5x in a quarter where dining
  // is the rotating category), Apple Card its Daily Cash, a payment nothing.
  const chipotle = row("Chipotle");
  await expect(chipotle).toContainText(/[35]x dining/);
  await expect(row("Apple Store")).toContainText(/\$\d+\.\d{2} Daily Cash/);
  await expect(row("Payment Thank You")).not.toContainText(/\dx |Daily Cash/);
  await chipotle.click();
  await expect(page.getByRole("dialog").getByText(/^[35]x on dining/)).toBeVisible();
  await expect(page.getByRole("dialog").getByText(/^\d[\d,]* points · Chase Freedom Flex/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/accounts");
  const rewards = page.locator("[data-slot=card]").filter({ has: page.getByText("Rewards", { exact: true }) });
  await expect(rewards.getByText(/this year/).first()).toBeVisible();
  await expect(rewards.getByText(/^5% until /)).toBeVisible();
  await expect(rewards.getByRole("progressbar", { name: /5% categories used this quarter/ })).toBeVisible();
});

test("assets: a vehicle counts from the date it's given, and a new value keeps the old one as history", async ({ page }) => {
  await page.goto("/accounts");
  await afterWelcome(page);
  const manager = page.locator("#manual-assets");
  await manager.getByRole("button", { name: "Add asset" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Vehicle" }).click();
  await expect(dialog.getByRole("radio", { name: "Vehicle" })).toHaveAttribute("aria-checked", "true");
  await dialog.getByLabel("Name").fill("Ram Truck");
  await dialog.getByLabel("Worth").fill("26000");
  await dialog.getByLabel("As of").fill("2025-06-01");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(manager.getByText("Vehicle · since Jun 1, 2025")).toBeVisible();
  const saved = (await mockWrites(page)).filter((w) => w.table === "ui_preferences" && (w.body as { key?: string }).key === "asset_values");
  expect(JSON.stringify(saved.at(-1)?.body)).toContain('"date":"2025-06-01","value":26000');

  // Worth less today: today's value changes, and what it was worth before stays.
  await manager.getByRole("button", { name: "Edit Ram Truck" }).click();
  await dialog.getByLabel("Worth").fill("24000");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(manager.locator("li").filter({ hasText: "Ram Truck" }).first()).toContainText("$24,000.00");
  await manager.getByRole("button", { name: "Edit Ram Truck" }).click();
  const history = dialog.getByRole("list", { name: "Values over time" });
  await expect(history.getByText("Since Jun 1, 2025")).toBeVisible();
  await expect(history.getByRole("listitem")).toHaveCount(2);
});

test("recurring: a subscription found on the Apple Card is shown under it", async ({ page }) => {
  await page.goto("/recurring");
  await afterWelcome(page);
  await expect(page.getByRole("button", { name: /^Uber One,/ })).toContainText("Apple Card");
  await expect(page.getByRole("button", { name: /^Snapchat\+,/ })).toContainText("Added by you");
  await page.getByRole("combobox", { name: "Account" }).click();
  await page.getByRole("option", { name: "Apple Card" }).click();
  await expect(page.getByRole("button", { name: /^Uber One,/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Snapchat\+,/ })).toHaveCount(0);
});

test("settings: switching an alert off sticks and stops that alert", async ({ page }) => {
  await page.goto("/settings?tab=alerts");
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

test("settings: your name, alert thresholds, a test push and hiding an account all stick", async ({ page }) => {
  await page.goto("/settings");
  await afterWelcome(page);

  // The Overview greets you by the name saved here.
  await page.getByLabel("Display name").fill("Meron");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Name saved")).toBeVisible();

  // A new large-charge threshold changes what the alert says it does.
  await page.getByRole("link", { name: "Alerts", exact: true }).click();
  await page.getByRole("spinbutton", { name: /^Large charge/ }).fill("400");
  await page.getByRole("button", { name: "Save thresholds" }).click();
  await expect(page.getByText("Any single charge of $400 or more, even with the one above off.")).toBeVisible();

  // A test push goes out.
  await page.getByRole("button", { name: "Send a test alert" }).click();
  await expect.poll(async () => (await mockPushes(page)).some((p) => p.title.endsWith("Test notification"))).toBe(true);

  // Hiding an account keeps it hidden after a reload.
  await page.getByRole("link", { name: "Connections", exact: true }).click();
  const savings = page.getByRole("switch", { name: "Show High Yield Savings" });
  await expect(savings).toBeChecked();
  await savings.click();
  await expect(savings).not.toBeChecked();
  await expect(page.getByText("High Yield Savings is hidden")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Show High Yield Savings" })).not.toBeChecked();
  await page.goto("/settings?tab=alerts");
  await expect(page.getByRole("spinbutton", { name: /^Large charge/ })).toHaveValue("400");

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Meron");
});

test("alerts: an unusually large charge is pushed", async ({ page }) => {
  await page.goto("/");
  const res = await page.request.post("/api/alerts/check");
  expect(res.ok()).toBe(true);
  const pushes = await mockPushes(page);
  expect(pushes.find((p) => p.title.includes("Unusual charge at Kroger"))?.message).toContain("$486.20");
});

test("settings: the backup downloads every table and no secrets", async ({ page }) => {
  await page.goto("/settings?tab=data");
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
