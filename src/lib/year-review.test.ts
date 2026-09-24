import { describe, expect, it } from "vitest";
import type { SpendingTransaction } from "@/lib/spending-aggregation";
import { yearReview, yearsWithHistory } from "@/lib/year-review";

const tx = (date: string, amount: number, o: Partial<SpendingTransaction> = {}): SpendingTransaction => ({
  date,
  amount,
  pfc_primary: "FOOD_AND_DRINK",
  merchant_name: "Kroger",
  name: null,
  pending: false,
  ...o,
});
const pay = (date: string, amount: number) => tx(date, -amount, { pfc_primary: "INCOME", merchant_name: null, name: "ACME PAYROLL 1" });

const all = [
  pay("2025-01-15", 3000),
  tx("2025-01-20", 1000),
  pay("2026-01-15", 4000),
  tx("2026-01-10", 1500),
  pay("2026-02-15", 2000),
  tx("2026-02-10", 2600, { merchant_name: "Delta", pfc_primary: "TRAVEL" }),
  pay("2026-03-15", 5000),
  tx("2026-03-10", 900),
  tx("2026-03-12", 100, { merchant_name: "Red Cross", pfc_primary: "GOVERNMENT_AND_NON_PROFIT", pfc_detailed: "GOVERNMENT_AND_NON_PROFIT_DONATIONS" }),
  tx("2026-03-30", -45, { pfc_primary: "INCOME", pfc_detailed: "INCOME_INTEREST_EARNED", merchant_name: null, name: "INTEREST PAYMENT" }),
  pay("2026-04-15", 1000),
];
const spending = all.filter((t) => t.amount > 0);

describe("yearsWithHistory", () => {
  it("lists years newest first", () => {
    expect(yearsWithHistory(all)).toEqual([2026, 2025]);
  });
});

describe("yearReview", () => {
  const r = yearReview(all, spending, 2026, "2026-04-20");

  it("totals the year so far", () => {
    expect(r.inProgress).toBe(true);
    expect(r.income).toBe(12045);
    expect(r.spending).toBe(5100);
    expect(r.kept).toBe(6945);
    expect(r.months.map((m) => m.label)).toEqual(["Jan", "Feb", "Mar", "Apr"]);
  });

  it("picks the best and hardest finished months, never the one in progress", () => {
    expect(r.bestMonth?.month).toBe("2026-03");
    expect(r.hardestMonth?.month).toBe("2026-02");
    expect(r.highestSpendingMonth?.month).toBe("2026-02");
    expect(r.lowestSpendingMonth?.month).toBe("2026-03");
  });

  it("ranks categories with their share, and the largest purchases", () => {
    expect(r.categories[0]).toMatchObject({ category: "TRAVEL", amount: 2600 });
    expect(r.categories[0].share).toBeCloseTo(2600 / 5100);
    expect(r.largestPurchases[0]).toMatchObject({ merchant: "Delta", amount: 2600 });
  });

  it("leaves bills charged month after month out of the biggest purchases", () => {
    const rent = ["2026-01-01", "2026-02-01", "2026-03-01"].map((d) => tx(d, 3000, { merchant_name: "Parkview", pfc_primary: "RENT_AND_UTILITIES" }));
    const withRent = yearReview([...all, ...rent], [...spending, ...rent], 2026, "2026-04-20");
    expect(withRent.largestPurchases[0].merchant).toBe("Delta");
    expect(withRent.largestPurchases.some((p) => p.merchant === "Parkview")).toBe(false);
  });

  it("gathers the tax-time totals", () => {
    expect(r.tax).toMatchObject({ wages: 12000, interest: 45, donations: 100, otherIncome: 0 });
  });

  it("compares with the same stretch of last year", () => {
    expect(r.previous).toEqual({ income: 3000, spending: 1000 });
    expect(yearReview(all, spending, 2025, "2026-04-20").previous).toBeNull();
  });
});
