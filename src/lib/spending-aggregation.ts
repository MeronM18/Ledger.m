import { categoryColorSlot, humanizeCategory, isSpendingCategory } from "@/lib/plaid-categories";

// Pure aggregation logic, no DB/network — kept separate from the page so the
// math can be exercised directly (e.g. with a quick script against real
// data) without needing a full Next.js render.

export type SpendingTransaction = {
  date: string; // YYYY-MM-DD
  amount: number; // Plaid convention: positive = money out, negative = money in
  pfc_primary: string | null;
  merchant_name: string | null;
  name: string | null;
  pending: boolean;
};

export type CategoryTotal = { category: string; label: string; amount: number; colorSlot: number };
export type MonthTotal = { month: string; label: string; amount: number };
export type MerchantTotal = { merchant: string; amount: number; count: number };
export type RefundEntry = {
  date: string;
  merchant: string;
  category: string;
  categoryLabel: string;
  amount: number; // positive dollar amount refunded (money back)
};

const OTHER_SLOT = 8;

/** Excludes pending transactions and non-spending categories (transfers, income, loan payments). */
export function filterSpendingTransactions(
  transactions: SpendingTransaction[]
): SpendingTransaction[] {
  return transactions.filter((t) => !t.pending && isSpendingCategory(t.pfc_primary));
}

/**
 * Category totals for one calendar month. Net amount per category (a refund
 * reduces its category's total — this is the economically correct "what did
 * I actually spend" figure); categories that net to zero or negative (fully
 * refunded) are dropped since a pie/donut can't show a non-positive slice.
 * Null/"OTHER" pfc_primary share one "Other" bucket. Sorted by the fixed
 * color-slot order (not by value) so pie adjacency matches the validated
 * palette ordering.
 *
 * Netting here is intentional, not silent: refundTransactions() below
 * surfaces every individual refund as its own visible line, so a refund's
 * effect on a total is always traceable, even though the total itself
 * stays net.
 */
export function categoryTotalsForMonth(
  transactions: SpendingTransaction[],
  year: number,
  month: number // 0-indexed, matches Date#getMonth()
): CategoryTotal[] {
  const totals = new Map<string, number>();

  for (const t of transactions) {
    const d = new Date(`${t.date}T00:00:00`);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const key = t.pfc_primary ?? "OTHER";
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }

  return Array.from(totals.entries())
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => ({
      category,
      label: humanizeCategory(category),
      amount,
      colorSlot: categoryColorSlot(category) ?? OTHER_SLOT,
    }))
    .sort((a, b) => a.colorSlot - b.colorSlot);
}

/** Net spend per calendar month across the full transaction list provided. */
export function monthlyTotals(transactions: SpendingTransaction[]): MonthTotal[] {
  const totals = new Map<string, number>();

  for (const t of transactions) {
    const key = t.date.slice(0, 7); // YYYY-MM
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }

  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({
      month,
      label: new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      }),
      amount,
    }));
}

/** Top merchants by net spend across the transaction list provided. */
export function topMerchants(transactions: SpendingTransaction[], limit = 10): MerchantTotal[] {
  const totals = new Map<string, { amount: number; count: number }>();

  for (const t of transactions) {
    const key = t.merchant_name ?? t.name ?? "Unknown";
    const entry = totals.get(key) ?? { amount: 0, count: 0 };
    entry.amount += t.amount;
    entry.count += 1;
    totals.set(key, entry);
  }

  return Array.from(totals.entries())
    .map(([merchant, { amount, count }]) => ({ merchant, amount, count }))
    .filter((m) => m.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/**
 * Every individual refund (a negative-amount transaction within an
 * otherwise-"spending" category — e.g. a merchant credit, a fee waiver, a
 * rewards redemption) as its own visible row, most recent first. This is
 * what keeps categoryTotalsForMonth/monthlyTotals/topMerchants' netting
 * honest: those totals fold a refund into the relevant total (correct for
 * "what did I actually spend"), and this list is where that reduction is
 * traceable back to a specific transaction instead of disappearing.
 */
export function refundTransactions(transactions: SpendingTransaction[]): RefundEntry[] {
  return transactions
    .filter((t) => t.amount < 0)
    .map((t) => ({
      date: t.date,
      merchant: t.merchant_name ?? t.name ?? "Unknown",
      category: t.pfc_primary ?? "OTHER",
      categoryLabel: humanizeCategory(t.pfc_primary),
      amount: Math.abs(t.amount),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
