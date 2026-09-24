import { describe, expect, it } from "vitest";
import {
  applyPaidBack,
  categoryTotalsForMonth,
  filterSpendingTransactions,
  monthlyIncomeVsSpending,
  paidBackShare,
  type SpendingTransaction,
} from "@/lib/spending-aggregation";
import { applyTransactionEdits } from "@/lib/transaction-edits";

const tx = (o: Partial<SpendingTransaction>): SpendingTransaction => ({
  date: "2026-09-10",
  amount: 100,
  pfc_primary: "FOOD_AND_DRINK",
  merchant_name: "Dinner",
  name: null,
  pending: false,
  ...o,
});

describe("paid back in cash", () => {
  it("counts only your share of a charge, and caps what was paid back at the charge", () => {
    expect(paidBackShare(tx({ paid_back: 60 }))).toBe(60);
    expect(paidBackShare(tx({ paid_back: 150 }))).toBe(100);
    expect(paidBackShare(tx({ amount: -100, paid_back: 60 }))).toBe(0);
    expect(applyPaidBack([tx({ paid_back: 60 })])[0].amount).toBe(40);
  });

  it("drops a charge paid back in full from spending", () => {
    expect(applyPaidBack([tx({ paid_back: 100 }), tx({ amount: 20 })]).map((t) => t.amount)).toEqual([20]);
  });

  it("flows into category totals and in-vs-out, but not into income", () => {
    const all = [
      tx({ paid_back: 60 }),
      tx({ amount: 50 }),
      tx({ amount: -1000, pfc_primary: "INCOME", merchant_name: null, name: "ACME PAYROLL" }),
    ];
    const spending = filterSpendingTransactions(all);
    expect(categoryTotalsForMonth(spending, 2026, 8)[0].amount).toBe(90);
    expect(monthlyIncomeVsSpending(all, 2026, 8)).toEqual({ income: 1000, spending: 90, net: 910 });
  });

  it("isn't an edit on its own, so the transaction doesn't show as edited", () => {
    const override = { transaction_id: "t", category: null, merchant_name: null, notes: null, reimbursed_amount: 60 };
    const edited = applyTransactionEdits({ id: "t", name: null, merchant_name: "Dinner" }, override, []);
    expect(edited).toMatchObject({ paid_back: 60, edited: false });
  });
});
