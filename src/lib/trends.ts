import { categoryColorSlot, OTHER_CATEGORY_COLOR_SLOT } from "@/lib/plaid-categories";
import { categoryLabel, daysInMonth } from "@/lib/budgets";
import { categoryTotalsForMonth, type SpendingTransaction } from "@/lib/spending-aggregation";

// Pure, dependency-free. Everything here works on the already-filtered
// spending transactions the spending page shows, so a trend always agrees
// with the donut and bars beside it. "Spend" for pace is net (a refund
// reduces it), the same basis as the "Spending by month" bars.

export type MonthRef = { year: number; month: number }; // month is 0-indexed

export function previousMonth({ year, month }: MonthRef): MonthRef {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

function inMonth(t: SpendingTransaction, { year, month }: MonthRef): boolean {
  return Number(t.date.slice(0, 4)) === year && Number(t.date.slice(5, 7)) - 1 === month;
}

/** Cumulative net spend by day of month: index 0 is day 1. */
export function dailyCumulative(transactions: SpendingTransaction[], ref: MonthRef): number[] {
  const perDay = new Array<number>(daysInMonth(ref.year, ref.month)).fill(0);
  for (const t of transactions) {
    if (!inMonth(t, ref)) continue;
    perDay[Number(t.date.slice(8, 10)) - 1] += t.amount;
  }
  let running = 0;
  return perDay.map((v) => (running += v));
}

export type PacePoint = { day: number; current: number | null; previous: number | null };

export type Pace = {
  // Day the comparison runs through: today for the in-progress month, the
  // last day for a finished one.
  throughDay: number;
  isCurrentMonth: boolean;
  current: number;
  // What the previous month had spent by the same day, and in total.
  previousSamePoint: number;
  previousTotal: number;
  delta: number; // current - previousSamePoint
  deltaPct: number | null; // null when the previous month had no spend to compare against
  hasPrevious: boolean;
  series: PacePoint[];
};

/**
 * This month against last month, day by day. For the month in progress the
 * current line stops at today and last month is compared at the same day, so
 * "you're $80 behind last month's pace" is apples to apples rather than
 * today's half-month against last month's full one.
 */
export function paceComparison(
  transactions: SpendingTransaction[],
  ref: MonthRef,
  today: { year: number; month: number; day: number }
): Pace {
  const prevRef = previousMonth(ref);
  const isCurrentMonth = today.year === ref.year && today.month === ref.month;
  const length = daysInMonth(ref.year, ref.month);
  const throughDay = isCurrentMonth ? today.day : length;

  const cur = dailyCumulative(transactions, ref);
  const prev = dailyCumulative(transactions, prevRef);
  const firstMonth = transactions.reduce<string | null>((min, t) => {
    const m = t.date.slice(0, 7);
    return min === null || m < min ? m : min;
  }, null);
  const prevKey = `${prevRef.year}-${String(prevRef.month + 1).padStart(2, "0")}`;
  const hasPrevious = firstMonth !== null && prevKey >= firstMonth;

  const current = cur[throughDay - 1] ?? 0;
  const previousSamePoint = hasPrevious ? (prev[Math.min(throughDay, prev.length) - 1] ?? 0) : 0;
  const previousTotal = hasPrevious ? (prev[prev.length - 1] ?? 0) : 0;
  const delta = current - previousSamePoint;

  const series: PacePoint[] = [];
  for (let day = 1; day <= Math.max(length, prev.length); day++) {
    series.push({
      day,
      current: day <= throughDay && day <= length ? cur[day - 1] : null,
      previous: hasPrevious && day <= prev.length ? prev[day - 1] : null,
    });
  }

  return {
    throughDay,
    isCurrentMonth,
    current,
    previousSamePoint,
    previousTotal,
    delta,
    deltaPct: hasPrevious && previousSamePoint > 0 ? delta / previousSamePoint : null,
    hasPrevious,
    series,
  };
}

export type CategoryChange = {
  category: string;
  label: string;
  colorSlot: number;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null; // null when there was nothing last month (a brand-new category)
};

/**
 * Per-category change between a month and the one before, biggest movers
 * first (by dollars, not percent, so a $3 to $9 blip doesn't outrank a real
 * change). Compares full months; the in-progress month naturally reads as
 * "less so far", which the pace card above handles with a same-day compare.
 */
export function categoryChanges(transactions: SpendingTransaction[], ref: MonthRef): CategoryChange[] {
  const cur = new Map(categoryTotalsForMonth(transactions, ref.year, ref.month).map((c) => [c.category, c.amount]));
  const prevRef = previousMonth(ref);
  const prev = new Map(
    categoryTotalsForMonth(transactions, prevRef.year, prevRef.month).map((c) => [c.category, c.amount])
  );

  return Array.from(new Set([...cur.keys(), ...prev.keys()]))
    .map((category) => {
      const current = cur.get(category) ?? 0;
      const previous = prev.get(category) ?? 0;
      return {
        category,
        label: categoryLabel(category),
        colorSlot: categoryColorSlot(category) ?? OTHER_CATEGORY_COLOR_SLOT,
        current,
        previous,
        delta: current - previous,
        deltaPct: previous > 0 ? (current - previous) / previous : null,
      };
    })
    .filter((c) => c.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * Average net spend of the last `monthsBack` full months before `ref`,
 * counting only months from the first month with any data. Null when there
 * is no full earlier month.
 */
export function typicalMonth(transactions: SpendingTransaction[], ref: MonthRef, monthsBack = 3): number | null {
  const firstMonth = transactions.reduce<string | null>((min, t) => {
    const m = t.date.slice(0, 7);
    return min === null || m < min ? m : min;
  }, null);
  if (firstMonth === null) return null;

  let total = 0;
  let counted = 0;
  let cursor = ref;
  for (let i = 0; i < monthsBack; i++) {
    cursor = previousMonth(cursor);
    const key = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}`;
    if (key < firstMonth) break;
    const cumulative = dailyCumulative(transactions, cursor);
    total += cumulative[cumulative.length - 1] ?? 0;
    counted++;
  }

  return counted === 0 ? null : total / counted;
}
