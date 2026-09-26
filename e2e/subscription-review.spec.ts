import { afterWelcome, expect, mockWrites, test } from "./test";

// The fixtures: Hulu's first charge (pending) yesterday, nothing tracking it;
// Spotify added by hand and also found by the bank; Netflix charging on the 12th.

test("subscriptions: a first charge is asked about on the Overview and tracked from there", async ({ page }) => {
  await page.goto("/");
  await afterWelcome(page);
  const review = page.getByRole("region", { name: "Subscriptions to review" });
  const hulu = review.getByRole("listitem").filter({ hasText: "Hulu" });
  await expect(hulu).toContainText("new subscription?");
  await expect(hulu).toContainText("Pending");
  await hulu.getByRole("button", { name: "Track it" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Price")).toHaveValue("9.99");
  await dialog.getByRole("radio", { name: "Yearly" }).click();
  await dialog.getByRole("radio", { name: "Monthly" }).click();
  await dialog.getByRole("button", { name: "Track it" }).click();
  await expect(page.getByText(/Hulu is tracked\. It renews/)).toBeVisible();
  await expect(review.getByRole("listitem").filter({ hasText: "Hulu" })).toHaveCount(0);

  const added = (await mockWrites(page)).filter((w) => w.table === "manual_subscriptions" && w.method === "POST");
  expect(JSON.stringify(added.at(-1)?.body)).toContain('"name":"Hulu"');
  await page.goto("/recurring");
  await expect(page.getByRole("button", { name: /^Hulu,/ })).toBeVisible();
});

test("subscriptions: one you added that the bank also found is listed once", async ({ page }) => {
  await page.goto("/recurring");
  await afterWelcome(page);
  await expect(page.getByRole("button", { name: /^Spotify,/ })).toHaveCount(1);
  await page.getByRole("button", { name: /^Spotify,/ }).click();
  await expect(page.getByRole("dialog")).toContainText("the one you added is folded into it");
});

test("subscriptions: cancelling with a day flags a charge after it", async ({ page }) => {
  await page.goto("/recurring");
  await afterWelcome(page);
  await page.getByRole("button", { name: /^Netflix,/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "I cancelled it" }).click();
  // Forty days back: Netflix has charged since.
  const d = new Date();
  d.setDate(d.getDate() - 40);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await sheet.getByLabel("The day you cancelled it").fill(iso);
  await sheet.getByRole("button", { name: "Mark as cancelled" }).click();
  await expect(sheet).toContainText(/Cancelled on/);
  await page.keyboard.press("Escape");

  const review = page.getByRole("region", { name: "Subscriptions to review" });
  const flagged = review.getByRole("listitem").filter({ hasText: "Netflix" });
  await expect(flagged).toContainText("charged after you cancelled");
  await flagged.getByRole("button", { name: "Still subscribed" }).click();
  await expect(review.getByRole("listitem").filter({ hasText: "Netflix" })).toHaveCount(0);
});
