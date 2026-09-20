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
