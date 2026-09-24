import { afterWelcome, expect, test } from "./test";

const FIFTH_THIRD_CHECKING = "22222222-0000-4000-8000-000000000003";

// A small made-up Comerica statement, already parsed (the PDF reading is
// covered by src/lib/statement-import.test.ts).
const statement = {
  bank: "Comerica",
  accountLast4: "3230",
  periodStart: "2024-09-14",
  periodEnd: "2024-10-11",
  beginningBalance: 100,
  endingBalance: 2587.38,
  problems: [],
  transactions: [
    { date: "2024-09-15", amount: 2500, description: "United Mortgage Payroll 240915", reference: "9488000001", section: "Electronic deposits", occurrence: 0 },
    { date: "2024-09-20", amount: -12.62, description: "Tst*chickpea Ki Sterling Heig MI 9307", reference: "MS1", section: "ATM/Debit Card transactions", occurrence: 0 },
  ],
};

test("statements import into the account's history once, and show up in it", async ({ page }) => {
  const importOnce = async () =>
    (await page.request.post("/api/import/bank-statement", { data: { account_id: FIFTH_THIRD_CHECKING, statements: [statement], dry_run: false } })).json();

  expect(await importOnce()).toMatchObject({ transactions: 2, added: 2 });
  expect(await importOnce()).toMatchObject({ added: 0, alreadyImported: 2 });

  await page.goto("/transactions");
  await afterWelcome(page);
  await page.getByPlaceholder(/search/i).fill("chickpea");
  await expect(page.getByText("Chickpea Kitchen")).toBeVisible();

  await page.goto("/accounts");
  await expect(page.locator("[data-slot=card]").filter({ hasText: "Fifth Third Bank" }).getByText("History from September 2024")).toBeVisible();
});

test("a statement that doesn't add up is refused", async ({ page }) => {
  const res = await page.request.post("/api/import/bank-statement", {
    data: { account_id: FIFTH_THIRD_CHECKING, statements: [{ ...statement, endingBalance: 1 }], dry_run: true },
  });
  expect(res.status()).toBe(400);
});
