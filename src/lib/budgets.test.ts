import { describe, expect, it } from "vitest";
import {
  budgetIncome,
  budgetMonth,
  budgetTips,
  incomeForMonth,
  shiftBudgetMonth,
  typicalIncome,
  BUDGETABLE_CATEGORIES,
  budgetProgress,
  budgetStatus,
  budgetTotals,
  daysInMonth,
  suggestBudget,
  unbudgetedSpending,
  type Budget,
} from "@/lib/budgets";
import { categoryTotalsForMonth, type SpendingTransaction } from "@/lib/spending-aggregation";

const tx = (o: Partial<SpendingTransaction>): SpendingTransaction => ({
  date: "2026-09-10",
  amount: 10,
  pfc_primary: "FOOD_AND_DRINK",
  merchant_name: "Cafe",
  name: "CAFE",
  pending: false,
  ...o,
});

const budget = (category: string, monthly_amount: number): Budget => ({ id: category, category, monthly_amount });
const day = (d: number) => ({ year: 2026, month: 8, isoDate: `2026-09-${String(d).padStart(2, "0")}` });

describe("budgetStatus", () => {
  it("is ok under 80%, warning from 80% through the limit, over past it", () => {
    expect(budgetStatus(79, 100)).toBe("ok");
    expect(budgetStatus(80, 100)).toBe("warning");
    expect(budgetStatus(100, 100)).toBe("warning");
    expect(budgetStatus(100.01, 100)).toBe("over");
  });
});

describe("budgetProgress", () => {
  const totals = categoryTotalsForMonth(
    [tx({ amount: 90 }), tx({ pfc_primary: "TRAVEL", amount: 20 })],
    2026,
    8
  );

  it("computes spent, remaining and status, most used first", () => {
    const p = budgetProgress(totals, [budget("TRAVEL", 200), budget("FOOD_AND_DRINK", 100)], day(20));
    expect(p.map((x) => x.category)).toEqual(["FOOD_AND_DRINK", "TRAVEL"]);
    expect(p[0]).toMatchObject({ spent: 90, remaining: 10, status: "warning" });
    expect(p[1]).toMatchObject({ spent: 20, remaining: 180, status: "ok" });
  });

  it("still lists a budgeted category that has no spending yet", () => {
    const p = budgetProgress(totals, [budget("MEDICAL", 50)], day(20));
    expect(p[0]).toMatchObject({ category: "MEDICAL", spent: 0, remaining: 50, status: "ok", percentUsed: 0 });
  });

  it("reports over-budget as negative remaining", () => {
    const p = budgetProgress(totals, [budget("FOOD_AND_DRINK", 60)], day(20));
    expect(p[0]).toMatchObject({ status: "over", remaining: -30 });
    expect(p[0].projectedOver).toBe(false); // already over, no separate projection warning
  });

  it("projects month-end spend from the pace, but not in the first days", () => {
    // 30-day month, day 15, $90 spent -> $180 projected against a $150 budget.
    const p = budgetProgress(totals, [budget("FOOD_AND_DRINK", 150)], day(15));
    expect(p[0].projected).toBeCloseTo(180);
    expect(p[0].projectedOver).toBe(true);
    expect(budgetProgress(totals, [budget("FOOD_AND_DRINK", 150)], day(3))[0].projected).toBeNull();
  });

  it("uses the OTHER bucket for uncategorized spending", () => {
    const other = categoryTotalsForMonth([tx({ pfc_primary: null, amount: 40 })], 2026, 8);
    expect(budgetProgress(other, [budget("OTHER", 100)], day(20))[0]).toMatchObject({
      label: "Other",
      spent: 40,
    });
  });
});

describe("unbudgetedSpending / budgetTotals", () => {
  it("lists only categories without a budget, largest first", () => {
    const totals = categoryTotalsForMonth(
      [tx({ amount: 90 }), tx({ pfc_primary: "TRAVEL", amount: 20 }), tx({ pfc_primary: "MEDICAL", amount: 55 })],
      2026,
      8
    );
    expect(unbudgetedSpending(totals, [budget("FOOD_AND_DRINK", 100)]).map((c) => c.category)).toEqual([
      "MEDICAL",
      "TRAVEL",
    ]);
  });

  it("sums budgeted categories", () => {
    const totals = categoryTotalsForMonth([tx({ amount: 90 })], 2026, 8);
    const progress = budgetProgress(totals, [budget("FOOD_AND_DRINK", 100), budget("TRAVEL", 50)], day(20));
    expect(budgetTotals(progress)).toEqual({ budget: 150, spent: 90, remaining: 60 });
  });
});

describe("suggestBudget", () => {
  const history = [
    tx({ date: "2026-06-05", amount: 100 }),
    tx({ date: "2026-07-05", amount: 200 }),
    tx({ date: "2026-08-05", amount: 300 }),
  ];

  it("averages the previous full months and rounds up to $5", () => {
    expect(suggestBudget(history, "FOOD_AND_DRINK", { year: 2026, month: 8 })).toBe(200);
    expect(suggestBudget([...history, tx({ date: "2026-08-06", amount: 1 })], "FOOD_AND_DRINK", { year: 2026, month: 8 })).toBe(
      205 // (100 + 200 + 301) / 3 = 200.33 -> 205
    );
  });

  it("does not count months before the first transaction", () => {
    const short = [tx({ date: "2026-08-05", amount: 90 })];
    expect(suggestBudget(short, "FOOD_AND_DRINK", { year: 2026, month: 8 })).toBe(90); // only August counts
  });

  it("returns null with no history, and does not include the current month", () => {
    expect(suggestBudget([], "FOOD_AND_DRINK", { year: 2026, month: 8 })).toBeNull();
    expect(suggestBudget([tx({ date: "2026-09-05", amount: 500 })], "FOOD_AND_DRINK", { year: 2026, month: 8 })).toBeNull();
  });

  it("counts a category with no spending in a counted month as zero", () => {
    expect(suggestBudget(history, "TRAVEL", { year: 2026, month: 8 })).toBe(5); // floor of $5
  });
});

