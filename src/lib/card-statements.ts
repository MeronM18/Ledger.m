import type { SpendingTransaction } from "@/lib/spending-aggregation";
import { effectiveCategory } from "@/lib/transaction-display";

// Pure. Which purchases a credit card payment paid for.
//
// A card bills by statement: everything from the day after one statement
// closes through the day the next one closes. A payment pays the statement
// that most recently closed before it, however early or late it's made, so
// knowing the day each card's statement closes is enough to line payments
// up with purchases. That day comes from (best first) what you set, the day
// that best explains your past payments, or an estimate from the due date.

export type CardTx = SpendingTransaction & { id: string; account: { id: string } | null };

export type Card = {
  id: string; // the ledger account id ("manual:<id>" for Apple Card)
  name: string;
  closeDay: number | null; // set by you
  dueDay: number | null; // set by you
  // Apple Card's statements always run through the end of the month.
  closesAtMonthEnd?: boolean;
};

export type CloseDaySource = "set" | "month-end" | "payments" | "due-date";

const DAY_MS = 86_400_000;
const toDay = (iso: string) => Math.round(new Date(`${iso}T00:00:00Z`).getTime() / DAY_MS);
const toIso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const cents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

function daysIn(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** The close date in a given month: day 31 in a 30-day month is the 30th. */
function closeIn(year: number, month0: number, closeDay: number): string {
  const d = Math.min(closeDay, daysIn(year, month0));
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The statement a payment on `paymentIso` pays: the one that closed most recently before that day. */
export function statementBefore(paymentIso: string, closeDay: number): { start: string; end: string; nextEnd: string } {
  let y = Number(paymentIso.slice(0, 4));
  let m = Number(paymentIso.slice(5, 7)) - 1;
  let end = closeIn(y, m, closeDay);
  if (end >= paymentIso) {
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    end = closeIn(y, m, closeDay);
  }
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  const nextM = m === 11 ? 0 : m + 1;
  const nextY = m === 11 ? y + 1 : y;
  return {
    start: toIso(toDay(closeIn(prevY, prevM, closeDay)) + 1),
    end,
    nextEnd: closeIn(nextY, nextM, closeDay),
  };
}

const PAYMENT_CATEGORIES = new Set(["LOAN_PAYMENTS", "TRANSFER_IN", "TRANSFER"]);

/** A payment as the card sees it: money onto the card, filed as a payment or transfer. */
export function isCardPaymentCredit(t: SpendingTransaction): boolean {
  return t.amount < 0 && !t.pending && PAYMENT_CATEGORIES.has(effectiveCategory(t) ?? "");
}

/** A payment as the bank account it came from sees it. */
export function isCardPaymentFromBank(t: SpendingTransaction): boolean {
  return t.amount > 0 && (t.pfc_detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" || effectiveCategory(t) === "LOAN_PAYMENTS");
}

/** Chase closes a statement about 25 days before it's due: due the 28th, closes about the 3rd. */
export function closeDayFromDueDay(dueDay: number): number {
  const d = dueDay + 6;
  return d > 31 ? d - 31 : d;
}

function statementTotal(cardTxs: CardTx[], start: string, end: string): number {
  return cardTxs
    .filter((t) => t.date >= start && t.date <= end && !isCardPaymentCredit(t) && !t.pending)
    .reduce((s, t) => s + t.amount, 0);
}

/**
 * The closing day that best explains past payments: for each day of the
 * month, how closely each payment matches the statement it would have paid.
 * Null without at least three payments, or when no day fits well (partial
 * payments, or too little history). When several days fit equally (no
 * purchases fall between them), `hint` breaks the tie if it's one of them.
 */
export function estimateCloseDay(cardTxs: CardTx[], hint: number | null = null): number | null {
  const payments = cardTxs.filter(isCardPaymentCredit).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  if (payments.length < 3) return null;
  const scores: { day: number; score: number }[] = [];
  for (let day = 1; day <= 31; day++) {
    let score = 0;
    for (const p of payments) {
      const { start, end } = statementBefore(p.date, day);
      const total = statementTotal(cardTxs, start, end);
      score += Math.min(Math.abs(total - -p.amount) / -p.amount, 1);
    }
    scores.push({ day, score: score / payments.length });
  }
  const bestScore = Math.min(...scores.map((s) => s.score));
  if (bestScore > 0.1) return null;
  const tied = scores.filter((s) => s.score <= bestScore + 1e-9).map((s) => s.day);
  return hint !== null && tied.includes(hint) ? hint : tied[0];
}

/** The closing day to use for a card, and where it came from, or null when there's no way to tell. */
export function closeDayFor(card: Card, cardTxs: CardTx[]): { day: number; source: CloseDaySource } | null {
  if (card.closesAtMonthEnd) return { day: 31, source: "month-end" };
  if (card.closeDay) return { day: card.closeDay, source: "set" };
  const estimated = estimateCloseDay(cardTxs, card.dueDay ? closeDayFromDueDay(card.dueDay) : null);
  if (estimated) return { day: estimated, source: "payments" };
  if (card.dueDay) return { day: closeDayFromDueDay(card.dueDay), source: "due-date" };
  return null;
}

/**
 * The card a payment from a bank account went to: a payment onto one of
 * your cards for the same amount within a few days. Several cards at one
 * bank (two Chase cards) can't be told apart by the bank-side description,
 * so the amount and date are what decide.
 */
export function cardForBankPayment(payment: CardTx, cards: Card[], transactions: CardTx[]): { card: Card; credit: CardTx } | null {
  const cardIds = new Set(cards.map((c) => c.id));
  const amount = cents(payment.amount);
  let best: { card: Card; credit: CardTx; gap: number } | null = null;
  for (const t of transactions) {
    if (!t.account || !cardIds.has(t.account.id) || !isCardPaymentCredit(t)) continue;
    if (cents(-t.amount) !== amount) continue;
    const gap = Math.abs(toDay(t.date) - toDay(payment.date));
    if (gap > 5) continue;
    if (best === null || gap < best.gap) best = { card: cards.find((c) => c.id === t.account!.id)!, credit: t, gap };
  }
  return best ? { card: best.card, credit: best.credit } : null;
}

export type StatementBreakdown = {
  card: Card;
  closeDay: number;
  closeDaySource: CloseDaySource;
  start: string;
  end: string;
  // The statement's purchases, refunds, fees and interest, newest first.
  charges: CardTx[];
  total: number;
  // Charges netted by category (refunds included), largest first.
  byCategory: { category: string | null; amount: number }[];
  // Every payment made toward this statement (after it closed, before the next one did).
  payments: CardTx[];
  paid: number;
};

function netByCategory(charges: CardTx[]): { category: string | null; amount: number }[] {
  const sums = new Map<string | null, number>();
  for (const t of charges) {
    const c = effectiveCategory(t);
    sums.set(c, (sums.get(c) ?? 0) + t.amount);
  }
  return [...sums]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * What a payment paid for. `paymentDate` is the day the card received it
 * (for a payment seen from the bank side, the matching card-side credit's
 * date when there is one). `clicked` is the payment itself: it counts
 * toward the statement even when the card's copy of it hasn't synced (or
 * the card's copy was never recognized as a payment).
 */
export function breakdownForPayment(card: Card, paymentDate: string, transactions: CardTx[], clicked?: CardTx): StatementBreakdown | null {
  const cardTxs = transactions.filter((t) => t.account?.id === card.id);
  const close = closeDayFor(card, cardTxs);
  if (!close) return null;
  const { start, end, nextEnd } = statementBefore(paymentDate, close.day);
  const charges = cardTxs
    .filter((t) => t.date >= start && t.date <= end && !isCardPaymentCredit(t) && !t.pending)
    .sort((a, b) => b.date.localeCompare(a.date));
  const payments = cardTxs.filter((t) => isCardPaymentCredit(t) && t.date > end && t.date <= nextEnd);
  if (clicked && clicked.account?.id !== card.id) {
    const landed = payments.some(
      (p) => cents(-p.amount) === cents(clicked.amount) && Math.abs(toDay(p.date) - toDay(clicked.date)) <= 5
    );
    if (!landed) payments.push({ ...clicked, amount: -Math.abs(clicked.amount) });
  }
  payments.sort((a, b) => a.date.localeCompare(b.date));
  return {
    card,
    closeDay: close.day,
    closeDaySource: close.source,
    start,
    end,
    charges,
    total: round2(charges.reduce((s, t) => s + t.amount, 0)),
    byCategory: netByCategory(charges),
    payments,
    paid: round2(payments.reduce((s, t) => s - t.amount, 0)),
  };
}
