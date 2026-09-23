import { monthlyFactorForFrequency } from "@/lib/plaid-categories";
import { easternToday } from "@/lib/time";

// Pure, dependency-free so /subscriptions and /overview compute the same
// active/inactive split and monthly cost from one formula.

export type SubscriptionStream = {
  average_amount: number | null;
  frequency: string | null;
  is_active: boolean;
  user_marked_cancelled: boolean;
};

export function summarizeSubscriptions<T extends SubscriptionStream>(
  streams: T[]
): { active: T[]; inactive: T[]; monthlyTotal: number; annualTotal: number } {
  const active = streams
    .filter((s) => s.is_active && !s.user_marked_cancelled)
    .sort((a, b) => (b.average_amount ?? 0) - (a.average_amount ?? 0));

  // Plaid's own TOMBSTONED/etc. (is_active=false) and a manual cancel both
  // land here — the manual override is separate from Plaid's status per the
  // schema, but both mean "not a current cost" for this view.
  const inactive = streams.filter((s) => !s.is_active || s.user_marked_cancelled);

  const monthlyTotal = active.reduce(
    (sum, s) => sum + (s.average_amount ?? 0) * monthlyFactorForFrequency(s.frequency),
    0
  );

  return { active, inactive, monthlyTotal, annualTotal: monthlyTotal * 12 };
}

// >10% above the rolling average counts as a real increase, not just normal
// per-charge variance (tax, a slightly different billing date, etc.) —
// e.g. a Plaid-tracked average of $9.99 that just charged $12.99 (+30%)
// should flag; a $9.99 average that charged $10.49 (+5%) shouldn't.
const PRICE_INCREASE_THRESHOLD = 1.1;

/**
 * True when the most recent charge (last_amount) is meaningfully higher
 * than the rolling average Plaid has tracked for this stream — the data to
 * detect this (both fields) was already being stored, just never compared.
 */
export function hasPriceIncrease(averageAmount: number | null, lastAmount: number | null): boolean {
  if (averageAmount === null || lastAmount === null || averageAmount <= 0) return false;
  return lastAmount > averageAmount * PRICE_INCREASE_THRESHOLD;
}

// A week-plus past the predicted date is a real gap, not just Plaid's own
// prediction being a day or two off from the actual billing date (a
// monthly subscription billed on the 3rd one month and the 5th the next is
// normal jitter, not a lapse).
const LAPSED_THRESHOLD_DAYS = 10;

/**
 * True when a subscription's predicted next charge date is more than
 * LAPSED_THRESHOLD_DAYS in the past. For a Plaid-sourced stream this is
 * effectively "no new matching transaction has appeared since" — Plaid's
 * own recurring-transaction sync (syncItemRecurring) is what moves
 * predicted_next_date forward whenever a new matching charge lands, so a
 * predicted_next_date still stuck in the past means that hasn't happened.
 * Applies the same way to a manual subscription's next_billing_date, which
 * is just the user's own expectation of the next charge.
 */
// Truncates to that calendar day's midnight — both hasLapsed and
// isWithinNextDays below compare whole days, so a `referenceDate` carrying
// a time-of-day (the normal case, since both default to `new Date()`)
// must not shift the day-count by a fraction of a day near a boundary, and
// must not exclude "today" from isWithinNextDays just because "now" is
// later than midnight.
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function hasLapsed(predictedNextDate: string | null, referenceDate: Date = easternToday()): boolean {
  if (!predictedNextDate) return false;
  const predicted = new Date(`${predictedNextDate}T00:00:00`);
  const daysPast = (startOfDay(referenceDate).getTime() - predicted.getTime()) / (1000 * 60 * 60 * 24);
  return daysPast > LAPSED_THRESHOLD_DAYS;
}

/**
 * True when `date` falls within [today, today + days] inclusive — the
 * shared window check behind /overview's "Upcoming" preview. A date
 * already in the past (predicted-but-missed, see hasLapsed above) doesn't
 * count as upcoming.
 */
export function isWithinNextDays(
  date: string | null,
  days: number,
  referenceDate: Date = easternToday()
): boolean {
  if (!date) return false;
  const target = new Date(`${date}T00:00:00`);
  const daysUntil = (target.getTime() - startOfDay(referenceDate).getTime()) / (1000 * 60 * 60 * 24);
  return daysUntil >= 0 && daysUntil <= days;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// Preserves day-of-month across the step instead of drifting (Date's own
// setMonth would turn Jan 31 + 1 month into Mar 3 in a non-leap year) by
// clamping to the target month's actual length (Jan 31 + 1 month -> Feb 28).
function addMonths(d: Date, months: number): Date {
  const day = d.getDate();
  const firstOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const daysInTargetMonth = new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth() + 1,
    0
  ).getDate();
  firstOfTargetMonth.setDate(Math.min(day, daysInTargetMonth));
  return firstOfTargetMonth;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Safety cap on the roll-forward loop below — well beyond any realistic
// gap (weekly for ~19 years), just to guarantee termination if a stored
// date/frequency pair is somehow malformed.
const MAX_ROLL_FORWARD_STEPS = 1000;

/**
 * Rolls a stored next-charge date forward to the next occurrence on or
 * after `referenceDate`, stepping by the subscription's own billing
 * frequency. Both predicted_next_date (Plaid) and next_billing_date
 * (manual) are written once and only advanced when new data arrives (a
 * matching Plaid charge landing, or the user editing the manual entry) —
 * so once that date passes without new data (the normal case for most of
 * a billing cycle), it just reads as stale rather than as "still active,
 * still billing." This is a display-only projection: it never mutates the
 * stored date, and hasLapsed() above still compares against the raw
 * stored date to detect a real gap (no new charge for well past a period).
 */
export function projectNextOccurrence(
  date: string | null,
  frequency: string | null,
  referenceDate: Date = easternToday()
): string | null {
  if (!date) return null;
  let current = new Date(`${date}T00:00:00`);
  const today = startOfDay(referenceDate);
  if (current.getTime() >= today.getTime()) return date;

  for (let i = 0; i < MAX_ROLL_FORWARD_STEPS && current.getTime() < today.getTime(); i++) {
    switch (frequency) {
      case "WEEKLY":
        current = addDays(current, 7);
        break;
      case "BIWEEKLY":
        current = addDays(current, 14);
        break;
      case "SEMI_MONTHLY":
        current = addDays(current, 15);
        break;
      case "ANNUALLY":
        current = addMonths(current, 12);
        break;
      case "MONTHLY":
      default:
        current = addMonths(current, 1);
        break;
    }
  }
  return toDateString(current);
}
