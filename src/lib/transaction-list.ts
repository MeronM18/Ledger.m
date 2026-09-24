import { effectiveCategory, humanizeTransactionName, isCardPaymentByName, type DisplayableTransaction } from "@/lib/transaction-display";

// Pure. The Filters menu on Transactions: how the list is sorted, and
// what's left out of it, on top of the search, account, category and month
// filters in the bar.

export type ListSort = "newest" | "oldest" | "amount-desc" | "amount-asc" | "merchant";

export type ListOptions = {
  sort: ListSort;
  direction: "all" | "out" | "in";
  status: "all" | "posted" | "pending";
  // Dollars, by size whichever way the money went; null for no limit.
  minAmount: number | null;
  maxAmount: number | null;
  // Leave out money only moving between your own accounts.
  hideTransfers: boolean;
  onlyWithNotes: boolean;
};

export const DEFAULT_LIST_OPTIONS: ListOptions = {
  sort: "newest",
  direction: "all",
  status: "all",
  minAmount: null,
  maxAmount: null,
  hideTransfers: false,
  onlyWithNotes: false,
};

export const SORT_LABELS: Record<ListSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "amount-desc": "Amount: high to low",
  "amount-asc": "Amount: low to high",
  merchant: "Merchant: A to Z",
};

export type ListTransaction = DisplayableTransaction & {
  id: string;
  date: string;
  pending: boolean;
  pfc_detailed?: string | null;
  notes?: string | null;
  manualSource?: { notes?: string | null };
};

const TRANSFER_CATEGORIES = new Set(["TRANSFER_IN", "TRANSFER_OUT", "TRANSFER"]);

/** A transfer between your own accounts, or a credit card payment from either side. */
export function isMoneyMovement(t: ListTransaction): boolean {
  const category = effectiveCategory(t);
  if (category && TRANSFER_CATEGORIES.has(category)) return true;
  if (category !== "LOAN_PAYMENTS") return false;
  return t.pfc_detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" || isCardPaymentByName(t);
}

/** How many settings differ from the defaults (sorting aside), for the count on the button. */
export function activeFilterCount(o: ListOptions): number {
  return [
    o.direction !== "all",
    o.status !== "all",
    o.minAmount !== null || o.maxAmount !== null,
    o.hideTransfers,
    o.onlyWithNotes,
  ].filter(Boolean).length;
}

const hasNotes = (t: ListTransaction) => Boolean((t.notes ?? t.manualSource?.notes ?? "").trim());

export function applyListOptions<T extends ListTransaction>(rows: T[], o: ListOptions): T[] {
  const kept = rows.filter((t) => {
    // Plaid's sign: positive is money out.
    if (o.direction === "out" && t.amount <= 0) return false;
    if (o.direction === "in" && t.amount >= 0) return false;
    if (o.status === "posted" && t.pending) return false;
    if (o.status === "pending" && !t.pending) return false;
    const size = Math.abs(t.amount);
    if (o.minAmount !== null && size < o.minAmount) return false;
    if (o.maxAmount !== null && size > o.maxAmount) return false;
    if (o.hideTransfers && isMoneyMovement(t)) return false;
    if (o.onlyWithNotes && !hasNotes(t)) return false;
    return true;
  });

  // Ties fall back to newest first, then id, so the order never jumps around.
  const newest = (a: T, b: T) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
  const compare: Record<ListSort, (a: T, b: T) => number> = {
    newest,
    oldest: (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    "amount-desc": (a, b) => Math.abs(b.amount) - Math.abs(a.amount) || newest(a, b),
    "amount-asc": (a, b) => Math.abs(a.amount) - Math.abs(b.amount) || newest(a, b),
    merchant: (a, b) =>
      humanizeTransactionName(a).localeCompare(humanizeTransactionName(b), "en", { sensitivity: "base" }) || newest(a, b),
  };
  return kept.sort(compare[o.sort]);
}

/** Totals for the list as shown. */
export function listTotals(rows: { amount: number }[]): { count: number; out: number; in: number } {
  let out = 0;
  let inflow = 0;
  for (const t of rows) {
    if (t.amount > 0) out += t.amount;
    else inflow -= t.amount;
  }
  return { count: rows.length, out: Math.round(out * 100) / 100, in: Math.round(inflow * 100) / 100 };
}
