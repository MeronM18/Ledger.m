import { countsAsSpending, displayCategoryKey, paidBackShare, type SpendingTransaction } from "@/lib/spending-aggregation";
import { postedDate } from "@/lib/transaction-dates";
import { effectiveCategory, isCardPaymentByName } from "@/lib/transaction-display";

// Pure. What a transaction is, in the terms the rest of the app counts it
// by: spending (and refunds against it), income, a credit card payment, or
// money moving between your own accounts. Transactions labels each row with
// it, and whether it counts as spending comes from the same test the
// Spending and Budgets totals use (countsAsSpending), so the three can't
// disagree about a row.

export type TransactionKind = "spending" | "refund" | "income" | "card-payment" | "transfer" | "loan-payment";

export type KindTx = SpendingTransaction & { id: string; account: { id: string } | null };

export type Described = {
  kind: TransactionKind;
  // Part of Spending and Budgets totals (a pending charge isn't yet).
  counts: boolean;
  // A card payment's other side: the card it paid, seen from the bank
  // account, or the account it came from, seen on the card. Null when the
  // other side isn't here (a card that isn't connected, say).
  counterpart: string | null;
};

const TRANSFERS = new Set(["TRANSFER_IN", "TRANSFER_OUT", "TRANSFER", "LOAN_DISBURSEMENTS"]);
// How a payment onto a card is filed: as a payment, or as money transferred in.
const CARD_CREDIT = new Set(["LOAN_PAYMENTS", "TRANSFER_IN", "TRANSFER"]);
// A payment's description naming a card, for one with no detailed category (a manual entry, or recategorized).
const CARD_NAME = /\b(card|crd|credit|amex|american express|applecard|apple card|discover)\b/i;

/** The kind of one transaction. `cardIds` are the credit card accounts. */
export function transactionKind(t: KindTx, cardIds: Set<string>): TransactionKind {
  const category = effectiveCategory(t);
  const onCard = t.account !== null && cardIds.has(t.account.id);
  if (onCard && t.amount < 0 && CARD_CREDIT.has(category ?? "")) return "card-payment";
  if (category === "LOAN_PAYMENTS") {
    if (t.amount < 0) return "transfer";
    // Plaid's detailed category only describes Plaid's own main category.
    const detailed = category === t.pfc_primary ? t.pfc_detailed : null;
    if (detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return "card-payment";
    if (detailed?.startsWith("LOAN_PAYMENTS_")) return "loan-payment";
    return isCardPaymentByName(t) || CARD_NAME.test(`${t.merchant_name ?? ""} ${t.name ?? ""}`) ? "card-payment" : "loan-payment";
  }
  if (category && TRANSFERS.has(category)) return "transfer";
  if (category === "INCOME") return "income";
  return t.amount < 0 ? "refund" : "spending";
}

const DAY_MS = 86_400_000;
const dayOf = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
// A payment lands on the card within a few days of leaving the bank.
const PAIR_DAYS = 5;

/**
 * Every transaction's kind, whether it counts as spending, and for card
 * payments the account on the other side: a payment out of a bank account
 * pairs with a payment onto one of your cards for the same amount within a
 * few days (the closest one, each used once).
 */
export function describeTransactions(transactions: KindTx[], cardIds: Set<string>, connectedCardIssuers: string[]): Map<string, Described> {
  const out = new Map<string, Described>();
  const credits = new Map<number, KindTx[]>();
  const payments: KindTx[] = [];
  for (const t of transactions) {
    const kind = transactionKind(t, cardIds);
    out.set(t.id, { kind, counts: countsAsSpending(t, connectedCardIssuers), counterpart: null });
    if (kind !== "card-payment" || !t.account) continue;
    const cents = Math.round(Math.abs(t.amount) * 100);
    if (cardIds.has(t.account.id) && t.amount < 0) {
      if (!credits.has(cents)) credits.set(cents, []);
      credits.get(cents)!.push(t);
    } else if (t.amount > 0) {
      payments.push(t);
    }
  }
  const used = new Set<string>();
  for (const p of payments) {
    const day = dayOf(postedDate(p));
    let best: { credit: KindTx; gap: number } | null = null;
    for (const c of credits.get(Math.round(p.amount * 100)) ?? []) {
      if (used.has(c.id) || c.account!.id === p.account!.id) continue;
      const gap = Math.abs(dayOf(postedDate(c)) - day);
      if (gap <= PAIR_DAYS && (best === null || gap < best.gap)) best = { credit: c, gap };
    }
    if (!best) continue;
    used.add(best.credit.id);
    out.get(p.id)!.counterpart = best.credit.account!.id;
    out.get(best.credit.id)!.counterpart = p.account!.id;
  }
  return out;
}

/** Whether a row belongs under a category filter: its own category, or the spending group it counts toward. */
export function inCategory(t: KindTx, filter: string, described: Described | undefined): boolean {
  if ((effectiveCategory(t) ?? "(uncategorized)") === filter) return true;
  // "Other" in Spending and Budgets also holds uncategorized spending and payments standing in for a card that isn't connected.
  return filter === "OTHER" && Boolean(described?.counts) && displayCategoryKey(t) === "OTHER";
}

/** The kinds a quick filter on Transactions shows. */
export type KindFilter = "all" | "spending" | "income" | "card-payment" | "transfer";

export function matchesKind(d: Described | undefined, filter: KindFilter): boolean {
  if (filter === "all" || !d) return true;
  if (filter === "spending") return d.kind === "spending" || d.kind === "refund" || d.counts;
  if (filter === "transfer") return d.kind === "transfer" || d.kind === "loan-payment";
  return d.kind === filter;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export type KindSummary = {
  // What counts toward Spending and Budgets, net of refunds and paid-back shares.
  spending: number;
  refunds: number;
  income: number;
  // Paid to cards from bank accounts (or, with none of those listed, onto the cards).
  cardPayments: { count: number; amount: number };
  transfers: number;
  largestExpense: number | null;
  averageExpense: number | null;
};

/** The Summary beside the list, by kind: spending as Spending counts it, and the rest apart from it. */
export function kindSummary(rows: KindTx[], described: Map<string, Described>): KindSummary {
  let spending = 0;
  let refunds = 0;
  let income = 0;
  let transfers = 0;
  const fromBank = { count: 0, amount: 0 };
  const onCards = { count: 0, amount: 0 };
  const charges: number[] = [];
  for (const t of rows) {
    const d = described.get(t.id);
    if (!d) continue;
    if (d.counts) spending += t.amount - paidBackShare(t);
    if (d.kind === "refund" && !t.pending) refunds -= t.amount;
    if (d.kind === "spending" && !t.pending) charges.push(t.amount - paidBackShare(t));
    if (d.kind === "income" && !t.pending) income -= t.amount;
    if (d.kind === "transfer" || d.kind === "loan-payment") transfers++;
    if (d.kind === "card-payment") {
      const side = t.amount > 0 ? fromBank : onCards;
      side.count++;
      side.amount += Math.abs(t.amount);
    }
  }
  const paid = fromBank.count > 0 ? fromBank : onCards;
  const total = charges.reduce((s, c) => s + c, 0);
  return {
    spending: cents(spending),
    refunds: cents(refunds),
    income: cents(income),
    cardPayments: { count: paid.count, amount: cents(paid.amount) },
    transfers,
    largestExpense: charges.length > 0 ? cents(Math.max(...charges)) : null,
    averageExpense: charges.length > 0 ? cents(total / charges.length) : null,
  };
}
