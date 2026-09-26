import { afterWelcome, expect, test } from "./test";

// In the mock data Apple Card was imported 3 days ago and Apple Savings 20
// days ago, so only Apple Savings is due.
test("an Apple account two weeks past its last import is flagged until it's imported again", async ({ page }) => {
  await page.goto("/");
  await afterWelcome(page);
  await expect(page.getByText("Your Apple Savings statement is 20 days old.")).toBeVisible();
  await expect(page.getByText(/Your Apple Card statement is/)).toHaveCount(0);

  await page.goto("/accounts");
  const appleCard = page.locator("[data-connection='Apple Card']");
  const savings = page.locator("[data-connection='Apple Savings']");
  await expect(appleCard.getByText(/Last imported .* \(3 days ago\)\. Next reminder/)).toBeVisible();
  await expect(savings.getByText(/Time to import: last imported .* \(20 days ago\)/)).toBeVisible();

  await savings.getByRole("button", { name: "Import now" }).click();
  await page.getByLabel("CSV file").setInputFiles({
    name: "savings.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Transaction Date,Posted Date,Activity Type,Transaction Type,Description,Currency Code,Amount\n" +
        "09/01/2026,09/01/2026,Interest,Credit,Interest Paid,USD,1.05\n"
    ),
  });
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(savings.getByText(/Last imported .* \(today\)\. Next reminder/)).toBeVisible();
  await savings.getByText(/Import history \(1\)/).click();
  await expect(savings.getByText(/1 new · Sep 1 to Sep 1/)).toBeVisible();

  await page.goto("/");
  await afterWelcome(page);
  await expect(page.getByRole("region", { name: "Net worth" })).toBeVisible();
  await expect(page.getByText(/Your Apple Savings statement is/)).toHaveCount(0);
});
