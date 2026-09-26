import type { ForecastEvent } from "@/lib/forecast";
import type { CategoryTotal, SpendingTransaction } from "@/lib/spending-aggregation";

// Pure. The Overview's figures: spending by the day, week and month, what's
// due soon and where the month's money went. Spending is the ledger's
// spending list (net of refunds and paid-back shares), so every figure
// matches Budgets, Spending and Transactions.

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

export type Upcoming = { items: ForecastEvent[]; total: number };

/** Bills and card payments due from today through `days` ahead, soonest first. Income isn't forecast. */
export function upcomingBills(events: ForecastEvent[], todayIso: string, days = 14): Upcoming {
  const end = new Date(Date.parse(`${todayIso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const items = events.filter((e) => e.kind !== "income" && e.date >= todayIso && e.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  return { items, total: cents(items.reduce((s, e) => s + Math.abs(e.amount), 0)) };
}

export type CategoryShare = CategoryTotal & { share: number };

/**
 * The month's categories and each one's share of what was spent, biggest
 * first: all of them (for the ring, each in its own color), the biggest few
 * (for the legend), and the rest summed.
 */
export function whereItWent(
  categories: CategoryTotal[],
  count = 4
): { all: CategoryShare[]; top: CategoryShare[]; rest: { count: number; amount: number } } {
  const positive = categories.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = positive.reduce((s, c) => s + c.amount, 0);
  const all = positive.map((c) => ({ ...c, share: total > 0 ? c.amount / total : 0 }));
  const others = positive.slice(count);
  return { all, top: all.slice(0, count), rest: { count: others.length, amount: cents(others.reduce((s, c) => s + c.amount, 0)) } };
}

export type ActivityBar = { key: string; label: string; amount: number; current: boolean };
export type SpendingActivity = { day: ActivityBar[]; week: ActivityBar[]; month: ActivityBar[] };

const DAY = 86_400_000;
const isoPlus = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const shortLabel = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

/**
 * Spending by the day (the last 7), the week (the last 8, Sunday to
 * Saturday) and the month (the last 6), each ending on the one in progress.
 * Net of refunds and paid-back shares like every spending total, and never
 * below zero for a bar (a week of refunds is an empty week, not a hole).
 */
export function spendingActivity(spending: SpendingTransaction[], todayIso: string): SpendingActivity {
  const byDay = new Map<string, number>();
  for (const t of spending) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount);
  const sumDays = (from: string, to: string) => {
    let total = 0;
    for (const [d, v] of byDay) if (d >= from && d <= to) total += v;
    return Math.max(0, cents(total));
  };

  const day = Array.from({ length: 7 }, (_, i) => {
    const d = isoPlus(todayIso, i - 6);
    return { key: d, label: shortLabel(d, { weekday: "short" }), amount: sumDays(d, d), current: i === 6 };
  });

  const weekday = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
  const thisWeek = isoPlus(todayIso, -weekday);
  const week = Array.from({ length: 8 }, (_, i) => {
    const from = isoPlus(thisWeek, (i - 7) * 7);
    return { key: from, label: shortLabel(from, { month: "short", day: "numeric" }), amount: sumDays(from, isoPlus(from, 6)), current: i === 7 };
  });

  const [y, m] = todayIso.split("-").map(Number);
  const month = Array.from({ length: 6 }, (_, i) => {
    const ref = shiftMonth({ year: y, month: m - 1 }, i - 5);
    const from = `${keyOf(ref)}-01`;
    return { key: keyOf(ref), label: shortLabel(from, { month: "short" }), amount: sumDays(from, `${keyOf(ref)}-${String(daysIn(ref)).padStart(2, "0")}`), current: i === 5 };
  });

  return { day, week, month };
}

/** The usual for a set of bars: the average of the ones before the current one, or null with none. */
export function usualOf(bars: ActivityBar[]): number | null {
  const before = bars.filter((b) => !b.current);
  return before.length ? cents(before.reduce((s, b) => s + b.amount, 0) / before.length) : null;
}
