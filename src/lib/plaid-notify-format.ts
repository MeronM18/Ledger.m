import type { Transaction as PlaidTransaction } from "plaid";
import { ALERT_THRESHOLDS } from "@/lib/config";
import { isSpendingCategory } from "@/lib/plaid-categories";
import { humanizeTransactionName } from "@/lib/transaction-display";

// Pure logic only — no server-only, no DB/network access — so this module
// can be unit tested directly (e.g. with `node --experimental-strip-types`)
// without needing Next.js's module resolution or a running Supabase/Plaid
// connection.

export function formatCurrency(amount: number, currency: string | null): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
  }).format(amount);
}

/**
 * Dedup decision. Plaid links a pending transaction to its settled version
 * one of two ways: either the same plaid_transaction_id transitions from
 * pending:true to pending:false in place (arrives as `modified`, which the
 * notification path never sees and which never touches notified_at, so
 * it's already deduped for free), or Plaid removes the pending transaction
 * and adds a *new* transaction_id with pending_transaction_id pointing back
 * at the old one (arrives in `added`). `previouslyNotifiedIds` — captured
 * by the caller before the sync's `removed` transactions are deleted —
 * covers that second case: if the incoming transaction's own id, or the
 * pending id it points back to, was already notified, it's a dup, not a
 * push.
 */
export function selectTransactionsToNotify(
  added: PlaidTransaction[],
  previouslyNotifiedIds: Set<string>
): { toPush: PlaidTransaction[]; deduped: PlaidTransaction[] } {
  const toPush: PlaidTransaction[] = [];
  const deduped: PlaidTransaction[] = [];

  for (const t of added) {
    const isSettleOfAlreadyNotified =
      previouslyNotifiedIds.has(t.transaction_id) ||
      (t.pending_transaction_id !== null && previouslyNotifiedIds.has(t.pending_transaction_id));
    (isSettleOfAlreadyNotified ? deduped : toPush).push(t);
  }

  return { toPush, deduped };
}

/** A single debit at or above the large-charge threshold. Money in never counts. */
export function isLargeCharge(t: PlaidTransaction, threshold: number = ALERT_THRESHOLDS.largeCharge): boolean {
  return t.amount >= threshold;
}

/**
 * Money back from a store, as the bank files it: a credit in a named
 * spending category. The refund alert (alerts-logic refundAlerts) says what
 * it's for once it posts.
 */
export function isStoreRefund(t: PlaidTransaction): boolean {
  const primary = t.personal_finance_category?.primary ?? null;
  return t.amount < 0 && primary !== null && primary !== "OTHER" && isSpendingCategory(primary);
}

/**
 * Message formatting. A settled amount/merchant that differs from what was
 * in the original pending push is not flagged here — the row is just
 * quietly updated; a "changed" notification isn't implemented (easy to add
 * if it turns out useful).
 */
export function formatTransactionNotification(
  t: PlaidTransaction,
  accountLabel: string,
  largeCharge: number = ALERT_THRESHOLDS.largeCharge
): { subtitle: string; body: string } {
  const merchant = humanizeTransactionName(t);
  const isDebit = t.amount >= 0; // Plaid: positive = money out, negative = money in
  const amountStr = formatCurrency(Math.abs(t.amount), t.iso_currency_code);

  const refund = isStoreRefund(t);
  let subtitle = isDebit ? `${amountStr} at ${merchant}` : `+${amountStr} from ${merchant}`;
  if (refund) subtitle = `Refund: ${subtitle}`;
  if (t.pending) subtitle = `Pending: ${subtitle}`;
  if (isLargeCharge(t, largeCharge)) subtitle = `Large charge: ${subtitle}`;
  const body = `${refund ? "Refund" : isDebit ? "Debit" : "Credit"} on ${accountLabel}`;

  return { subtitle, body };
}
