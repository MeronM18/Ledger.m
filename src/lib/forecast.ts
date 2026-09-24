import { monthlyFactorForFrequency } from "@/lib/plaid-categories";
import type { SpendingTransaction } from "@/lib/spending-aggregation";
import {
  hasLapsed,
  projectNextOccurrence,
  stepDate,
  toDateString,
} from "@/lib/subscriptions-aggregation";

// Pure, dependency-free. Answers "how much can I spend before I get paid,
// and will my balance dip along the way?" from checking/savings cash, the
// bills and paychecks the bank connection (plus manual entries) says are
// coming, and how much you typically spend on top of those.
//
// Deliberate simplifications, all surfaced in the UI rather than hidden:
// - Only checking cash counts. Everything owed on credit cards is deducted,
//   as if each card is paid in full on its due date (a card with no known
//   due date as if due now), so spending already on a card isn't counted
//   as money still free to spend.
// - A bill or paycheck whose last-known date lapsed (nothing new landed
//   well past it) is left out: it may have stopped, and reserving cash for
//   it, or counting on it, would mislead.
// - "Typical spending" is the trailing 30 days minus the recurring bills'
//   monthly total, so bills aren't counted twice.

export type RecurringItem = {
  id: string;
  name: string;
  amount: number; // always positive; the caller says whether it's a bill or income
  frequency: string | null;
  date: string | null; // stored predicted_next_date / next_billing_date
};

export type ForecastEvent = { date: string; name: string; amount: number; kind: "bill" | "card" | "income" };

/** What's owed on one card, and when it's due (null: not known, treated as due now). */
export type CardPayment = { name: string; amount: number; date: string | null };

export type ForecastPoint = {
  date: string;
  day: number;
  // Cash after only the known bills and paychecks.
  committed: number;
  // Same, minus typical day-to-day spending as days go by.
  expected: number;
};

export type Forecast = {
  cash: number;
  points: ForecastPoint[];
  events: ForecastEvent[];
  nextIncome: { date: string; name: string; amount: number } | null;
  // Days from today to that paycheck, or the fallback horizon when none is known.
  daysToPayday: number;
  billsBeforePayday: number;
  // Everything owed on credit cards, whenever it's due.
  cardBalances: number;
  safeToSpend: number; // can be negative
  perDay: number | null;
  typicalDailySpend: number | null;
  // Spending the rest of the way to payday at the typical pace, beyond what's safe.
  projectedShortfall: number;
  lowPoint: { date: string; balance: number } | null;
  // First day the expected balance is under the threshold, if any.
  firstBelowThreshold: { date: string; balance: number } | null;
};

export const NO_INCOME_HORIZON_DAYS = 14;
const DAY_MS = 86_400_000;

function isoOf(d: Date): string {
  return toDateString(d);
}

function dayDiff(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime()) / DAY_MS);
}

/** Every date `item` lands on from `today` through `end` (inclusive). Lapsed items yield none. */
export function occurrencesBetween(item: RecurringItem, today: Date, end: Date): string[] {
  if (hasLapsed(item.date, today)) return [];
  const first = projectNextOccurrence(item.date, item.frequency, today);
  if (!first) return [];

  const dates: string[] = [];
  const endIso = isoOf(end);
  let cursor = new Date(`${first}T00:00:00`);
  // A safety cap; a weekly item over 60 days is ~9 hits.
  for (let i = 0; i < 400 && isoOf(cursor) <= endIso; i++) {
    dates.push(isoOf(cursor));
    cursor = stepDate(cursor, item.frequency);
  }
  return dates;
}

/**
 * Average daily spend on things that aren't recurring bills: the last 30
 * days of net spending, minus the monthly total of the bills, over the days
 * of history actually available (capped at 30). Null with under a week of
 * history, when a pace would just be noise.
 */
export function typicalDailySpend(
  transactions: SpendingTransaction[],
  todayIso: string,
  bills: RecurringItem[]
): number | null {
  if (transactions.length === 0) return null;

  const first = transactions.reduce((min, t) => (t.date < min ? t.date : min), transactions[0].date);
  const historyDays = Math.min(30, dayDiff(first, todayIso));
  if (historyDays < 7) return null;

  const windowStart = isoOf(new Date(new Date(`${todayIso}T00:00:00`).getTime() - 30 * DAY_MS));
  const spent = transactions
    .filter((t) => t.date > windowStart && t.date <= todayIso)
    .reduce((sum, t) => sum + t.amount, 0);

  const activeBills = bills.filter((b) => !hasLapsed(b.date, new Date(`${todayIso}T00:00:00`)));
  const billsPer30Days = activeBills.reduce((sum, b) => sum + b.amount * monthlyFactorForFrequency(b.frequency), 0);
  const scaledBills = billsPer30Days * (historyDays / 30);

  return Math.max(0, spent - scaledBills) / historyDays;
}

