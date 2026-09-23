import { describe, expect, it } from "vitest";
import {
  categoryTotalsForMonth,
  filterSpendingTransactions,
  incomeBySourceForMonth,
  monthlyIncomeVsSpending,
  refundTransactions,
  type SpendingTransaction,
} from "@/lib/spending-aggregation";

const tx = (o: Partial<SpendingTransaction>): SpendingTransaction => ({
  date: "2026-09-10",
  amount: 10,
  pfc_primary: "FOOD_AND_DRINK",
  merchant_name: "Cafe",
  name: "CAFE",
  pending: false,
  ...o,
});

describe("filterSpendingTransactions", () => {
  it("drops pending, income and transfers", () => {
    const out = filterSpendingTransactions([
      tx({}),
      tx({ pending: true }),
      tx({ pfc_primary: "INCOME", amount: -500 }),
      tx({ pfc_primary: "TRANSFER_OUT" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("keeps a payment to an unconnected card, drops one to a connected card", () => {
    const pay = (merchant: string) =>
      tx({
        pfc_primary: "LOAN_PAYMENTS",
        pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
        merchant_name: merchant,
        amount: 200,
      });
    expect(filterSpendingTransactions([pay("Apple Card")], ["Chase"])).toHaveLength(1);
    expect(filterSpendingTransactions([pay("Chase Card Payment")], ["Chase"])).toHaveLength(0);
  });
});

describe("categoryTotalsForMonth", () => {
  it("only counts the requested month and nets refunds", () => {
    const totals = categoryTotalsForMonth(
      [
        tx({ amount: 30 }),
        tx({ amount: -10 }),
        tx({ date: "2026-08-31", amount: 999 }),
        tx({ pfc_primary: "TRAVEL", amount: 5 }),
      ],
      2026,
      8
    );
    expect(totals.find((t) => t.category === "FOOD_AND_DRINK")?.amount).toBe(20);
    expect(totals.find((t) => t.category === "TRAVEL")?.amount).toBe(5);
  });

  it("gives Rent & Utilities a color different from Other", () => {
    const totals = categoryTotalsForMonth(
      [tx({ pfc_primary: "RENT_AND_UTILITIES", amount: 100 }), tx({ pfc_primary: null, amount: 5 })],
      2026,
      8
    );
    const rent = totals.find((t) => t.category === "RENT_AND_UTILITIES")!;
    const other = totals.find((t) => t.category === "OTHER")!;
    expect(rent.colorSlot).not.toBe(other.colorSlot);
  });

  it("drops a fully refunded category", () => {
    expect(categoryTotalsForMonth([tx({ amount: 10 }), tx({ amount: -10 })], 2026, 8)).toEqual([]);
  });
});

describe("income", () => {
  it("splits paychecks from other income and computes net", () => {
    const rows = [
      tx({ pfc_primary: "INCOME", amount: -1000, name: "ACME CORP PAYROLL", merchant_name: null }),
      tx({ pfc_primary: "INCOME", amount: -50, name: "REFUND", merchant_name: null }),
      tx({ amount: 200 }),
    ];
    const inc = incomeBySourceForMonth(rows, 2026, 8);
    expect(inc.reduce((s, x) => s + x.amount, 0)).toBe(1050);
    expect(monthlyIncomeVsSpending(rows, 2026, 8)).toEqual({ income: 1050, spending: 200, net: 850 });
  });
});

describe("refundTransactions", () => {
  it("lists negative amounts as positive refunds, newest first", () => {
    const r = refundTransactions([
      tx({ amount: -5, date: "2026-09-01" }),
      tx({ amount: -7, date: "2026-09-09" }),
      tx({ amount: 3 }),
    ]);
    expect(r.map((x) => x.amount)).toEqual([7, 5]);
  });
});
