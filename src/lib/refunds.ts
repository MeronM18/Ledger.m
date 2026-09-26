import { isSpendingCategory } from "@/lib/plaid-categories";
import type { SpendingTransaction } from "@/lib/spending-aggregation";
import { effectiveCategory, humanizeTransactionName } from "@/lib/transaction-display";

// Pure. Which purchase a refund gives money back for, and the month it
// counts in. A refund that comes back in a later month than its purchase is
// dated with the purchase, so the month you bought it nets to what you
// actually kept and the month it came back isn't made to look cheaper. The
// day it came back is kept, and shown.

export const REFUND_MATCH = {
  // How far back a refund's purchase can be (most stores take returns for 90 days).
  withinDays: 120,
};

/** Your answer for one refund: the purchase it's for, or "none" to count it on the day it came back. */
export type RefundChoice = string;
export type RefundChoices = Record<string, RefundChoice>;
export const NO_PURCHASE = "none";

export function resolveRefundChoices(stored: unknown): RefundChoices {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].length > 0));
}

type Tx = SpendingTransaction & {
  id: string;
  account: { id: string } | null;
  // The name the bank sent, before a rename.
  original_merchant_name?: string | null;
};

export type RefundLink = {
  purchaseId: string;
  purchaseDate: string;
  purchaseAmount: number;
  // You picked it, rather than it being found.
  chosen: boolean;
};

/** Money back from a store: a posted credit in a spending category. */
export function isRefund(t: SpendingTransaction): boolean {
  return t.amount < 0 && !t.pending && isSpendingCategory(effectiveCategory(t));
}

/** A posted purchase a refund could be for. */
export function isPurchase(t: SpendingTransaction): boolean {
  return t.amount > 0 && !t.pending && isSpendingCategory(effectiveCategory(t));
}

const DAY_MS = 86_400_000;
const dayOf = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const cents = (n: number) => Math.round(n * 100);

// The store, as the bank named it: in full, and by its first word ("amazon"
// in "Amazon Mktplace" and "Amazon.com"), which only an exact amount may go by.
function names(t: Tx): { full: string; first: string } {
  const name = humanizeTransactionName({ ...t, merchant_name: t.original_merchant_name ?? t.merchant_name }).toLowerCase();
  const first = name.split(/[^a-z0-9]+/).find((w) => w.length >= 3) ?? "";
  return { full: name.replace(/[^a-z0-9]/g, ""), first };
}

/** The day a refund came back: before it's dated with its purchase, its own date. */
export function cameBackOn(t: { date: string; refunded_on?: string | null }): string {
  return t.refunded_on ?? t.date;
}

/**
 * Each refund's purchase, by refund id. Found when a refund goes back to
 * the same account as a purchase at the same store in the REFUND_MATCH
 * days before it: the same amount (the latest such purchase), or, for part
 * of one, a purchase it fits in, as long as every purchase it could be is
 * in the same month. Anything less certain is left on its own day. Your
 * own choices come first; each purchase gives back no more than it cost.
 */