/**
 * The next date a card with payment due on `dueDay` is due, on or after
 * today: this month if that day hasn't passed, else next month. A day past
 * the end of a short month is its last day (31 means month-end).
 */
export function nextDueDate(todayIso: string, dueDay: number): string {
  const [y, m, d] = todayIso.split("-").map(Number);
  const inMonth = (year: number, month0: number) => {
    const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
    const day = Math.min(dueDay, last);
    return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const thisMonth = inMonth(y, m - 1);
  if (Number(thisMonth.slice(8)) >= d) return thisMonth;
  return m === 12 ? inMonth(y + 1, 0) : inMonth(y, m);
}

export function buildForecast(input: {
  cash: number;
  today: Date; // local midnight of today's Eastern date
  bills: RecurringItem[];
  income: RecurringItem[];
  typicalDailySpend: number | null;
  lowBalanceThreshold: number;
  horizonDays?: number;
  cardPayments?: CardPayment[];
}): Forecast {
  const { cash, today, bills, income, lowBalanceThreshold } = input;
  const cards = (input.cardPayments ?? []).filter((c) => c.amount > 0);
  const horizon = input.horizonDays ?? 30;
  const todayIso = isoOf(today);
  const end = new Date(today.getTime() + horizon * DAY_MS);

  const events: ForecastEvent[] = [
    ...bills.flatMap((b) =>
      occurrencesBetween(b, today, end).map((date) => ({ date, name: b.name, amount: b.amount, kind: "bill" as const }))
    ),
    ...income.flatMap((i) =>
      occurrencesBetween(i, today, end).map((date) => ({ date, name: i.name, amount: i.amount, kind: "income" as const }))
    ),
    // Each card paid in full on its due date: today if that's not known (or
    // already past), the end of the window if it's later than that.
    ...cards.map((c) => {
      const endIso = isoOf(end);
      const date = !c.date || c.date < todayIso ? todayIso : c.date > endIso ? endIso : c.date;
      return { date, name: `${c.name} payment`, amount: c.amount, kind: "card" as const };
    }),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));

  const daily = input.typicalDailySpend ?? 0;
  const points: ForecastPoint[] = [];
  let committed = cash;
  for (let day = 0; day <= horizon; day++) {
    const date = isoOf(new Date(today.getTime() + day * DAY_MS));
    for (const e of events) {
      if (e.date === date) committed += e.kind === "income" ? e.amount : -e.amount;
    }
    points.push({ date, day, committed, expected: committed - daily * day });
  }

  // The paycheck we're counting down to: the first income strictly after
  // today (one dated today has likely already landed in the balance).
  const upcomingIncome = events.find((e) => e.kind === "income" && e.date > todayIso) ?? null;
  const nextIncome = upcomingIncome
    ? { date: upcomingIncome.date, name: upcomingIncome.name, amount: upcomingIncome.amount }
    : null;

  const daysToPayday = nextIncome ? dayDiff(todayIso, nextIncome.date) : NO_INCOME_HORIZON_DAYS;
  const cutoff = nextIncome ? nextIncome.date : isoOf(new Date(today.getTime() + NO_INCOME_HORIZON_DAYS * DAY_MS));

  // Bills up to (not including) payday: money arriving that day covers
  // that day's charges, but a bill the day before must already be reserved.
  const billsBeforePayday = events
    .filter((e) => e.kind === "bill" && e.date < cutoff)
    .reduce((sum, e) => sum + e.amount, 0);

  // Card balances come off in full whenever they're due: that money is
  // already spent, even if it hasn't left checking yet.
  const cardBalances = cards.reduce((sum, c) => sum + c.amount, 0);
  const safeToSpend = cash - billsBeforePayday - cardBalances;
  const perDay = daysToPayday > 0 ? safeToSpend / daysToPayday : null;
  const projectedShortfall =
    input.typicalDailySpend !== null ? Math.max(0, input.typicalDailySpend * daysToPayday - safeToSpend) : 0;

  const lowest = points.reduce((min, p) => (p.expected < min.expected ? p : min), points[0]);
  const below = points.find((p) => p.expected < lowBalanceThreshold) ?? null;

  return {
    cash,
    points,
    events,
    nextIncome,
    daysToPayday,
    billsBeforePayday,
    cardBalances,
    safeToSpend,
    perDay,
    typicalDailySpend: input.typicalDailySpend,
    projectedShortfall,
    lowPoint: lowest ? { date: lowest.date, balance: lowest.expected } : null,
    firstBelowThreshold: below ? { date: below.date, balance: below.expected } : null,
  };
}
