import type { Alert } from "@/lib/alerts-logic";
import { formatCurrency } from "@/lib/format";
import { incomeKind, isInterest } from "@/lib/income";
import { isSpendingCategory } from "@/lib/plaid-categories";
import { countsAsSpending, type SpendingTransaction } from "@/lib/spending-aggregation";
import { effectiveCategory, humanizeTransactionName } from "@/lib/transaction-display";

// Pure. Money that lands in a bank account and isn't a paycheck or interest
// (a Zelle or Venmo transfer, a check, a cash deposit) could be income,
// someone paying you back, or your own money moving. The bank can't tell,
// so each one is asked about once, and the answer decides how it counts.

/** How long a deposit waits to be asked about. Older ones are left as they are. */
export const REVIEW_WINDOW_DAYS = 45;
// Only deposits this recent send a push; older ones just wait on the Overview.
const ALERT_WITHIN_DAYS = 5;
// A transfer between your own accounts: the same amount out of one within this many days.
const TRANSFER_PAIR_DAYS = 3;
// How far back a charge can be for someone to be paying it back.
export const CHARGE_LOOKBACK_DAYS = 60;

export type DepositAnswer = "income" | "paid-back" | "paid-back-cash" | "own-money";

/** One part of a deposit and what was done for it, kept so it can be undone exactly. */
export type ReviewPart = {
  answer: DepositAnswer;
  amount: number;
  // What it was, as it reads in the list of reviewed deposits ("Kroger").
  label?: string;
  // Own money: from cash (the Cash asset went down) or another account.
  from?: "cash" | "account";
  // The charge it paid back, and how much of the charge that covered.
  charge?: { id: string; manual: boolean; applied: number };
  // The cash purchase it paid back, recorded by hand.
  purchaseId?: string;
  // How much the Cash asset moved.
  cashDelta?: number;
};

/** What a deposit was said to be: one part, or several adding up to it. */
export type DepositReview = {
  // The deposit, as money in.
  amount: number;
  at: string;
  // The deposit's own category before the answer (null: none set by hand).
  previousCategory: string | null;
  parts: ReviewPart[];
};

export type DepositReviews = Record<string, DepositReview>;

const ANSWERS = new Set<DepositAnswer>(["income", "paid-back", "paid-back-cash", "own-money"]);

function resolvePart(raw: unknown): ReviewPart | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!ANSWERS.has(r.answer as DepositAnswer) || typeof r.amount !== "number") return null;
  const part: ReviewPart = { answer: r.answer as DepositAnswer, amount: r.amount };
  if (typeof r.label === "string") part.label = r.label;
  if (r.from === "cash" || r.from === "account") part.from = r.from;
  const c = r.charge as Record<string, unknown> | undefined;
  if (c && typeof c.id === "string" && typeof c.applied === "number") part.charge = { id: c.id, manual: c.manual === true, applied: c.applied };
  if (typeof r.purchaseId === "string") part.purchaseId = r.purchaseId;
  if (typeof r.cashDelta === "number") part.cashDelta = r.cashDelta;
  return part;
}

/**
 * Stored answers (possibly partial or malformed), the good ones kept. An
 * answer saved before deposits could be split is one part of all of it.
 */
export function resolveDepositReviews(stored: unknown): DepositReviews {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  const out: DepositReviews = {};
  for (const [id, raw] of Object.entries(stored as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.amount !== "number") continue;
    const parts = Array.isArray(r.parts) ? r.parts.map(resolvePart).filter((p): p is ReviewPart => p !== null) : [resolvePart(r)].filter((p): p is ReviewPart => p !== null);
    if (parts.length === 0) continue;
    // Before own money said where it came from, only cash moved the Cash asset.
    for (const p of parts) if (p.answer === "own-money" && !p.from) p.from = p.cashDelta ? "cash" : "account";
    out[id] = {
      amount: r.amount,
      at: typeof r.at === "string" ? r.at : "",
      previousCategory: typeof r.previousCategory === "string" ? r.previousCategory : null,
      parts,
    };
  }
  return out;
}

/** How much of a reviewed deposit was income. */
export function incomeOf(review: DepositReview): number {
  return Math.round(review.parts.reduce((s, p) => s + (p.answer === "income" ? p.amount : 0), 0) * 100) / 100;
}

