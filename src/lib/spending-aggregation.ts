import {
  categoryColorSlot,
  humanizeCategory,
  isSpendingCategory,
  OTHER_CATEGORY_COLOR_SLOT,
} from "@/lib/plaid-categories";
import { detectPayrollCompany, effectiveCategory, humanizeTransactionName } from "@/lib/transaction-display";

// Pure aggregation logic, no DB/network — kept separate from the page so the
// math can be exercised directly (e.g. with a quick script against real
// data) without needing a full Next.js render.

export type SpendingTransaction = {
  date: string; // YYYY-MM-DD
  amount: number; // Plaid convention: positive = money out, negative = money in
  pfc_primary: string | null;
  pfc_detailed?: string | null;
  category_override?: string | null;
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

export type ManualTransactionLike = {
  date: string;
  name: string;
  amount: number;
  pfc_primary: string;
};

/**
 * Normalizes a manual_transactions row into the exact same shape every
 * aggregation function below already operates on — this is the one and
 * only place that mapping happens, specifically so every page that needs
 * "Plaid + manual, aggregated together" merges the two sources the same
 * way rather than each computing its own version (the class of bug this
 * app already hit once with net worth).
 *
 * The manual name goes into merchant_name, not name: humanizeTransactionName
 * treats a populated merchant_name as already-clean and returns it as-is,
 * while `name` is what the messy-bank-descriptor heuristics (P2P transfer
 * detection, PAYROLL parsing) run against. A user-typed manual entry name
 * is already clean and its category was deliberately chosen from a
 * dropdown — it must never be silently reinterpreted or recategorized by
 * those heuristics the way a raw Plaid descriptor can be.
 */
export function manualTransactionToSpendingTransaction(m: ManualTransactionLike): SpendingTransaction {
  return {
    date: m.date,
    amount: m.amount,
    pfc_primary: m.pfc_primary,
    merchant_name: m.name,
    name: null,
    pending: false,
  };
}

const CREDIT_CARD_PAYMENT_DETAIL = "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT";

/**
 * True for a credit-card-payment transaction (Plaid's own
 * LOAN_PAYMENTS_CREDIT_CARD_PAYMENT detailed category — more reliable than
 * pattern-matching the raw name/merchant text) whose destination card is
 * NOT one of `connectedCardIssuers` (the institution names of connected
 * Plaid items that actually have a credit-type account — e.g. "Chase").
 *
 * A payment toward a connected card is correctly excluded from spending
 * elsewhere: that card's individual purchases already sync in and get
 * counted on their own, so counting the payment too would double-count
 * them. But a payment toward a card that ISN'T connected (Apple Card,
 * or a card processed under a generic biller name like "Cardmember
 * Service"/"Elan") has no other transactions syncing in anywhere — the
 * payment itself is the only signal that spending ever happened, so
 * excluding it the same way would make that card's spending invisible
 * entirely rather than double-counted.
 *
 * Matching is a case-insensitive substring check against the connected
 * issuer names, not a hardcoded card list — a real, connected item is
 * always named by *institution* ("Chase"), never by product name ("Apple
 * Card"), so this only fires for issuers actually linked here right now,
 * and needs no changes if a card is connected or disconnected later.
 */
export function isPaymentToUnconnectedCard(
  t: SpendingTransaction,
  connectedCardIssuers: string[]
): boolean {
  // A category the user picked by hand is a decision, not a guess: never
  // pull the payment back in as spending against it.
  if (t.category_override) return false;
  if (t.pfc_detailed !== CREDIT_CARD_PAYMENT_DETAIL) return false;
  const haystack = `${t.merchant_name ?? ""} ${t.name ?? ""}`.toLowerCase();
  return !connectedCardIssuers.some((issuer) => haystack.includes(issuer.toLowerCase()));
}

/**
 * The category grouping/filtering key for display purposes — folds the raw
 * "LOAN_PAYMENTS" carve-in bucket (see isPaymentToUnconnectedCard) into the
 * same "OTHER" bucket a genuinely uncategorized transaction (null
 * pfc_primary) already uses. Both mean the same thing to someone looking
 * at a category breakdown: "we don't actually know what this was for," so
 * they're one option/slice, not two confusingly similar ones. Used
 * anywhere a category needs to be grouped or matched against a filter
 * value for *spending* purposes — not for a raw per-transaction category
 * label (e.g. on /transactions), which should keep showing "Loan
 * Payments" as-is for what it actually is.
 */
export function displayCategoryKey(t: SpendingTransaction): string {
  const raw = effectiveCategory(t) ?? "OTHER";
  return raw === "LOAN_PAYMENTS" ? "OTHER" : raw;
}

/**
 * Excludes pending transactions and non-spending categories (transfers,
 * income, loan payments) — using each transaction's *effective* category
 * (transaction-display.ts's override layer, e.g. a PayPal transfer Plaid
 * mis-tagged as LOAN_DISBURSEMENTS still needs to be excluded correctly),
 * not just the raw pfc_primary, so this stays consistent with what the
 * display layer shows.
 *
 * One deliberate exception: a credit-card payment toward a card that ISN'T
 * one of `connectedCardIssuers` is pulled back IN as real spending — see
 * isPaymentToUnconnectedCard. This check runs BEFORE the pending check
 * (and bypasses it) — unlike an ordinary pending purchase, which will post
 * as itself and get counted once it does, this payment IS the only
 * transaction that will ever represent that card's spending. Waiting for
 * it to stop being pending would just mean waiting for it to disappear
 * from every spending total in the meantime, not eventually seeing it
 * counted correctly. `connectedCardIssuers` defaults to empty (the
 * pre-existing all-payments-excluded behavior) so every other caller of
 * this function keeps working unchanged until it opts in.
 */
export function filterSpendingTransactions(
  transactions: SpendingTransaction[],
  connectedCardIssuers: string[] = []
): SpendingTransaction[] {
  return transactions.filter((t) => {
    if (isPaymentToUnconnectedCard(t, connectedCardIssuers)) return true;
    if (t.pending) return false;
    return isSpendingCategory(effectiveCategory(t));
  });
}

/**
 * Category totals for one calendar month, or across the entire array when
 * `year`/`month` are omitted (an explicit "all time" mode, not an
 * accidental fallthrough — callers that want a specific month always pass
 * both). Net amount per category (a refund reduces its category's total —
 * this is the economically correct "what did I actually spend" figure);
 * categories that net to zero or negative (fully refunded) are dropped
 * since a pie/donut can't show a non-positive slice. Null/"OTHER"
 * pfc_primary share one "Other" bucket. Sorted by the fixed color-slot
 * order (not by value) so pie adjacency matches the validated palette
 * ordering.
 *
 * Netting here is intentional, not silent: refundTransactions() below
 * surfaces every individual refund as its own visible line, so a refund's
 * effect on a total is always traceable, even though the total itself
 * stays net.
 */
export function categoryTotalsForMonth(
  transactions: SpendingTransaction[],
  year?: number,
  month?: number // 0-indexed, matches Date#getMonth()
): CategoryTotal[] {
  const totals = new Map<string, number>();

  for (const t of transactions) {
    if (year !== undefined && month !== undefined) {
      const d = new Date(`${t.date}T00:00:00`);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    }
    // displayCategoryKey folds the LOAN_PAYMENTS carve-in bucket (Apple
    // Card, Elan, Cardmember Service, ...) into the same "OTHER" bucket a
    // genuinely uncategorized transaction uses — both mean "we don't know
    // what this was for," so they net together into one slice/row, not
    // two similarly-labeled ones a viewer would have to mentally combine
    // themselves.
    const key = displayCategoryKey(t);
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }

  return Array.from(totals.entries())
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => ({
      category,
      label: category === "OTHER" ? "Other" : humanizeCategory(category),
      amount,
      colorSlot: categoryColorSlot(category) ?? OTHER_CATEGORY_COLOR_SLOT,
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
    const key = humanizeTransactionName(t);
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
      merchant: humanizeTransactionName(t),
      category: effectiveCategory(t) ?? "OTHER",
      categoryLabel: humanizeCategory(effectiveCategory(t)),
      amount: Math.abs(t.amount),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// --- Income ---------------------------------------------------------------
//
// The mirror image of the spending functions above: everything up there
// exists specifically to EXCLUDE the INCOME category (filterSpendingTransactions
// drops it via isSpendingCategory); these two functions are the same class
// of "totals for one calendar month, grouped and summed" logic, just scoped
// TO that one excluded category instead of excluding it — same effectiveCategory
// resolution, same date-in-month check, same non-pending filter, so the two
// views can never silently disagree about which transactions belong to a
// given month. Money-in transactions are negative (Plaid convention), so
// amounts are negated here into the "$X received" figure the UI wants.

export type IncomeSourceTotal = { source: "Paycheck" | "Other income"; amount: number };
export type MonthlyIncomeVsSpending = { income: number; spending: number; net: number };

function isInCalendarMonth(dateStr: string, year: number, month: number): boolean {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.getFullYear() === year && d.getMonth() === month;
}

/**
 * Income for one calendar month, split into "Paycheck" (payroll detected
 * via the same detectPayrollCompany() heuristic humanizeTransactionName
 * already uses to render "X Paycheck") vs. everything else tagged INCOME
 * (a manual entry, a 1099 payment, a detected P2P transfer that landed in
 * INCOME, etc). Sorted largest first; zero/negative buckets dropped, same
 * convention as categoryTotalsForMonth.
 */
export function incomeBySourceForMonth(
  transactions: SpendingTransaction[],
  year: number,
  month: number
): IncomeSourceTotal[] {
  const totals = new Map<"Paycheck" | "Other income", number>();

  for (const t of transactions) {
    if (t.pending) continue;
    if (effectiveCategory(t) !== "INCOME") continue;
    if (!isInCalendarMonth(t.date, year, month)) continue;

    const source = detectPayrollCompany(t.name ?? "") ? "Paycheck" : "Other income";
    totals.set(source, (totals.get(source) ?? 0) - t.amount);
  }

  return Array.from(totals.entries())
    .map(([source, amount]) => ({ source, amount }))
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/** "$X in, $Y out, $Z net" for one calendar month. */
export function monthlyIncomeVsSpending(
  transactions: SpendingTransaction[],
  year: number,
  month: number,
  // Same meaning as in filterSpendingTransactions: a payment to a card that
  // isn't connected counts as spending. Without this the overview's income
  // card reported less spending than its own spending card beside it. Left
  // out, card payments are not counted, as before.
  connectedCardIssuers?: string[]
): MonthlyIncomeVsSpending {
  let income = 0;
  let spending = 0;

  for (const t of transactions) {
    if (!isInCalendarMonth(t.date, year, month)) continue;

    // Checked before the pending skip, exactly as filterSpendingTransactions
    // does: this payment is the only record that card's spending exists.
    if (connectedCardIssuers && isPaymentToUnconnectedCard(t, connectedCardIssuers)) {
      spending += t.amount;
      continue;
    }
    if (t.pending) continue;

    const category = effectiveCategory(t);
    if (category === "INCOME") {
      income += -t.amount;
    } else if (isSpendingCategory(category)) {
      spending += t.amount;
    }
  }

  return { income, spending, net: income - spending };
}
