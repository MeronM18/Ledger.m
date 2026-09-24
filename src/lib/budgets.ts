import { ALL_PFC_CATEGORIES, categoryColorSlot, humanizeCategory, isSpendingCategory, OTHER_CATEGORY_COLOR_SLOT } from "@/lib/plaid-categories";
import { categoryTotalsForMonth, type CategoryTotal, type SpendingTransaction } from "@/lib/spending-aggregation";
import { effectiveCategory } from "@/lib/transaction-display";

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

// ---- Months, pace and income ----------------------------------------------

export type BudgetMonth = {
  year: number;
  month: number; // 0-indexed
  key: string; // YYYY-MM
  label: string; // "September 2026"
  // How far through the month "today" is for this month: the day it
  // counts to, and whether it's this month, one already over, or ahead.
  isoDate: string;
  day: number;
  days: number;
  daysLeft: number;
  fraction: number; // 0..1 of the month gone
  isCurrent: boolean;
  isPast: boolean;
};

const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, "0")}`;

/** The month `param` ("2026-08") names, or this month; never a month still to come. */
export function budgetMonth(param: string | undefined, todayIso: string): BudgetMonth {
  const ty = Number(todayIso.slice(0, 4));
  const tm = Number(todayIso.slice(5, 7)) - 1;
  let year = ty;
  let month = tm;
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const py = Number(param.slice(0, 4));
    const pm = Number(param.slice(5, 7)) - 1;
    if (pm >= 0 && pm < 12 && monthKey(py, pm) <= monthKey(ty, tm)) {
      year = py;
      month = pm;
    }
  }
  const days = daysInMonth(year, month);
  const isCurrent = year === ty && month === tm;
  const day = isCurrent ? Number(todayIso.slice(8, 10)) : days;
  return {
    year,
    month,
    key: monthKey(year, month),
    label: new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    isoDate: `${monthKey(year, month)}-${String(day).padStart(2, "0")}`,
    day,
    days,
    daysLeft: days - day,
    fraction: day / days,
    isCurrent,
    isPast: !isCurrent,
  };
}

export function shiftBudgetMonth(key: string, by: number): string {
  const d = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** Money in categorized as income in one month (posted), less any reversed. */
export function incomeForMonth(transactions: SpendingTransaction[], key: string): number {
  let total = 0;
  for (const t of transactions) {
    if (t.pending || t.date.slice(0, 7) !== key) continue;
    if (effectiveCategory(t) === "INCOME") total -= t.amount;
  }
  return Math.max(0, Math.round(total * 100) / 100);
}

/**
 * What a month usually brings in: the median of the complete months before
 * it (up to `monthsBack`), counting only months since the history begins.
 * The median, so one bonus or one short month doesn't swing it. Null with
 * no complete month to go on.
 */
export function typicalIncome(transactions: SpendingTransaction[], key: string, monthsBack = 6): number | null {
  const first = transactions.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null);
  if (!first) return null;
  const firstMonth = first.slice(0, 7);
  const values: number[] = [];
  for (let i = 1; i <= monthsBack; i++) {
    const m = shiftBudgetMonth(key, -i);
    // The month history starts in is usually partial.
    if (m <= firstMonth) break;
    values.push(incomeForMonth(transactions, m));
  }
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round((sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
}

// ---- Staying on track --------------------------------------------------------

export type BudgetTip = {
  key: string;
  tone: "good" | "warn" | "bad";
  title: string;
  body: string;
  // A budget this suggests setting, one tap away.
  action?: { category: string; amount: number; label: string };
};

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);

/**
 * What to do about this month's budgets, most pressing first: categories
 * over budget, ones on pace to go over (and the daily amount that would
 * keep them under), budgets set far below what the category usually costs,
 * big spending with no budget, and what's left to spend a day.
 */
export function budgetTips(
  progress: BudgetProgress[],
  unbudgeted: { category: string; label: string; amount: number }[],
  suggestions: Record<string, number | null>,
  month: BudgetMonth
): BudgetTip[] {
  const tips: BudgetTip[] = [];
  const over = progress.filter((p) => p.status === "over").sort((a, b) => a.remaining - b.remaining);
  for (const p of over) {
    tips.push({
      key: `over:${p.category}`,
      tone: "bad",
      title: `${p.label} is ${money(-p.remaining)} over`,
      body: month.isCurrent
        ? `${money(p.spent)} spent of ${money(p.budget)}. Anything more this month adds to it.`
        : `${money(p.spent)} spent of ${money(p.budget)} in ${month.label}.`,
    });
  }

  if (month.isCurrent) {
    for (const p of progress.filter((x) => x.projectedOver && x.projected !== null)) {
      const perDay = month.daysLeft > 0 ? p.remaining / month.daysLeft : p.remaining;
      tips.push({
        key: `pace:${p.category}`,
        tone: "warn",
        title: `${p.label} is on pace for ${money(Math.round(p.projected!))}`,
        body: `Against a ${money(p.budget)} budget. Keep it to about ${money(Math.max(0, Math.floor(perDay)))} a day to stay under.`,
      });
    }
  }

  for (const p of progress) {
    const usual = suggestions[p.category];
    if (usual && p.budget < usual * 0.6 && usual - p.budget >= 25) {
      tips.push({
        key: `low:${p.category}`,
        tone: "warn",
        title: `${p.label} is budgeted well under what it usually costs`,
        body: `${money(p.budget)} budgeted; it's usually about ${money(usual)} a month. A budget you can keep works better.`,
        action: { category: p.category, amount: usual, label: `Set to ${money(usual)}` },
      });
    }
  }

  for (const u of unbudgeted.filter((x) => x.amount >= 50).slice(0, 3)) {
    const amount = suggestions[u.category] ?? Math.max(5, Math.ceil(u.amount / 5) * 5);
    tips.push({
      key: `none:${u.category}`,
      tone: "warn",
      title: `${u.label} has ${money(Math.round(u.amount * 100) / 100)} with no budget`,
      body: `Give it a budget so it counts toward what you plan to spend.`,
      action: { category: u.category, amount, label: `Budget ${money(amount)}` },
    });
  }

  const budget = progress.reduce((s, p) => s + p.budget, 0);
  const spent = progress.reduce((s, p) => s + p.spent, 0);
  if (month.isCurrent && budget > 0 && spent < budget && month.daysLeft > 0) {
    tips.push({
      key: "daily",
      tone: "good",
      title: `${money(Math.floor(((budget - spent) / month.daysLeft) * 100) / 100)} a day to stay on budget`,
      body: `${money(Math.round((budget - spent) * 100) / 100)} left across your budgets for the last ${month.daysLeft} ${month.daysLeft === 1 ? "day" : "days"} of ${month.label.split(" ")[0]}.`,
    });
  }
  if (tips.length === 0 && progress.length > 0) {
    tips.push({ key: "ok", tone: "good", title: "Everything's on track", body: "Every budget is within its limit and on pace." });
  }
  return tips;
}
