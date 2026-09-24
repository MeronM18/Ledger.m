import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyListOptions,
  DEFAULT_LIST_OPTIONS,
  isMoneyMovement,
  listTotals,
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

describe("activeFilterCount and listTotals", () => {
  it("counts filters that are on, not the sort", () => {
    expect(activeFilterCount(DEFAULT_LIST_OPTIONS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_LIST_OPTIONS, sort: "oldest" })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_LIST_OPTIONS, direction: "out", minAmount: 5, maxAmount: 10, hideTransfers: true })).toBe(3);
  });

  it("totals money out and in", () => {
    expect(listTotals([{ amount: 10 }, { amount: 5.5 }, { amount: -100 }])).toEqual({ count: 3, out: 15.5, in: 100 });
  });
});
