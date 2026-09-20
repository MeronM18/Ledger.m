import { monthlyFactorForFrequency } from "@/lib/plaid-categories";

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
export function hasLapsed(predictedNextDate: string | null, referenceDate: Date = new Date()): boolean {
  if (!predictedNextDate) return false;
  const predicted = new Date(`${predictedNextDate}T00:00:00`);
  const daysPast = (referenceDate.getTime() - predicted.getTime()) / (1000 * 60 * 60 * 24);
  return daysPast > LAPSED_THRESHOLD_DAYS;
}