describe("misc", () => {
  it("knows month lengths, including leap February", () => {
    expect(daysInMonth(2026, 8)).toBe(30);
    expect(daysInMonth(2028, 1)).toBe(29);
  });

  it("only offers categories the spending views actually count", () => {
    expect(BUDGETABLE_CATEGORIES).toContain("FOOD_AND_DRINK");
    expect(BUDGETABLE_CATEGORIES).toContain("OTHER");
    for (const excluded of ["INCOME", "TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS", "LOAN_DISBURSEMENTS"]) {
      expect(BUDGETABLE_CATEGORIES).not.toContain(excluded);
    }
  });
});

describe("budget months, income and tips", () => {
  it("reads the month from the address, but never one still to come", () => {
    const today = "2026-09-24";
    expect(budgetMonth(undefined, today)).toMatchObject({ key: "2026-09", day: 24, days: 30, daysLeft: 6, isCurrent: true });
    expect(budgetMonth("2026-08", today)).toMatchObject({ key: "2026-08", day: 31, fraction: 1, isPast: true, label: "August 2026" });
    expect(budgetMonth("2026-12", today).key).toBe("2026-09");
    expect(budgetMonth("garbage", today).key).toBe("2026-09");
    expect(shiftBudgetMonth("2026-01", -1)).toBe("2025-12");
  });

  const tx = (date: string, amount: number, pfc_primary = "INCOME"): SpendingTransaction => ({
    date,
    amount,
    pfc_primary,
    merchant_name: "Pay",
    name: null,
    pending: false,
  });

  it("takes typical income as the median of the complete months before, ignoring the partial first month", () => {
    const rows = [
      tx("2026-03-20", -100), // history starts mid-March: not counted
      tx("2026-04-15", -3000),
      tx("2026-05-15", -3200),
      tx("2026-06-15", -9000), // a bonus month doesn't swing the median
      tx("2026-07-15", -3100),
      tx("2026-08-15", -3050),
      tx("2026-09-15", -3000),
    ];
    expect(incomeForMonth(rows, "2026-06")).toBe(9000);
    expect(typicalIncome(rows, "2026-09")).toBe(3100);
    expect(typicalIncome([], "2026-09")).toBeNull();
  });

  it("counts on paychecks only: extras count when they land, and a paycheck in means nothing more is expected", () => {
    const pay = (date: string) => ({ ...tx(date, -3050), pfc_detailed: "INCOME_WAGES", merchant_name: "United Mortgage Paycheck" });
    const rows = [
      tx("2026-05-02", -10, "INCOME"),
      pay("2026-06-15"),
      pay("2026-07-15"),
      { ...tx("2026-07-20", -5095), merchant_name: "Invoice payment" }, // a one-off doesn't raise what's expected
      pay("2026-08-15"),
      { ...tx("2026-09-04", -99.91), merchant_name: "Zelle Transfer" },
    ];
    expect(budgetIncome(rows, "2026-09")).toEqual({ expected: 3050, paychecks: 0, extra: 99.91, stillExpected: 3050 });
    expect(budgetIncome([...rows, pay("2026-09-15")], "2026-09")).toMatchObject({ paychecks: 3050, stillExpected: 0 });
  });

  it("puts what's over first, then what's on pace to go over, and offers budgets to set", () => {
    const month = budgetMonth(undefined, "2026-09-20");
    const progress = [
      { id: "1", category: "FOOD_AND_DRINK", label: "Food & Drink", colorSlot: 1, budget: 300, spent: 388, remaining: -88, percentUsed: 1.29, status: "over" as const, projected: 580, projectedOver: false },
      { id: "2", category: "PERSONAL_CARE", label: "Personal Care", colorSlot: 5, budget: 150, spent: 120, remaining: 30, percentUsed: 0.8, status: "warning" as const, projected: 180, projectedOver: true },
      { id: "3", category: "GENERAL_SERVICES", label: "General Services", colorSlot: 6, budget: 20, spent: 10, remaining: 10, percentUsed: 0.5, status: "ok" as const, projected: 15, projectedOver: false },
    ];
    const tips = budgetTips(progress, [{ category: "TRAVEL", label: "Travel", amount: 240 }], { GENERAL_SERVICES: 265, TRAVEL: 200 }, month);
    // More spent than budgeted overall, so no "a day to stay on budget".
    expect(tips.map((t) => t.key)).toEqual(["over:FOOD_AND_DRINK", "pace:PERSONAL_CARE", "low:GENERAL_SERVICES", "none:TRAVEL"]);
    expect(tips[1].body).toContain("$3 a day");
    expect(tips.find((t) => t.key === "low:GENERAL_SERVICES")?.action).toEqual({ category: "GENERAL_SERVICES", amount: 265, label: "Set to $265" });
    expect(tips.find((t) => t.key === "none:TRAVEL")?.action?.amount).toBe(200);
  });
});
