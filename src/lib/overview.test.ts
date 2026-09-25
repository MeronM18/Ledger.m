import { describe, expect, it } from "vitest";
import {
  change,
  cumulative,
  dailySpending,
  incomeByMonth,
  incomeSoFar,
  pillLevels,
  pillLevelsInRange,
  shiftMonth,
  spendingByMonth,
  spendingSoFar,
  upcomingBills,
  whereItWent,
} from "@/lib/overview";
import type { SpendingTransaction } from "@/lib/spending-aggregation";

const tx = (date: string, amount: number, pfc_primary = "FOOD_AND_DRINK", pending = false): SpendingTransaction => ({
  date,
  amount,
  pfc_primary,
  merchant_name: "Somewhere",
  name: null,
  pending,
});

const SEP = { year: 2026, month: 8 };

describe("this month day by day", () => {
  const spending = [tx("2026-09-01", 1850), tx("2026-09-03", 40), tx("2026-09-03", -10), tx("2026-08-02", 900), tx("2026-08-20", 300), tx("2026-08-31", 50)];

  it("totals each day net of refunds, and runs them up", () => {
    const days = dailySpending(spending, SEP);
    expect(days).toHaveLength(30);
    expect(days.slice(0, 4)).toEqual([1850, 0, 30, 0]);
    expect(cumulative(days).slice(0, 4)).toEqual([1850, 1850, 1880, 1880]);
  });

  it("compares this month so far with last month through the same day", () => {
    expect(spendingSoFar(spending, SEP, 24)).toEqual({ now: 1880, before: 1200, change: (1880 - 1200) / 1200, beforeTotal: 1250 });
    // With nothing last month by then, there's nothing to compare.
    expect(spendingSoFar(spending, SEP, 1).change).toBeNull();
  });

  it("goes back over a year end", () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(spendingByMonth(spending, SEP, 2)).toEqual([
      { month: "2026-08", amount: 1250 },
      { month: "2026-09", amount: 1880 },
    ]);
  });
});

describe("income", () => {
  const all = [
    tx("2026-09-15", -3853.47, "INCOME"),
    tx("2026-09-20", -100, "INCOME", true), // pending: not yet
    tx("2026-08-10", -4000, "INCOME"),
    tx("2026-08-28", -3782, "INCOME"),
    tx("2026-09-05", -500, "TRANSFER_IN"), // money moved, not income
  ];

  it("counts posted income so far against last month through the same day", () => {
    expect(incomeSoFar(all, SEP, 25)).toEqual({ now: 3853.47, before: 4000, change: (3853.47 - 4000) / 4000, beforeTotal: 7782 });
  });

  it("lists income month by month, oldest first", () => {
    expect(incomeByMonth(all, SEP, 3)).toEqual([
      { month: "2026-07", amount: 0 },
      { month: "2026-08", amount: 7782 },
      { month: "2026-09", amount: 3853.47 },
    ]);
  });
});

describe("the rest of the overview", () => {
  it("lists bills and card payments due in the next two weeks, soonest first, and never income", () => {
    const events = [
      { date: "2026-10-09", name: "Spectrum", amount: 79.99, kind: "bill" as const },
      { date: "2026-09-25", name: "Freedom Flex payment", amount: 842.13, kind: "card" as const },
      { date: "2026-10-10", name: "Too far", amount: 5, kind: "bill" as const },
      { date: "2026-09-30", name: "Paycheck", amount: 3000, kind: "income" as const },
      { date: "2026-09-24", name: "Yesterday", amount: 5, kind: "bill" as const },
    ];
    const due = upcomingBills(events, "2026-09-25", 14);
    expect(due.items.map((e) => e.name)).toEqual(["Freedom Flex payment", "Spectrum"]);
    expect(due.total).toBe(922.12);
  });

  it("gives the biggest categories their share, and sums the rest", () => {
    const categories = [
      { category: "RENT_AND_UTILITIES", label: "Rent & Utilities", amount: 2000, colorSlot: 9 },
      { category: "FOOD_AND_DRINK", label: "Food & Drink", amount: 1000, colorSlot: 1 },
      { category: "TRAVEL", label: "Travel", amount: -200, colorSlot: 10 }, // a refund month: left out
      { category: "MEDICAL", label: "Medical", amount: 600, colorSlot: 11 },
      { category: "OTHER", label: "Other", amount: 400, colorSlot: 8 },
    ];
    const { top, rest } = whereItWent(categories, 2);
    expect(top.map((c) => [c.category, c.share])).toEqual([
      ["RENT_AND_UTILITIES", 0.5],
      ["FOOD_AND_DRINK", 0.25],
    ]);
    expect(rest).toEqual({ count: 2, amount: 1000 });
  });

  it("sizes pills against the largest, on a square-root scale, leaving the future unlit", () => {
    expect(pillLevels([100, 25, 0, null])).toEqual([1, 0.5, 0, null]);
    expect(pillLevels([1000, 1])[1]).toBe(0.12); // a sliver, never invisible
    expect(pillLevelsInRange([10, 20, 30])).toEqual([0.25, 0.625, 1]);
    expect(pillLevelsInRange([5, 5])).toEqual([0.6, 0.6]);
  });

  it("measures change only against something", () => {
    expect(change(120, 100)).toBeCloseTo(0.2);
    expect(change(5, 0)).toBeNull();
  });
});
