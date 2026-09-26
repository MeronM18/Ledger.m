import type { ForecastEvent } from "@/lib/forecast";
import { incomeAmount, type CategoryTotal, type SpendingTransaction } from "@/lib/spending-aggregation";
import { effectiveCategory } from "@/lib/transaction-display";

// Pure. The Overview's figures: this month day by day, the same point last
// month to compare with, income month by month, what's due soon and where
// the month's money went. Spending is the ledger's spending list (net of
// refunds and paid-back shares), so every figure matches Budgets, Spending
// and Transactions.

export type MonthRef = { year: number; month: number }; // month 0-indexed

const cents = (n: number) => Math.round(n * 100) / 100;
const keyOf = ({ year, month }: MonthRef) => `${year}-${String(month + 1).padStart(2, "0")}`;

export function daysIn({ year, month }: MonthRef): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function shiftMonth({ year, month }: MonthRef, by: number): MonthRef {
  const d = new Date(Date.UTC(year, month + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** Each day's spending in a month, net: index 0 is the 1st. */
export function dailySpending(spending: SpendingTransaction[], ref: MonthRef): number[] {
  const key = keyOf(ref);
  const days = new Array<number>(daysIn(ref)).fill(0);
  for (const t of spending) {
    if (t.date.slice(0, 7) !== key) continue;
    days[Number(t.date.slice(8, 10)) - 1] += t.amount;
  }
  return days.map(cents);
}

/** Money in categorized as income, posted, by day of one month. */
function dailyIncome(all: SpendingTransaction[], ref: MonthRef): number[] {
  const key = keyOf(ref);
  const days = new Array<number>(daysIn(ref)).fill(0);
  for (const t of all) {
    if (t.pending || t.date.slice(0, 7) !== key || effectiveCategory(t) !== "INCOME") continue;
    days[Number(t.date.slice(8, 10)) - 1] += incomeAmount(t);
  }
  return days;
}

const sumThrough = (days: number[], day: number) => cents(days.slice(0, Math.min(day, days.length)).reduce((s, v) => s + v, 0));

/** The change from `before` to `now` as a share of `before`; null with nothing to compare against. */
export function change(now: number, before: number): number | null {
  if (before <= 0) return null;
  return (now - before) / before;
}

export type MonthSoFar = {
  // Through `day` of this month.
  now: number;
  // Last month through the same day (its last day, when it's shorter).
  before: number;
  change: number | null;
  // Last month's whole total.
  beforeTotal: number;
};

/** This month's spending so far against last month at the same point. */
export function spendingSoFar(spending: SpendingTransaction[], ref: MonthRef, day: number): MonthSoFar {
  const last = dailySpending(spending, shiftMonth(ref, -1));
  const now = sumThrough(dailySpending(spending, ref), day);
  const before = sumThrough(last, day);
  return { now, before, change: change(now, before), beforeTotal: sumThrough(last, last.length) };
}

/** This month's income so far against last month at the same point. */
export function incomeSoFar(all: SpendingTransaction[], ref: MonthRef, day: number): MonthSoFar {
  const last = dailyIncome(all, shiftMonth(ref, -1));
  const now = sumThrough(dailyIncome(all, ref), day);
  const before = sumThrough(last, day);
  return { now, before, change: change(now, before), beforeTotal: sumThrough(last, last.length) };
}

/** Income for each of the `count` months ending with `ref`, oldest first. */
export function incomeByMonth(all: SpendingTransaction[], ref: MonthRef, count = 12): { month: string; amount: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const m = shiftMonth(ref, i - count + 1);
    return { month: keyOf(m), amount: sumThrough(dailyIncome(all, m), 31) };
  });
}

/** Spending for each of the `count` months ending with `ref`, oldest first. */
export function spendingByMonth(spending: SpendingTransaction[], ref: MonthRef, count = 6): { month: string; amount: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const m = shiftMonth(ref, i - count + 1);
    return { month: keyOf(m), amount: sumThrough(dailySpending(spending, m), 31) };
  });
}

/** Running totals, day by day. */
export function cumulative(days: number[]): number[] {
  let total = 0;
  return days.map((d) => (total = cents(total + d)));
}

export type Upcoming = { items: ForecastEvent[]; total: number };

/** Bills and card payments due from today through `days` ahead, soonest first. Income isn't forecast. */
export function upcomingBills(events: ForecastEvent[], todayIso: string, days = 14): Upcoming {
  const end = new Date(Date.parse(`${todayIso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const items = events.filter((e) => e.kind !== "income" && e.date >= todayIso && e.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  return { items, total: cents(items.reduce((s, e) => s + Math.abs(e.amount), 0)) };
}

export type CategoryShare = CategoryTotal & { share: number };

/** The month's biggest categories and each one's share of what was spent; the rest summed. */
export function whereItWent(categories: CategoryTotal[], count = 4): { top: CategoryShare[]; rest: { count: number; amount: number } } {
  const positive = categories.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = positive.reduce((s, c) => s + c.amount, 0);
  const top = positive.slice(0, count).map((c) => ({ ...c, share: total > 0 ? c.amount / total : 0 }));
  const others = positive.slice(count);
  return { top, rest: { count: others.length, amount: cents(others.reduce((s, c) => s + c.amount, 0)) } };
}

/**
 * A strip of pills for a series: each value's height against the largest,
 * on a square-root scale so one big day (rent on the 1st) doesn't flatten
 * the rest, and at least a sliver when it's above zero. Values that haven't
 * happened yet are null and stay unlit.
 */
export function pillLevels(values: (number | null)[]): (number | null)[] {
  const max = Math.max(0, ...values.map((v) => v ?? 0));
  return values.map((v) => (v === null ? null : max > 0 && v > 0 ? Math.max(0.12, Math.sqrt(v / max)) : 0));
}

/** Pills for a series that moves within a band (net worth): lowest a quarter full, highest full. */
export function pillLevelsInRange(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((v) => (max === min ? 0.6 : 0.25 + (0.75 * (v - min)) / (max - min)));
}
