import { describe, expect, it } from "vitest";
import {
  budgetMonth,
  budgetPlan,
  budgetTips,
  categoryBudgetError,
  merchantsByCategory,
  monthCategorySpending,
  monthlyBudgetError,
  resolveMonthlyBudget,
  shiftBudgetMonth,
  BUDGETABLE_CATEGORIES,
  budgetProgress,
  budgetStatus,
  daysInMonth,
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

describe("monthCategorySpending", () => {
  it("nets refunds per category, keeps a category that nets below zero, and matches Spending's total", () => {
    const rows = [
      tx({ amount: 90 }),
      tx({ amount: -15 }), // a refund comes off Food & Drink
      tx({ pfc_primary: "TRAVEL", amount: -120 }), // a refund for last month's trip, bigger than this month's travel
      tx({ pfc_primary: null, amount: 40 }),
      tx({ date: "2026-08-30", amount: 500 }), // another month
    ];
    const byCategory = monthCategorySpending(rows, 2026, 8);
    expect(Object.fromEntries(byCategory.map((c) => [c.category, c.amount]))).toEqual({ FOOD_AND_DRINK: 75, OTHER: 40, TRAVEL: -120 });
    // The same net total Spending shows for the month, not the positive categories alone.
    expect(byCategory.reduce((s, c) => s + c.amount, 0)).toBe(-5);
    expect(categoryTotalsForMonth(rows, 2026, 8).reduce((s, c) => s + c.amount, 0)).toBe(115);
  });
});

describe("the monthly budget", () => {
  const spending = monthCategorySpending(
    [tx({ amount: 90 }), tx({ pfc_primary: "TRAVEL", amount: 20 }), tx({ pfc_primary: "MEDICAL", amount: 55 })],
    2026,
    8
  );
  const budgets = [budget("FOOD_AND_DRINK", 100), budget("TRAVEL", 50)];

  it("splits into category budgets and Everything else, which always add up to it", () => {
    const plan = budgetPlan(spending, budgets, 1000, day(15));
    expect(plan).toMatchObject({ total: 1000, assigned: 150, spent: 165, unbudgetedSpent: 55 });
    expect(plan.everythingElse).toMatchObject({ budget: 850, spent: 55, remaining: 795, status: "ok" });
    expect(plan.month).toMatchObject({ budget: 1000, spent: 165, remaining: 835 });
    expect(plan.assigned + plan.everythingElse!.budget).toBe(plan.total);
    expect(plan.unbudgeted.map((c) => c.category)).toEqual(["MEDICAL"]);
  });

  it("works without a monthly budget: no Everything else, just the categories", () => {
    const plan = budgetPlan(spending, budgets, null, day(15));
    expect(plan.month).toBeNull();
    expect(plan.everythingElse).toBeNull();
    expect(plan.unbudgetedSpent).toBe(55);
  });

  it("counts Everything else as over once categories use the whole budget and something else is spent", () => {
    const plan = budgetPlan(spending, budgets, 150, day(15));
    expect(plan.everythingElse).toMatchObject({ budget: 0, spent: 55, remaining: -55, status: "over" });
    expect(plan.month).toMatchObject({ remaining: -15, status: "over" });
  });

  it("keeps category budgets inside the monthly budget", () => {
    expect(categoryBudgetError(null, budgets, "MEDICAL", 5000)).toBeNull(); // no monthly budget: anything goes
    expect(categoryBudgetError(200, budgets, "MEDICAL", 50)).toBeNull(); // exactly fills it
    expect(categoryBudgetError(200, budgets, "MEDICAL", 51)).toMatch(/\$50 isn't given to another category/);
    expect(categoryBudgetError(200, budgets, "FOOD_AND_DRINK", 150)).toBeNull(); // changing one replaces its old amount
    expect(categoryBudgetError(150, budgets, "MEDICAL", 10)).toMatch(/already use all of your \$150/);
  });

  it("won't set a monthly budget below what the categories add up to", () => {
    expect(monthlyBudgetError(150, budgets)).toBeNull();
    expect(monthlyBudgetError(149.99, budgets)).toMatch(/add up to \$150/);
    expect(monthlyBudgetError(10, [])).toBeNull();
  });

  it("reads a stored monthly budget, and nothing else", () => {
    expect(resolveMonthlyBudget({ amount: 3000 })).toBe(3000);
    expect(resolveMonthlyBudget({ amount: 0 })).toBeNull();
    expect(resolveMonthlyBudget({ amount: "3000" })).toBeNull();
    expect(resolveMonthlyBudget(null)).toBeNull();
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

  it("puts the month first, then what's over and where it went, then what's on pace to go over; never a budget to raise", () => {
    const month = budgetMonth(undefined, "2026-09-20");
    const progress = [
      { id: "1", category: "FOOD_AND_DRINK", label: "Food & Drink", colorSlot: 1, budget: 300, spent: 388, remaining: -88, percentUsed: 1.29, status: "over" as const, projected: 580, projectedOver: false },
      { id: "2", category: "PERSONAL_CARE", label: "Personal Care", colorSlot: 5, budget: 150, spent: 120, remaining: 30, percentUsed: 0.8, status: "warning" as const, projected: 180, projectedOver: true },
      { id: "3", category: "GENERAL_SERVICES", label: "General Services", colorSlot: 6, budget: 20, spent: 10, remaining: 10, percentUsed: 0.5, status: "ok" as const, projected: 15, projectedOver: false },
    ];
    const spending = [
      { category: "FOOD_AND_DRINK", label: "Food & Drink", amount: 388, colorSlot: 1 },
      { category: "PERSONAL_CARE", label: "Personal Care", amount: 120, colorSlot: 5 },
      { category: "GENERAL_SERVICES", label: "General Services", amount: 10, colorSlot: 6 },
      { category: "TRAVEL", label: "Travel", amount: 240, colorSlot: 10 },
    ];
    const budgets = progress.map((p) => budget(p.category, p.budget));
    const merchants = merchantsByCategory(
      [tx({ amount: 200, merchant_name: "DoorDash" }), tx({ amount: 100, merchant_name: "DoorDash" }), tx({ amount: 88, merchant_name: "Chipotle" })],
      "2026-09"
    );
    // $758 spent by day 20 of 30 is on pace for $1,137 against $1,000.
    const tips = budgetTips(progress, budgetPlan(spending, budgets, 1000, month), month, merchants);
    expect(tips.map((t) => t.key)).toEqual(["month:pace", "over:FOOD_AND_DRINK", "pace:PERSONAL_CARE", "daily"]);
    expect(tips[0].body).toContain("$24.20 a day for the last 10 days");
    expect(tips[1].body).toContain("Most went to DoorDash ($300, 2 times) and Chipotle ($88)");
    expect(tips[2].body).toContain("$3 a day");
    expect(tips.some((t) => /raise|set to|usually/i.test(`${t.title} ${t.body}`))).toBe(false);
  });

  it("says when the month is over budget, and when spending with no budget of its own has run past what's left for it", () => {
    const month = budgetMonth("2026-08", "2026-09-20");
    const spending = [
      { category: "FOOD_AND_DRINK", label: "Food & Drink", amount: 90, colorSlot: 1 },
      { category: "TRAVEL", label: "Travel", amount: 400, colorSlot: 10 },
    ];
    const budgets = [budget("FOOD_AND_DRINK", 100)];
    const tips = budgetTips(budgetProgress(spending, budgets, month), budgetPlan(spending, budgets, 300, month), month);
    expect(tips.map((t) => t.key)).toEqual(["month:over", "over:everything-else"]);
    expect(tips[0].title).toBe("$190 over your monthly budget");
    expect(tips[1].body).toContain("Travel $400");
  });
});
