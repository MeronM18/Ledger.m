import fs from "node:fs";
import { afterWelcome, expect, mockWrites, test } from "./test";

test("a downloaded backup restores, after a preview of what comes back", async ({ page }, testInfo) => {
  await page.goto("/settings");
  await afterWelcome(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Download backup/ }).click()]);
  const file = testInfo.outputPath("backup.json");
  await download.saveAs(file);

  await page.getByLabel("Backup file").setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Restore this backup?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Budgets")).toBeVisible();
  await expect(dialog.getByText("Manual and imported transactions")).toBeVisible();
  // Nothing written by the preview.
  expect((await mockWrites(page)).filter((w) => w.method !== "GET" && w.table === "budgets")).toHaveLength(0);

  await dialog.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText(/Restored [\d,]+ items? from the backup/)).toBeVisible();
  const writes = await mockWrites(page);
  expect(writes.some((w) => w.table === "budgets" && w.method === "POST")).toBe(true);
  expect(writes.some((w) => w.table === "manual_transactions" && w.method === "POST")).toBe(true);
  // Bank data isn't restored.
  expect(writes.some((w) => w.table === "transactions" || w.table === "items")).toBe(false);
  fs.rmSync(file, { force: true });
});

test("a file that isn't a backup is turned away without changing anything", async ({ page }, testInfo) => {
  await page.goto("/settings");
  await afterWelcome(page);
  const file = testInfo.outputPath("not-a-backup.json");
  fs.writeFileSync(file, JSON.stringify({ hello: "world" }));
  await page.getByLabel("Backup file").setInputFiles(file);
  await expect(page.getByText("That file isn't a Ledger.m backup.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
