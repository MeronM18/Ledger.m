import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyListOptions,
  DEFAULT_LIST_OPTIONS,
  isMoneyMovement,
  groupByDay,
  listSummary,
  type ListOptions,
  type ListTransaction,
} from "@/lib/transaction-list";

const tx = (id: string, date: string, amount: number, o: Partial<ListTransaction> = {}): ListTransaction => ({
  id,
  date,
  amount,
  name: null,
  merchant_name: id,
  pfc_primary: "FOOD_AND_DRINK",
  pending: false,
  ...o,
});

const rows = [
  tx("Kroger", "2026-09-20", 122.85),
  tx("Paycheck", "2026-09-15", -3853.47, { pfc_primary: "INCOME" }),
  tx("Rent", "2026-09-01", 1850, { pfc_primary: "RENT_AND_UTILITIES", notes: "September" }),
  tx("Starbucks", "2026-09-24", 6.45, { pending: true }),
  tx("Chase Credit Card", "2026-09-21", 785.41, { pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }),
  tx("card side", "2026-09-20", -785.41, { merchant_name: null, name: "Payment Thank You-Mobile", pfc_primary: "LOAN_DISBURSEMENTS" }),
  tx("PayPal", "2026-09-21", -115.33, { pfc_primary: "TRANSFER_IN" }),
];
const ids = (o: Partial<ListOptions>) => applyListOptions(rows, { ...DEFAULT_LIST_OPTIONS, ...o }).map((t) => t.id);

describe("applyListOptions", () => {
  it("sorts newest first by default, and oldest first on request", () => {
    expect(ids({})[0]).toBe("Starbucks");
    expect(ids({ sort: "oldest" })[0]).toBe("Rent");
  });

  it("sorts by amount by size, whichever way the money went", () => {
    expect(ids({ sort: "amount-desc" }).slice(0, 2)).toEqual(["Paycheck", "Rent"]);
    expect(ids({ sort: "amount-asc" })[0]).toBe("Starbucks");
  });

  it("sorts by merchant A to Z, ignoring case", () => {
    expect(ids({ sort: "merchant" }).slice(0, 2)).toEqual(["Chase Credit Card", "Kroger"]);
  });

  it("shows money out or money in", () => {
    expect(ids({ direction: "in" }).sort()).toEqual(["PayPal", "Paycheck", "card side"]);
    expect(ids({ direction: "out" })).not.toContain("Paycheck");
  });

  it("keeps amounts within a range, by size", () => {
    expect(ids({ minAmount: 100, maxAmount: 1000 }).sort()).toEqual(["Chase Credit Card", "Kroger", "PayPal", "card side"]);
  });

  it("filters by pending or posted", () => {
    expect(ids({ status: "pending" })).toEqual(["Starbucks"]);
    expect(ids({ status: "posted" })).not.toContain("Starbucks");
  });

  it("hides transfers and card payments from both sides", () => {
    expect(ids({ hideTransfers: true }).sort()).toEqual(["Kroger", "Paycheck", "Rent", "Starbucks"]);
  });

  it("keeps only rows with notes", () => {
    expect(ids({ onlyWithNotes: true })).toEqual(["Rent"]);
  });
});

describe("isMoneyMovement", () => {
  it("leaves out a loan payment that isn't a card payment", () => {
    expect(isMoneyMovement(tx("Student loan", "2026-09-01", 200, { pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT" }))).toBe(false);
  });
});

describe("activeFilterCount, listSummary and groupByDay", () => {
  it("counts filters that are on, not the sort", () => {
    expect(activeFilterCount(DEFAULT_LIST_OPTIONS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_LIST_OPTIONS, sort: "oldest" })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_LIST_OPTIONS, direction: "out", minAmount: 5, maxAmount: 10, hideTransfers: true })).toBe(3);
  });

  it("sums up the list: money out and in, the largest each way, the typical charge and what's pending", () => {
    const s = listSummary(rows);
    expect(s.count).toBe(rows.length);
    expect(s.largestExpense).toEqual({ amount: 1850, id: "Rent" });
    expect(s.largestDeposit).toEqual({ amount: 3853.47, id: "Paycheck" });
    expect(s.pending).toEqual({ count: 1, amount: 6.45 });
    expect(s.first).toBe("2026-09-01");
    expect(s.last).toBe("2026-09-24");
    const out = rows.filter((t) => t.amount > 0);
    expect(s.moneyOut).toBe(Math.round(out.reduce((a, t) => a + t.amount, 0) * 100) / 100);
    expect(s.averageExpense).toBe(Math.round((s.moneyOut / out.length) * 100) / 100);
    expect(listSummary([])).toMatchObject({ count: 0, largestExpense: null, averageExpense: null, first: null });
  });

  it("groups a sorted list by day with each day's net", () => {
    const days = groupByDay([
      { date: "2026-09-24", amount: 10 },
      { date: "2026-09-24", amount: -50 },
      { date: "2026-09-23", amount: 5.5 },
    ]);
    expect(days.map((d) => [d.date, d.rows.length, d.net])).toEqual([
      ["2026-09-24", 2, 40],
      ["2026-09-23", 1, -5.5],
    ]);
  });
});
