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
  // Saved: the dialog closes and the entry shows the new balance.
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Took $40.25 from Cash. Now $579.75.")).toBeVisible();
  await expect
    .poll(async () => (await mockWrites(page)).find((w) => w.table === "manual_assets" && w.method === "PATCH")?.body)
    .toEqual({ value: 579.75 });
});
