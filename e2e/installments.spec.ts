import { afterWelcome, expect, mockWrites, test } from "./test";

// The fixtures carry a MacBook on Apple Card Monthly Installments: $133.25 on
// the last day of each month, the first four months ago (five paid on a
// month's last day).

test("installments: an Apple Card installment is found, named, and tracked to payoff", async ({ page }) => {
  await page.goto("/recurring");
  await afterWelcome(page);
  const card = page.getByRole("region", { name: "Installments" });
  await expect(card).toContainText("Apple Card installment");
  await expect(card).toContainText(/[45] of 12 paid/);
  await expect(card).toContainText(/\$1,066|\$932/);

  await card.getByRole("button", { name: "Name it and pick what it is" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "MacBook" }).click();
  await dialog.getByLabel("Name").fill("MacBook Pro");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(card.getByRole("heading", { name: "MacBook Pro" })).toBeVisible();

  const saved = (await mockWrites(page)).filter((w) => w.table === "ui_preferences" && (w.body as { key?: string }).key === "installment_plans");
  expect(JSON.stringify(saved.at(-1)?.body)).toContain('"name":"MacBook Pro","icon":"laptop"');

  await card.getByRole("button", { name: "See every payment" }).click();
  await expect(card.getByRole("list").last().getByRole("listitem")).toHaveCount(12);
  await expect(card.getByRole("listitem").filter({ hasText: /^\d+.*Next/ })).toHaveCount(1);
});

test("installments: the installment isn't suggested as a subscription", async ({ page }) => {
  await page.goto("/recurring");
  await afterWelcome(page);
  await expect(page.getByRole("region", { name: "Installments" })).toContainText(/[45] of 12 paid/);
  await expect(page.getByText("Apple Online Store")).toHaveCount(0);
});

test("installments: a plan of your own can be added", async ({ page }) => {
  await page.goto("/recurring");
  await afterWelcome(page);
  const card = page.getByRole("region", { name: "Installments" });
  await card.getByRole("button", { name: "Add a plan" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Other" }).click();
  await dialog.getByLabel("Name").fill("Couch");
  await dialog.getByLabel("Monthly payment").fill("45.50");
  await dialog.getByLabel("First payment").fill("2026-01-05");
  await dialog.getByLabel("Payments").fill("6");
  await dialog.getByRole("button", { name: "Add plan" }).click();
  await expect(card.getByRole("heading", { name: "Couch" })).toHaveCount(0);
  // Paid off already: it's under "Paid off".
  await card.getByRole("button", { name: "Paid off (1)" }).click();
  await expect(card.getByRole("heading", { name: "Couch" })).toBeVisible();
});

test("installments: the add form's hints follow what it is, and point at the field to fix", async ({ page }) => {
  await page.goto("/recurring");
  await afterWelcome(page);
  await page.getByRole("region", { name: "Installments" }).getByRole("button", { name: "Add a plan" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "iPad" }).click();
  await expect(dialog.getByLabel("Name")).toHaveAttribute("placeholder", "e.g. iPad Air");
  await dialog.getByRole("button", { name: "Add plan" }).click();
  await expect(page.getByText("Give it a name, like iPad Air")).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByLabel("Name")).toBeFocused();

  // An iPhone is usually 24 payments; typing a name clears the mark.
  await dialog.getByRole("radio", { name: "iPhone" }).click();
  await expect(dialog.getByLabel("Payments")).toHaveValue("24");
  await dialog.getByLabel("Name").fill("iPhone 17 Pro");
  await expect(dialog.getByLabel("Name")).not.toHaveAttribute("aria-invalid", "true");
  await dialog.getByRole("button", { name: "Add plan" }).click();
  await expect(page.getByText("Enter the monthly payment")).toBeVisible();
  await expect(dialog.getByLabel("Monthly payment")).toBeFocused();
});
