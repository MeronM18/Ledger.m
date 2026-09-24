import { occurrencesBetween } from "@/lib/forecast";
import { monthlyFactorForFrequency } from "@/lib/plaid-categories";
import { stepDate, toDateString } from "@/lib/subscriptions-aggregation";

// Pure, dependency-free. The numbers on the Recurring page: what this
// month's subscriptions have charged so far and what's still to come, what
// charges next, and which ones make up most of the monthly cost.

export type RecurringCharge = {
  key: string;
  name: string;
  amount: number; // per charge, positive
  frequency: string | null;
  // The last charge actually seen (bank streams), when known.
  lastDate: string | null;
  // The stored next charge date; may already be in the past.
  nextDate: string | null;
};

export type DatedCharge = { key: string; name: string; amount: number; date: string };

const DAY_MS = 86_400_000;

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** Whole days from `todayIso` to `dateIso`: 0 today, 1 tomorrow, negative in the past. */
export function daysUntil(dateIso: string, todayIso: string): number {
  return Math.round((day(dateIso).getTime() - day(todayIso).getTime()) / DAY_MS);
}

/** "Today", "Tomorrow", "In 5 days", or "3 days ago". */
export function dueLabel(dateIso: string, todayIso: string): string {
  const n = daysUntil(dateIso, todayIso);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

/** One billing period before `d`, the reverse of stepDate. */
function stepBack(d: Date, frequency: string | null): Date {
  switch (frequency) {
    case "WEEKLY":
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7);
    case "BIWEEKLY":
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 14);
    case "SEMI_MONTHLY":
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 15);
    default: {
      const months = frequency === "ANNUALLY" ? 12 : 1;
      const target = new Date(d.getFullYear(), d.getMonth() - months, 1);
      const length = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(d.getDate(), length));
      return target;
    }
  }
}

/**
 * The most recent charge on or before today: the one the bank saw, else
 * the schedule's last date before today worked out from the next one.
 */
function lastCharge(item: RecurringCharge, todayIso: string): string | null {
  if (item.lastDate) return item.lastDate <= todayIso ? item.lastDate : null;
  if (!item.nextDate) return null;
  let cursor = day(item.nextDate);
  if (item.nextDate >= todayIso) {
    // Only an entry's stated schedule says it charged before; go back one period at a time.
    for (let i = 0; i < 1000 && toDateString(cursor) >= todayIso; i++) cursor = stepBack(cursor, item.frequency);
    return toDateString(cursor);
  }
  for (let i = 0; i < 1000; i++) {
    const next = stepDate(cursor, item.frequency);
    if (toDateString(next) >= todayIso) break;
    cursor = next;
  }
  return toDateString(cursor);
}

export type MonthOutlook = {
  paid: DatedCharge[];
  upcoming: DatedCharge[];
  paidTotal: number;
  upcomingTotal: number;
};

/**
 * This calendar month for a set of subscriptions: the charges that have
 * landed so far and the ones still expected before it ends. One that
 * hasn't charged in well over a period (lapsed) expects nothing more.
 */
export function monthOutlook(items: RecurringCharge[], todayIso: string): MonthOutlook {
  const monthStart = `${todayIso.slice(0, 7)}-01`;
  const today = day(todayIso);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const paid: DatedCharge[] = [];
  const upcoming: DatedCharge[] = [];
  for (const item of items) {
    if (item.amount <= 0) continue;
    const seen = new Set<string>();
    const last = lastCharge(item, todayIso);
    if (last) {
      let cursor = day(last);
      for (let i = 0; i < 40 && toDateString(cursor) >= monthStart; i++) {
        const iso = toDateString(cursor);
        seen.add(iso);
        paid.push({ key: item.key, name: item.name, amount: item.amount, date: iso });
        cursor = stepBack(cursor, item.frequency);
      }
    }
    const dates = occurrencesBetween({ id: item.key, name: item.name, amount: item.amount, frequency: item.frequency, date: item.nextDate }, today, monthEnd);
    for (const date of dates) {
      if (!seen.has(date)) upcoming.push({ key: item.key, name: item.name, amount: item.amount, date });
    }
  }

  const byDate = (a: DatedCharge, b: DatedCharge) => a.date.localeCompare(b.date) || b.amount - a.amount;
  paid.sort(byDate);
  upcoming.sort(byDate);
  const sum = (list: DatedCharge[]) => list.reduce((s, c) => s + c.amount, 0);
  return { paid, upcoming, paidTotal: sum(paid), upcomingTotal: sum(upcoming) };
}

/** The next time each subscription charges, soonest first; lapsed ones are left out. */
export function nextCharges(items: RecurringCharge[], todayIso: string): DatedCharge[] {
  const today = day(todayIso);
  const horizon = new Date(today.getTime() + 400 * DAY_MS);
  return items
    .flatMap((item) => {
      const date = occurrencesBetween({ id: item.key, name: item.name, amount: item.amount, frequency: item.frequency, date: item.nextDate }, today, horizon)[0];
      return date ? [{ key: item.key, name: item.name, amount: item.amount, date }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

export type CostShare = { key: string; name: string; monthly: number; share: number };

/**
 * Each subscription's part of the monthly cost, biggest first. Past `top`,
 * the rest are folded into one "Everything else" entry (key "rest").
 */
export function costShares(items: RecurringCharge[], top = 5): CostShare[] {
  const monthly = items
    .map((i) => ({ key: i.key, name: i.name, monthly: i.amount * monthlyFactorForFrequency(i.frequency) }))
    .filter((i) => i.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);
  const total = monthly.reduce((s, i) => s + i.monthly, 0);
  if (total === 0) return [];
  const head = monthly.length > top + 1 ? monthly.slice(0, top) : monthly;
  const rest = monthly.slice(head.length).reduce((s, i) => s + i.monthly, 0);
  const shares = head.map((i) => ({ ...i, share: i.monthly / total }));
  if (rest > 0) shares.push({ key: "rest", name: `${monthly.length - head.length} more`, monthly: rest, share: rest / total });
  return shares;
}