export function matchRefunds(transactions: Tx[], choices: RefundChoices = {}): Map<string, RefundLink> {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const left = new Map<string, number>();
  const purchasesByAccount = new Map<string, Tx[]>();
  for (const t of transactions) {
    if (!isPurchase(t) || !t.account) continue;
    left.set(t.id, cents(t.amount));
    const list = purchasesByAccount.get(t.account.id) ?? [];
    list.push(t);
    purchasesByAccount.set(t.account.id, list);
  }

  const links = new Map<string, RefundLink>();
  const link = (refund: Tx, purchase: Tx, chosen: boolean) => {
    left.set(purchase.id, (left.get(purchase.id) ?? cents(purchase.amount)) + cents(refund.amount));
    links.set(refund.id, { purchaseId: purchase.id, purchaseDate: purchase.date, purchaseAmount: purchase.amount, chosen });
  };

  const refunds = transactions.filter(isRefund).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  // Chosen ones first, so a found one never takes a purchase you've already given a refund to.
  for (const r of refunds) {
    const choice = choices[r.id];
    const purchase = choice && choice !== NO_PURCHASE ? byId.get(choice) : undefined;
    if (purchase && isPurchase(purchase) && purchase.date <= r.date) link(r, purchase, true);
  }

  for (const r of refunds) {
    // A purchase you picked that's gone (deleted, say) leaves it to be found again.
    if (choices[r.id] === NO_PURCHASE || links.has(r.id) || !r.account) continue;
    const back = cents(-r.amount);
    const store = names(r);
    const candidates = (purchasesByAccount.get(r.account.id) ?? []).filter((p) => {
      const age = dayOf(r.date) - dayOf(p.date);
      return age >= 0 && age <= REFUND_MATCH.withinDays && (left.get(p.id) ?? 0) >= back;
    });
    const latest = (list: Tx[]) => list.reduce<Tx | null>((best, p) => (!best || p.date > best.date || (p.date === best.date && p.id > best.id) ? p : best), null);

    const sameStore = candidates.filter((p) => names(p).full === store.full);
    const exact = latest(sameStore.filter((p) => cents(p.amount) === back)) ?? latest(candidates.filter((p) => cents(p.amount) === back && store.first !== "" && names(p).first === store.first));
    if (exact) {
      link(r, exact, false);
      continue;
    }
    // Part of a purchase: only when every purchase it could be falls in one month.
    const months = new Set(sameStore.map((p) => p.date.slice(0, 7)));
    const part = months.size === 1 ? latest(sameStore) : null;
    if (part) link(r, part, false);
  }
  return links;
}

export type RefundDating = {
  // The purchase this refund is for.
  refund_for?: RefundLink & { partial: boolean };
  // The day it came back, when it's dated with a purchase in an earlier month.
  refunded_on?: string | null;
  // You said it's for no purchase: it counts on the day it came back.
  refund_kept?: boolean;
  // On a purchase: how much of it came back in refunds.
  refunded?: number;
};

/**
 * Every transaction, with each refund marked with its purchase and, when
 * that was in an earlier month, dated with it, and each purchase with how
 * much of it came back. Statement periods still go by the day it posted.
 */
export function withRefundDates<T extends Tx>(transactions: T[], links: Map<string, RefundLink>, choices: RefundChoices = {}): (T & RefundDating)[] {
  const back = new Map<string, number>();
  for (const t of transactions) {
    const l = links.get(t.id);
    if (l) back.set(l.purchaseId, (back.get(l.purchaseId) ?? 0) + cents(-t.amount));
  }
  return transactions.map((t) => {
    if (back.has(t.id)) return { ...t, refunded: back.get(t.id)! / 100 };
    const l = links.get(t.id);
    if (!l) return choices[t.id] === NO_PURCHASE && isRefund(t) ? { ...t, refund_kept: true } : t;
    const refund_for = { ...l, partial: cents(-t.amount) < cents(l.purchaseAmount) };
    if (l.purchaseDate.slice(0, 7) === t.date.slice(0, 7)) return { ...t, refund_for };
    return { ...t, refund_for, date: l.purchaseDate, refunded_on: t.date, posted_date: t.posted_date ?? t.date };
  });
}

/**
 * Purchases you could say a refund is for, best first: the same store's on
 * the same account, then that account's others, from the REFUND_MATCH days
 * before it came back.
 */
export function purchasesForRefund<T extends Tx>(refund: T & RefundDating, transactions: T[], limit = 40): T[] {
  const back = cameBackOn(refund);
  const store = names(refund).full;
  return transactions
    .filter((p) => {
      if (!isPurchase(p) || p.id === refund.id) return false;
      if (refund.account ? p.account?.id !== refund.account.id : p.account !== null) return false;
      const age = dayOf(back) - dayOf(p.date);
      return age >= 0 && age <= REFUND_MATCH.withinDays;
    })
    .map((p) => ({ p, same: names(p).full === store }))
    .sort((a, b) => Number(b.same) - Number(a.same) || b.p.date.localeCompare(a.p.date))
    .slice(0, limit)
    .map(({ p }) => p);
}