/** A part in a few words: "Income", "Paid back · Kroger", "From my cash". */
export function partLabel(p: ReviewPart): string {
  switch (p.answer) {
    case "income":
      return "Income";
    case "own-money":
      return p.from === "cash" ? "From my cash" : "From my other account";
    case "paid-back":
      return p.label ? `Paid back · ${p.label}` : "Paid back";
    case "paid-back-cash":
      return p.label ? `Paid back · ${p.label} (cash)` : "Paid back, cash purchase";
  }
}

/** A reviewed deposit's answer on one line: "$100.00 from my cash · $50.00 income" for a split one. */
export function reviewSummary(review: DepositReview, currency = "USD"): string {
  if (review.parts.length === 1) return partLabel(review.parts[0]);
  return review.parts.map((p) => `${formatCurrency(p.amount, currency)} ${partLabel(p).replace(/^[A-Z]/, (c) => c.toLowerCase())}`).join(" · ");
}

export type ReviewableTx = SpendingTransaction & {
  id: string;
  isManual: boolean;
  account: { id: string; name: string; mask: string | null } | null;
};

export type DepositToReview = {
  id: string;
  date: string;
  amount: number; // money in, positive
  name: string; // "Zelle Transfer"
  // The bank's own description, which usually names who sent it.
  detail: string | null;
  account: { id: string; name: string; mask: string | null } | null;
  pending: boolean;
};

const DAY_MS = 86_400_000;
const dayOf = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** A paycheck or interest: income the bank already describes, never asked about. */
export function isPayOrInterest(t: SpendingTransaction): boolean {
  return incomeKind(t) === "paycheck" || isInterest(t);
}

/**
 * Deposits waiting for an answer, newest first: money into a bank
 * account, pending or posted, (not a card) in the last REVIEW_WINDOW_DAYS that isn't a
 * paycheck, interest or a refund from a store, hasn't been given a
 * category by hand or by a rule, hasn't been answered, and isn't the other
 * side of a transfer out of one of your own accounts.
 */
