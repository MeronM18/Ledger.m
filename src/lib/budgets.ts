import { ALL_PFC_CATEGORIES, categoryColorSlot, humanizeCategory, isSpendingCategory, OTHER_CATEGORY_COLOR_SLOT } from "@/lib/plaid-categories";
import { displayCategoryKey, topMerchants, type CategoryTotal, type MerchantTotal, type SpendingTransaction } from "@/lib/spending-aggregation";

// Pure, dependency-free. One monthly budget for all spending, split into
// category budgets that fit inside it; whatever isn't given to a category is
// "Everything else", for the categories with no budget of their own. So the
// categories plus Everything else always add up to the monthly budget.
//
// Categories are keyed exactly like the spending views group
// (displayCategoryKey: a PFC primary, with the loan-payment carve-in folded
// into OTHER), and spending is the same net figure Spending shows, so a
// budget and its category total can never disagree about what belongs where.

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
 * Progress for every budget this month, from monthCategorySpending. A
 * budgeted category with no spending yet still gets a row, and one whose
 * refunds outweigh its purchases shows that as less than nothing spent.
 * Most-used first, so the ones needing attention lead.
 */
/** Month-end spend if the pace so far holds; null too early in the month to mean much. */
function projection(spent: number, today: { year: number; month: number; isoDate: string }): number | null {
  const day = Number(today.isoDate.slice(8, 10));
  if (day < MIN_DAY_FOR_PROJECTION) return null;
  return spent / (day / daysInMonth(today.year, today.month));
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Net spending by category for one month: every purchase less every refund,
 * keeping a category whose refunds outweigh its purchases (Spending takes
 * those off its total too). Same grouping as the spending views.
 */
export function monthCategorySpending(spending: SpendingTransaction[], year: number, month: number): CategoryTotal[] {
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;
  const totals = new Map<string, number>();
  for (const t of spending) {
    if (t.date.slice(0, 7) !== key) continue;
    const category = displayCategoryKey(t);
    totals.set(category, (totals.get(category) ?? 0) + t.amount);
  }
  return Array.from(totals.entries())
    .map(([category, amount]) => ({
      category,
      label: categoryLabel(category),
      amount: cents(amount),
      colorSlot: categoryColorSlot(category) ?? OTHER_CATEGORY_COLOR_SLOT,
    }))
    .filter((c) => c.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
}

export function budgetProgress(
  categoryTotals: CategoryTotal[],
  budgets: Budget[],
  today: { year: number; month: number; isoDate: string }
): BudgetProgress[] {
  const spentBy = new Map(categoryTotals.map((c) => [c.category, c.amount]));

  return budgets
    .map((b) => {
      const spent = spentBy.get(b.category) ?? 0;
      const projected = projection(spent, today);
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

// ---- Months ----------------------------------------------------------------

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


// ---- The monthly budget -------------------------------------------------------

/** A stored monthly budget ({ amount }), or null when none is set or it's malformed. */
export function resolveMonthlyBudget(stored: unknown): number | null {
  const amount = stored && typeof stored === "object" ? (stored as { amount?: unknown }).amount : undefined;
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0 ? cents(amount) : null;
}

export type BudgetLine = {
  budget: number;
  spent: number;
  remaining: number; // negative once over
  percentUsed: number;
  status: BudgetStatus;
  projected: number | null;
  projectedOver: boolean;
};

export type BudgetPlan = {
  // The monthly budget; null until one is set.
  total: number | null;
  // Category budgets added up.
  assigned: number;
  // The whole month against the monthly budget: all spending, net, the same
  // figure Spending shows. Null with no monthly budget.
  month: BudgetLine | null;
  spent: number;
  // What's left of the monthly budget for categories without their own,
  // and what they've spent. Null with no monthly budget.
  everythingElse: BudgetLine | null;
  // Categories with spending this month and no budget, biggest first.
  unbudgeted: CategoryTotal[];
  unbudgetedSpent: number;
};

function line(budget: number, spent: number, today: { year: number; month: number; isoDate: string }): BudgetLine {
  const projected = projection(spent, today);
  const status = budget <= 0 ? (spent > 0.005 ? "over" : "ok") : budgetStatus(spent, budget);
  return {
    budget: cents(budget),
    spent: cents(spent),
    remaining: cents(budget - spent),
    percentUsed: budget > 0 ? spent / budget : spent > 0 ? Infinity : 0,
    status,
    projected,
    projectedOver: status !== "over" && projected !== null && projected > budget + 0.005,
  };
}

/** The monthly budget, how it's split, and the month against it. */
export function budgetPlan(
  categorySpending: CategoryTotal[],
  budgets: Budget[],
  total: number | null,
  today: { year: number; month: number; isoDate: string }
): BudgetPlan {
  const budgeted = new Set(budgets.map((b) => b.category));
  const assigned = cents(budgets.reduce((s, b) => s + b.monthly_amount, 0));
  const spent = cents(categorySpending.reduce((s, c) => s + c.amount, 0));
  const unbudgeted = categorySpending.filter((c) => !budgeted.has(c.category));
  const unbudgetedSpent = cents(unbudgeted.reduce((s, c) => s + c.amount, 0));
  return {
    total,
    assigned,
    month: total === null ? null : line(total, spent, today),
    spent,
    everythingElse: total === null ? null : line(total - assigned, unbudgetedSpent, today),
    unbudgeted: unbudgeted.filter((c) => c.amount > 0),
    unbudgetedSpent,
  };
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);

/**
 * Why a category budget can't be saved, or null if it can: with a monthly
 * budget set, the categories have to fit inside it.
 */
export function categoryBudgetError(total: number | null, budgets: Budget[], category: string, amount: number): string | null {
  if (total === null) return null;
  const others = cents(budgets.filter((b) => b.category !== category).reduce((s, b) => s + b.monthly_amount, 0));
  const room = cents(total - others);
  if (amount <= room + 0.005) return null;
  return room > 0
    ? `That's more than your monthly budget has left: ${money(room)} isn't given to another category yet. Lower another category first, or raise the monthly budget.`
    : `Your other categories already use all of your ${money(total)} monthly budget. Lower one of them first, or raise the monthly budget.`;
}

/** Why a monthly budget can't be saved, or null if it can: it has to cover the category budgets. */
export function monthlyBudgetError(amount: number, budgets: Budget[]): string | null {
  const assigned = cents(budgets.reduce((s, b) => s + b.monthly_amount, 0));
  if (amount + 0.005 >= assigned) return null;
  return `Your category budgets add up to ${money(assigned)}, so the monthly budget has to be at least that. Lower a category first.`;
}

// ---- Staying on track --------------------------------------------------------

export type BudgetTip = {
  key: string;
  tone: "good" | "warn" | "bad";
  title: string;
  body: string;
};

/** Where a category's money went this month, biggest first, by merchant. */
export function merchantsByCategory(spending: SpendingTransaction[], key: string, limit = 3): Record<string, MerchantTotal[]> {
  const groups = new Map<string, SpendingTransaction[]>();
  for (const t of spending) {
    if (t.date.slice(0, 7) !== key) continue;
    const category = displayCategoryKey(t);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(t);
  }
  return Object.fromEntries(Array.from(groups, ([category, txs]) => [category, topMerchants(txs, limit).map((m) => ({ ...m, amount: cents(m.amount) }))]));
}

function where(merchants: MerchantTotal[] | undefined): string {
  const top = (merchants ?? []).slice(0, 2);
  if (top.length === 0) return "";
  return ` Most went to ${top.map((m) => `${m.merchant} (${money(m.amount)}${m.count > 1 ? `, ${m.count} times` : ""})`).join(" and ")}.`;
}

const perDay = (remaining: number, daysLeft: number) => Math.max(0, Math.floor((remaining / Math.max(1, daysLeft)) * 100) / 100);

/**
 * What to know to stay within budget this month, most pressing first: the
 * month over or on pace to go over, categories over and where their money
 * went, categories on pace to go over and the daily amount that keeps them
 * under, then what's left to spend a day. It never suggests raising a
 * budget: the point is to keep spending inside the one you set.
 */
export function budgetTips(
  rows: BudgetProgress[],
  plan: BudgetPlan,
  month: BudgetMonth,
  merchants: Record<string, MerchantTotal[]> = {}
): BudgetTip[] {
  const tips: BudgetTip[] = [];
  const monthName = month.label.split(" ")[0];
  const days = `${month.daysLeft} ${month.daysLeft === 1 ? "day" : "days"}`;

  if (plan.month && plan.total !== null) {
    const m = plan.month;
    if (m.status === "over") {
      tips.push({
        key: "month:over",
        tone: "bad",
        title: `${money(-m.remaining)} over your monthly budget`,
        body: month.isCurrent
          ? `${money(m.spent)} spent of ${money(plan.total)}. Every dollar more this month adds to it.`
          : `${money(m.spent)} spent of ${money(plan.total)} in ${month.label}.`,
      });
    } else if (month.isCurrent && m.projectedOver && m.projected !== null) {
      tips.push({
        key: "month:pace",
        tone: "warn",
        title: `On pace to spend ${money(Math.round(m.projected))} this month`,
        body: `That's ${money(Math.round(m.projected - plan.total))} over your ${money(plan.total)} budget. Keep to about ${money(perDay(m.remaining, month.daysLeft))} a day for the last ${days} to finish within it.`,
      });
    }
  }

  for (const p of rows.filter((x) => x.status === "over").sort((a, b) => a.remaining - b.remaining)) {
    tips.push({
      key: `over:${p.category}`,
      tone: "bad",
      title: `${p.label} is ${money(-p.remaining)} over`,
      body: `${money(p.spent)} spent of ${money(p.budget)}.${where(merchants[p.category])}`,
    });
  }

  const other = plan.everythingElse;
  if (other && other.status === "over" && plan.unbudgeted.length > 0) {
    tips.push({
      key: "over:everything-else",
      tone: "bad",
      title: `Everything else is ${money(-other.remaining)} over`,
      body: `${money(other.spent)} spent in categories without their own budget, with ${money(Math.max(0, other.budget))} of the monthly budget left for them: ${plan.unbudgeted
        .slice(0, 3)
        .map((c) => `${c.label} ${money(c.amount)}`)
        .join(", ")}.`,
    });
  }

  if (month.isCurrent) {
    for (const p of rows.filter((x) => x.projectedOver && x.projected !== null)) {
      tips.push({
        key: `pace:${p.category}`,
        tone: "warn",
        title: `${p.label} is on pace for ${money(Math.round(p.projected!))}`,
        body: `Against a ${money(p.budget)} budget. Keep it to about ${money(perDay(p.remaining, month.daysLeft))} a day to stay under.${where(merchants[p.category])}`,
      });
    }
  }

  if (month.isCurrent && month.daysLeft > 0) {
    const left = plan.month ? plan.month.remaining : rows.reduce((s, p) => s + p.remaining, 0);
    const of = plan.total ?? rows.reduce((s, p) => s + p.budget, 0);
    if (of > 0 && left > 0) {
      tips.push({
        key: "daily",
        tone: "good",
        title: `${money(perDay(left, month.daysLeft))} a day for the rest of ${monthName}`,
        body: `${money(cents(left))} left of your ${money(of)} ${plan.total !== null ? "monthly budget" : "in budgets"}, with ${days} to go.`,
      });
    }
  }

  if (tips.length === 0 && (rows.length > 0 || plan.total !== null)) {
    tips.push({
      key: "ok",
      tone: "good",
      title: month.isCurrent ? "Everything's within budget" : `${monthName} finished within budget`,
      body: month.isCurrent ? "Every budget is within its limit and on pace." : "Every budget stayed within its limit.",
    });
  }
  return tips;
}
