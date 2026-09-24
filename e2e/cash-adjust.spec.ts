import { afterWelcome, expect, mockWrites, test } from "./test";

test("cash can be added to or taken from instead of retyped", async ({ page }) => {
  await page.goto("/assets");
  await afterWelcome(page);
  await page.getByRole("button", { name: "Add to or take from Cash" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Subtract" }).click();
  await dialog.getByLabel("Amount").fill("40.25");
  await expect(dialog.getByText("$579.75")).toBeVisible();

  // More than there is can't be taken.
  await dialog.getByLabel("Amount").fill("700");
  await expect(dialog.getByText("That's more cash than you have")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Subtract" }).last()).toBeDisabled();

  await dialog.getByLabel("Amount").fill("40.25");
  await page.keyboard.press("Enter");
  await expect(page.getByText("$579.75").first()).toBeVisible();
  const writes = await mockWrites(page);
  expect(writes.find((w) => w.table === "manual_assets" && w.method === "PATCH")?.body).toEqual({ value: 579.75 });
});