export function depositsToReview(
  transactions: ReviewableTx[],
  cardIds: Set<string>,
  reviews: DepositReviews,
  todayIso: string
): DepositToReview[] {
  const today = dayOf(todayIso);
  const outByCents = new Map<number, ReviewableTx[]>();
  for (const t of transactions) {
    if (t.amount <= 0 || t.isManual || !t.account) continue;
    const cents = Math.round(t.amount * 100);
    if (!outByCents.has(cents)) outByCents.set(cents, []);
    outByCents.get(cents)!.push(t);
  }

  const out: DepositToReview[] = [];
  for (const t of transactions) {
    // Pending ones too: an answer moves to the posted deposit when it settles (plaid-sync).
    if (t.amount >= 0 || t.isManual || !t.account || cardIds.has(t.account.id)) continue;
    const age = today - dayOf(t.date);
    if (age < 0 || age > REVIEW_WINDOW_DAYS) continue;
    if (reviews[t.id] || t.category_override) continue;
    if (isPayOrInterest(t)) continue;
    const category = effectiveCategory(t);
    // A store refund lands in its own category and already comes off spending.
    if (category && category !== "OTHER" && isSpendingCategory(category)) continue;
    const mirror = outByCents.get(Math.round(-t.amount * 100)) ?? [];
    if (mirror.some((m) => m.account!.id !== t.account!.id && Math.abs(dayOf(m.date) - dayOf(t.date)) <= TRANSFER_PAIR_DAYS)) continue;

    out.push(asDeposit(t));
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}

function asDeposit(t: ReviewableTx): DepositToReview {
  const name = humanizeTransactionName(t);
  const raw = (t.name ?? "").trim();
  return {
    id: t.id,
    date: t.date,
    amount: -t.amount,
    name,
    detail: raw && raw.toLowerCase() !== name.toLowerCase() ? raw : null,
    account: t.account,
    pending: t.pending,
  };
}

export type ReviewedDeposit = DepositToReview & {
  summary: string;
  // Each part as it reads, and what it was, so it can be changed.
  // A charge paid back reads with what it had left before this deposit, as it will once the answer is changed.
  parts: { label: string; amount: number; answer: DepositAnswer; from?: "cash" | "account"; charge?: ChargeOption; name?: string }[];
};

/** Deposits already answered, newest first, with what each was said to be. */
export function reviewedDeposits(transactions: (ReviewableTx & { paid_back?: number | null })[], reviews: DepositReviews, limit = 30): ReviewedDeposit[] {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const chargeBefore = (c: { id: string; applied: number }): ChargeOption | undefined => {
    const t = byId.get(c.id);
    if (!t || t.amount <= 0) return undefined;
    const paid = Math.max(0, Math.min(t.paid_back ?? 0, t.amount) - c.applied);
    return asChargeOption(t, Math.round((t.amount - paid) * 100) / 100);
  };
  return transactions
    .filter((t) => reviews[t.id] && t.amount < 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((t) => {
      const review = reviews[t.id];
      return {
        ...asDeposit(t),
        summary: reviewSummary(review),
        parts: review.parts.map((p) => ({
          label: partLabel(p),
          amount: p.amount,
          answer: p.answer,
          ...(p.from ? { from: p.from } : {}),
          ...(p.charge && chargeBefore(p.charge) ? { charge: chargeBefore(p.charge) } : {}),
          ...(p.label ? { name: p.label } : {}),
        })),
      };
    });
}

export type ChargeOption = {
  id: string;
  manual: boolean;
  date: string;
  name: string;
  amount: number;
  // What hasn't been paid back yet.
  remaining: number;
  account: string | null;
};

/**
 * Charges someone could be paying back: settled spending (money out) from
 * CHARGE_LOOKBACK_DAYS before the earliest deposit on, with something left
 * to pay back. Newest first.
 */
export function chargeOptions(
  transactions: (ReviewableTx & { paid_back?: number | null })[],
  since: string,
  connectedCardIssuers: string[]
): ChargeOption[] {
  const from = dayOf(since) - CHARGE_LOOKBACK_DAYS;
  const out: ChargeOption[] = [];
  for (const t of transactions) {
    if (t.amount <= 0 || t.pending || dayOf(t.date) < from) continue;
    if (!countsAsSpending(t, connectedCardIssuers)) continue;
    const remaining = Math.round((t.amount - Math.min(t.paid_back ?? 0, t.amount)) * 100) / 100;
    if (remaining <= 0) continue;
    out.push(asChargeOption(t, remaining));
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function asChargeOption(t: ReviewableTx, remaining: number): ChargeOption {
  return {
    id: t.id,
    manual: t.isManual,
    date: t.date,
    name: humanizeTransactionName(t),
    amount: t.amount,
    remaining,
    account: t.account ? `${t.account.name}${t.account.mask ? ` ••${t.account.mask}` : ""}` : t.isManual ? "Cash" : null,
  };
}

/**
 * The charges a deposit most likely pays back, best first: one it covers
 * exactly, then one it's an even share of (half a dinner, a third of a
 * trip), then others it fits inside, nearest in time. Only charges from
 * before the deposit (or a few days after, for a friend who paid first).
 */
export function suggestCharges(deposit: { date: string; amount: number }, options: ChargeOption[], limit = 4): ChargeOption[] {
  const day = dayOf(deposit.date);
  const cents = Math.round(deposit.amount * 100);
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(2, b * 0.01);
  const rank = (c: ChargeOption) => {
    const remaining = Math.round(c.remaining * 100);
    const whole = Math.round(c.amount * 100);
    if (near(cents, remaining) || near(cents, whole)) return 0;
    if ([2, 3, 4, 5, 6].some((n) => near(cents * n, whole))) return 1;
    return cents < remaining ? 2 : 3;
  };
  return options
    .filter((c) => dayOf(c.date) <= day + TRANSFER_PAIR_DAYS && day - dayOf(c.date) <= CHARGE_LOOKBACK_DAYS)
    .map((c) => ({ c, r: rank(c), gap: Math.abs(day - dayOf(c.date)) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r || a.gap - b.gap)
    .slice(0, limit)
    .map((x) => x.c);
}

/** A push for each deposit from the last few days that's waiting for an answer. */
export function depositReviewAlerts(deposits: DepositToReview[], todayIso: string, currency: string): Alert[] {
  const today = dayOf(todayIso);
  return deposits
    .filter((d) => today - dayOf(d.date) <= ALERT_WITHIN_DAYS)
    .map((d) => ({
      key: `deposit-review:${d.id}`,
      kind: "deposit-review" as const,
      title: `${formatCurrency(d.amount, currency)} came in: what was it?`,
      body: `${d.name}${d.account ? ` to ${d.account.name}` : ""}. Say if it's income, someone paying you back, or your own money, so it counts right.`,
      href: "/transactions/deposits",
    }));
}
