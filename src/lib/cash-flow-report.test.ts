import { describe, expect, it } from "vitest";
import { cashFlowReport, cashFlowSeries, detailedLabel, squarify } from "@/lib/cash-flow-report";
import type { SpendingTransaction } from "@/lib/spending-aggregation";

const tx = (o: Partial<SpendingTransaction>): SpendingTransaction => ({
  date: "2026-09-10",
  amount: 10,
  pfc_primary: "FOOD_AND_DRINK",
  pfc_detailed: "FOOD_AND_DRINK_RESTAURANT",
  merchant_name: "Chipotle",
  name: null,
  pending: false,
  ...o,
});
const range = { start: "2026-09-01", end: "2026-09-30" };

/** Every node's inflows equal its outflows, except the ends. */
function balanced(r: ReturnType<typeof cashFlowReport>) {
  for (const n of r.nodes) {
    const inflow = r.flows.filter((f) => f.target === n.id).reduce((s, f) => s + f.amount, 0);
    const outflow = r.flows.filter((f) => f.source === n.id).reduce((s, f) => s + f.amount, 0);
    if (inflow > 0 && outflow > 0) expect(Math.abs(inflow - outflow)).toBeLessThan(0.05);
  }
}

describe("cashFlowReport", () => {
  const rows = [
    tx({ amount: -3000, pfc_primary: "INCOME", pfc_detailed: "INCOME_WAGES", merchant_name: "United Mortgage Paycheck" }),
    tx({ amount: -50, pfc_primary: "INCOME", pfc_detailed: "INCOME_OTHER", merchant_name: "Depop" }),
    tx({ amount: 60 }),
    tx({ amount: 40, pfc_detailed: "FOOD_AND_DRINK_GROCERIES", merchant_name: "Kroger" }),
    tx({ amount: 1850, pfc_primary: "RENT_AND_UTILITIES", pfc_detailed: "RENT_AND_UTILITIES_RENT", merchant_name: "Rent" }),
    // A fee and its waiver net out; a transfer isn't spending; last month isn't counted.
    tx({ amount: 13, pfc_primary: "BANK_FEES", pfc_detailed: "BANK_FEES_OTHER_BANK_FEES", merchant_name: "Fee" }),
    tx({ amount: -13, pfc_primary: "BANK_FEES", pfc_detailed: "BANK_FEES_OTHER_BANK_FEES", merchant_name: "Fee waiver" }),
    tx({ amount: 500, pfc_primary: "TRANSFER_OUT", merchant_name: "Savings" }),
    tx({ date: "2026-08-30", amount: 999 }),
  ];

  it("totals income, expenses, what was kept and the savings rate", () => {
    const r = cashFlowReport(rows, [], range);
    expect(r).toMatchObject({ income: 3050, expenses: 1950, net: 1100 });
    expect(r.savingsRate).toBeCloseTo(1100 / 3050);
  });

  it("flows from each source into Income, and out to Savings, each category and its finer ones", () => {
    const r = cashFlowReport(rows, [], range);
    const labels = (column: number) => r.nodes.filter((n) => n.column === column).map((n) => n.label);
    expect(labels(0)).toEqual(["United Mortgage Paycheck", "Depop"]);
    expect(labels(1)).toEqual(["Income"]);
    expect(labels(2)).toEqual(["Savings", "Rent & Utilities", "Food & Drink"]);
    expect(labels(3)).toEqual(expect.arrayContaining(["Restaurant", "Groceries", "Rent"]));
    expect(r.flows.find((f) => f.target === "savings")?.amount).toBe(1100);
    balanced(r);
  });

  it("draws on savings when more went out than came in, and still balances", () => {
    const r = cashFlowReport([...rows, tx({ amount: 2000, pfc_primary: "TRAVEL", pfc_detailed: "TRAVEL_FLIGHTS" })], [], range);
    expect(r.net).toBe(-900);
    expect(r.nodes.find((n) => n.id === "source:savings-used")?.amount).toBe(900);
    expect(r.nodes.find((n) => n.id === "savings")).toBeUndefined();
    balanced(r);
  });

  it("names a finer category without its parent", () => {
    expect(detailedLabel("FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT")).toBe("Restaurant");
    expect(detailedLabel("FOOD_AND_DRINK", "TRAVEL_FLIGHTS")).toBeNull();
    expect(detailedLabel("FOOD_AND_DRINK", null)).toBeNull();
  });
});

describe("squarify", () => {
  it("fills the box exactly, each tile's area in proportion to its value", () => {
    const values = [6, 6, 4, 3, 2, 2, 1];
    const box = { x: 0, y: 0, w: 600, h: 400 };
    const rects = squarify(values, box);
    const total = values.reduce((s, v) => s + v, 0);
    rects.forEach((r, i) => expect(r.w * r.h).toBeCloseTo((values[i] / total) * 600 * 400, 3));
    // Nothing spills outside the box.
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-6);
      expect(r.y).toBeGreaterThanOrEqual(-1e-6);
      expect(r.x + r.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(400 + 1e-6);
    }
    // Tiles stay reasonably square.
    const worst = Math.max(...rects.map((r) => Math.max(r.w / r.h, r.h / r.w)));
    expect(worst).toBeLessThan(4);
  });
});

describe("cashFlowSeries", () => {
  const rows = [
    tx({ date: "2026-08-15", amount: -3000, pfc_primary: "INCOME", pfc_detailed: "INCOME_WAGES" }),
    tx({ date: "2026-08-20", amount: 100 }),
    tx({ date: "2026-08-21", amount: 1850, pfc_primary: "RENT_AND_UTILITIES", pfc_detailed: "RENT_AND_UTILITIES_RENT" }),
    tx({ date: "2026-09-02", amount: 40 }),
    tx({ date: "2026-09-03", amount: 500, pfc_primary: "TRANSFER_OUT" }),
    tx({ date: "2026-09-15", amount: -3000, pfc_primary: "INCOME", pfc_detailed: "INCOME_WAGES" }),
  ];

  it("goes day by day through this month, only up to today, and keeps a running total", () => {
    const r = cashFlowSeries(rows, [], { start: "2026-09-01", end: "2026-09-30" }, "2026-09-24", "2026-08-01");
    expect(r.granularity).toBe("day");
    expect(r.buckets).toHaveLength(24);
    expect(r.buckets[0]).toMatchObject({ key: "2026-09-01", label: "Sep 1", income: 0, expenses: 0 });
    expect(r.buckets[1]).toMatchObject({ key: "2026-09-02", expenses: 40, keptSoFar: -40 });
    expect(r.buckets[14]).toMatchObject({ key: "2026-09-15", income: 3000, keptSoFar: 2960 });
    // Nothing from August, and a transfer isn't spending.
    expect(r.buckets.reduce((s, b) => s + b.expenses, 0)).toBe(40);
  });

  it("goes month by month through a longer period", () => {
    const r = cashFlowSeries(rows, [], { start: "2026-01-01", end: "2026-12-31" }, "2026-09-24", "2026-08-01");
    expect(r.granularity).toBe("month");
    expect(r.buckets.map((b) => b.key)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(r.buckets[7]).toMatchObject({ income: 3000, expenses: 1950, byCategory: { RENT_AND_UTILITIES: 1850, FOOD_AND_DRINK: 100 }, keptSoFar: 1050 });
    expect(r.series.map((s) => s.label)).toEqual(["Rent & Utilities", "Food & Drink"]);
  });
});
