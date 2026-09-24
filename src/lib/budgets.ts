import { ALL_PFC_CATEGORIES, categoryColorSlot, humanizeCategory, isSpendingCategory, OTHER_CATEGORY_COLOR_SLOT } from "@/lib/plaid-categories";
import { categoryTotalsForMonth, type CategoryTotal, type SpendingTransaction } from "@/lib/spending-aggregation";

// Pure, dependency-free. Budgets are per spending category, keyed exactly
// like the spending views group (displayCategoryKey: a PFC primary, with the
// loan-payment carve-in folded into OTHER), so a budget and its category
// total can never disagree about what belongs where.

export type Budget = { id: string; category: string; monthly_amount: number };

export type BudgetStatus = "ok" | "warning" | "over";

export type BudgetProgress = {
  id: string;
  category: string;
  label: string;
  colorSlot: number;
  budget: number;
  spent: number;
  remaining: number; // negative once over budget
  percentUsed: number; // 0..n, can exceed 1
  status: BudgetStatus;
  // Month-end spend if the pace so far holds; null too early in the month
  // to be meaningful.
  projected: number | null;
  projectedOver: boolean;
};

// The categories a budget can be set on: everything the spending views
// count. LOAN_PAYMENTS is excluded because its spending folds into OTHER.
export const BUDGETABLE_CATEGORIES = ALL_PFC_CATEGORIES.filter(
  (c) => isSpendingCategory(c) && c !== "LOAN_PAYMENTS"
);

export const WARNING_THRESHOLD = 0.8;
// Before this day of the month a projection is mostly noise (one big
// purchase on day 1 would "project" to 30x).
const MIN_DAY_FOR_PROJECTION = 5;

export function categoryLabel(category: string): string {
  return category === "OTHER" ? "Other" : humanizeCategory(category);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function budgetStatus(spent: number, budget: number): BudgetStatus {
  if (spent > budget) return "over";
  if (spent >= budget * WARNING_THRESHOLD) return "warning";
  return "ok";
}

/**
 * Progress for every budget this month. A budgeted category with no
 * spending yet still gets a row (categoryTotalsForMonth only lists
 * categories that have spending). Most-used first, so the ones needing
 * attention lead.
 */
export function budgetProgress(
  categoryTotals: CategoryTotal[],
  budgets: Budget[],
  today: { year: number; month: number; isoDate: string }
): BudgetProgress[] {
  const spentBy = new Map(categoryTotals.map((c) => [c.category, c.amount]));
  const dayOfMonth = Number(today.isoDate.slice(8, 10));
  const fractionElapsed = dayOfMonth / daysInMonth(today.year, today.month);

  return budgets
    .map((b) => {
      const spent = spentBy.get(b.category) ?? 0;
      const projected = dayOfMonth >= MIN_DAY_FOR_PROJECTION ? spent / fractionElapsed : null;
      const status = budgetStatus(spent, b.monthly_amount);
      return {
        id: b.id,
        category: b.category,
        label: categoryLabel(b.category),
        colorSlot: categoryColorSlot(b.category) ?? OTHER_CATEGORY_COLOR_SLOT,
        budget: b.monthly_amount,
        spent,
        remaining: b.monthly_amount - spent,
        percentUsed: spent / b.monthly_amount,
        status,
        projected,
        projectedOver: status !== "over" && projected !== null && projected > b.monthly_amount,
      };
    })
    .sort((a, b) => b.percentUsed - a.percentUsed);
}

/** Categories with spending this month but no budget, biggest first. */
export function unbudgetedSpending(categoryTotals: CategoryTotal[], budgets: Budget[]): CategoryTotal[] {
  const budgeted = new Set(budgets.map((b) => b.category));
  return categoryTotals.filter((c) => !budgeted.has(c.category)).sort((a, b) => b.amount - a.amount);
}

export function budgetTotals(progress: BudgetProgress[]): { budget: number; spent: number; remaining: number } {
  const budget = progress.reduce((s, p) => s + p.budget, 0);
  const spent = progress.reduce((s, p) => s + p.spent, 0);
  return { budget, spent, remaining: budget - spent };
}

/**
 * A starting budget for a category: the average of the last `monthsBack`
 * full months, rounded up to the next $5. Only months on or after the
 * first month that has any transaction count, so a short history isn't
 * dragged down by months before the account was connected. Null when
 * there's no full month of history to average.
 */
export function suggestBudget(
  transactions: SpendingTransaction[],
  category: string,
  today: { year: number; month: number },
  monthsBack = 3
): number | null {
  const firstMonth = transactions.reduce<string | null>((min, t) => {
    const m = t.date.slice(0, 7);
    return min === null || m < min ? m : min;
  }, null);
  if (firstMonth === null) return null;

  let total = 0;
  let counted = 0;

  for (let i = 1; i <= monthsBack; i++) {
    const d = new Date(today.year, today.month - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key < firstMonth) continue;
    const row = categoryTotalsForMonth(transactions, d.getFullYear(), d.getMonth()).find(
      (c) => c.category === category
    );
    total += row?.amount ?? 0;
    counted++;
  }

  if (counted === 0) return null;
  const average = total / counted;
  return Math.max(5, Math.ceil(average / 5) * 5);
}
