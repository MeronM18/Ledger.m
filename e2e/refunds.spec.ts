import { IDS } from "./fixtures.mjs";
import { afterWelcome, expect, mockWrites, test } from "./test";

type Write = { method: string; table: string; body: unknown };
const body = (w: Write) => (w.body ?? {}) as Record<string, unknown>;

// The fixtures' Nike order is 40 days before today (Eastern), its refund yesterday.
function monthOf(daysAgo: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const d = new Date(Date.parse(`${today}T00:00:00Z`) - daysAgo * 86_400_000);
  return d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

test("a refund is an alert that says what it's for, and counts in its purchase's month", async ({ page }) => {
  await page.goto("/");
  const res = await page.request.post("/api/alerts/check");
  expect(res.ok()).toBe(true);
  const alerts = (await mockWrites(page)).filter((w) => w.table === "alert_events").map((w) => body(w));
  const refund = alerts.find((a) => a.kind === "refund");
  expect(refund).toMatchObject({ dedupe_key: `refund:${IDS.nikeRefund}`, title: "$129.99 back from Nike" });
  expect(refund!.body).toContain(`It counts in ${monthOf(40)}, with the purchase.`);

  // In the bell, it opens the refund itself.
  await page.reload();
  await afterWelcome(page);
  await page.locator("main").getByRole("button", { name: /^Alerts/ }).click();
  const bell = page.getByRole("dialog");
  await expect(bell.getByText("$129.99 back from Nike")).toBeVisible();
  await bell.getByRole("link", { name: "See it" }).click();
  await expect(page).toHaveURL(new RegExp(`/transactions\\?open=${IDS.nikeRefund}`));

  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "Nike" })).toBeVisible();
  await expect(panel.getByText("Came back", { exact: true })).toBeVisible();
  await expect(panel.getByText("the day of its purchase")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Nike · $129.99" })).toBeVisible();
  await expect(panel.getByText(`comes off General Merchandise spending in ${monthOf(40)}, the month of its purchase`)).toBeVisible();
  await expect(panel.getByText(/Found on its own/)).toBeVisible();

  // The purchase says it came back, and leads back to the refund.
  await panel.getByRole("button", { name: "Nike · $129.99" }).click();
  await expect(panel.getByText("Refunded", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText("refunded in full, so the two cancel out in Spending and Budgets")).toBeVisible();

  // Closed, the same alert opens it again from right here.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/transactions$/);
  await page.locator("main").getByRole("button", { name: /^Alerts/ }).click();
  await page.getByRole("dialog").getByRole("link", { name: "See it" }).click();
  await expect(page.getByRole("dialog").getByText("Came back", { exact: true })).toBeVisible();
});

test("a refund can be set to count on the day it came back, and matched on its own again", async ({ page }) => {
  await page.goto(`/transactions?open=${IDS.nikeRefund}`);
  await afterWelcome(page);
  const panel = page.getByRole("dialog");
  await panel.getByRole("combobox", { name: "Which purchase it's for" }).click();
  await page.getByRole("option", { name: "None: count it when it came back" }).click();
  await expect(page.getByText(`Counted in ${monthOf(1)}, when it came back`)).toBeVisible();
  await expect
    .poll(async () => (await mockWrites(page)).filter((w) => w.table === "ui_preferences").map((w) => body(w)).find((b) => b.key === "refund_matches")?.value)
    .toEqual({ [IDS.nikeRefund]: "none" });
  await expect(panel.getByText("You said it's for no purchase, so it counts when it came back.")).toBeVisible();
  await expect(panel.getByText("Came back", { exact: true })).toHaveCount(0);

  await panel.getByRole("button", { name: "Let it be matched on its own" }).click();
  await expect(page.getByText("It's matched automatically again")).toBeVisible();
  await expect(panel.getByText("Came back", { exact: true })).toBeVisible();
});
