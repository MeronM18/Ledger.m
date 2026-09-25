import type { BudgetLine, BudgetProgress } from "@/lib/budgets";
import { GOOD_UTILIZATION, type CardUtilization } from "@/lib/credit-utilization";
import { formatCurrency } from "@/lib/format";
import type { SpendingTransaction } from "@/lib/spending-aggregation";
import { hasLapsed, hasPriceIncrease, isWithinNextDays, projectNextOccurrence } from "@/lib/subscriptions-aggregation";
import { humanizeTransactionName } from "@/lib/transaction-display";

// Pure, dependency-free. Each function turns current data into the alerts
// that are true right now; the dedupe key says "this exact situation", so
// the dispatcher (alerts.ts) can insert-then-push and never repeat itself.

export type AlertKind =
  | "budget-over"
  | "budget-warning"
  | "renewal"
  | "price-increase"
  | "low-balance"
  | "unusual-charge"
  | "bank-signin"
  | "monthly-summary"
  | "import-reminder"
  | "high-utilization"
  | "deposit-review";

// `href`: where tapping the push opens, when there's a page for it.
export type Alert = { key: string; kind: AlertKind; title: string; body: string; href?: string };

export function budgetAlerts(progress: BudgetProgress[], monthKey: string, currency: string, month: BudgetLine | null = null): Alert[] {
  const alerts: Alert[] = [];

  // The whole month against the monthly budget first.
  if (month?.status === "over") {
    alerts.push({
      key: `budget-over:MONTH:${monthKey}`,
      kind: "budget-over",
      title: "You're over your monthly budget",
      body: `${formatCurrency(month.spent, currency)} spent of your ${formatCurrency(month.budget, currency)} monthly budget.`,
    });
  } else if (month?.status === "warning") {
    alerts.push({
      key: `budget-warning:MONTH:${monthKey}`,
      kind: "budget-warning",
      title: `Monthly budget is ${Math.round(month.percentUsed * 100)}% used`,
      body: `${formatCurrency(month.spent, currency)} of ${formatCurrency(month.budget, currency)} spent, ${formatCurrency(month.remaining, currency)} left this month.`,
    });
  }

  for (const p of progress) {
    if (p.status === "over") {
      alerts.push({
        key: `budget-over:${p.category}:${monthKey}`,
        kind: "budget-over",
        title: `${p.label} is over budget`,
        body: `${formatCurrency(p.spent, currency)} spent of your ${formatCurrency(p.budget, currency)} budget this month.`,
      });
    } else if (p.status === "warning") {
      alerts.push({
        key: `budget-warning:${p.category}:${monthKey}`,
        kind: "budget-warning",
        title: `${p.label} budget is ${Math.round(p.percentUsed * 100)}% used`,
        body: `${formatCurrency(p.spent, currency)} of ${formatCurrency(p.budget, currency)} spent, ${formatCurrency(p.remaining, currency)} left.`,
      });
    }
  }

  return alerts;
}

export type RenewalCandidate = {
  source: "plaid" | "manual";
  id: string;
  name: string;
  amount: number;
  frequency: string | null;
  date: string | null; // stored predicted_next_date / next_billing_date
};

function whenLabel(daysAway: number): string {
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `in ${daysAway} days`;
}

/**
 * Subscriptions about to charge. A subscription whose stored date lapsed
 * (no new charge landed well past it) is skipped: it may be gone, and
 * "renews tomorrow" for something that stopped billing would be noise.
 */
export function renewalAlerts(
  candidates: RenewalCandidate[],
  today: Date,
  daysAhead: number,
  currency: string
): Alert[] {
  const alerts: Alert[] = [];
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (const c of candidates) {
    if (hasLapsed(c.date, today)) continue;
    const next = projectNextOccurrence(c.date, c.frequency, today);
    if (!next || !isWithinNextDays(next, daysAhead, today)) continue;

    const daysAway = Math.round((new Date(`${next}T00:00:00`).getTime() - midnight.getTime()) / 86_400_000);
    const dateLabel = new Date(`${next}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    alerts.push({
      key: `renewal:${c.source}:${c.id}:${next}`,
      kind: "renewal",
      title: `${c.name} renews ${whenLabel(daysAway)}`,
      body: `About ${formatCurrency(c.amount, currency)} expected on ${dateLabel}.`,
    });
  }

  return alerts;
}

export type PriceStream = {
  id: string;
  name: string;
  average_amount: number | null;
  last_amount: number | null;
};

export function priceIncreaseAlerts(streams: PriceStream[], currency: string): Alert[] {
  return streams
    .filter((s) => hasPriceIncrease(s.average_amount, s.last_amount))
    .map((s) => ({
      key: `price-increase:${s.id}:${s.last_amount}`,
      kind: "price-increase" as const,
      title: `${s.name} charged more than usual`,
      body: `Last charge was ${formatCurrency(s.last_amount as number, currency)}, up from an average of ${formatCurrency(s.average_amount as number, currency)}.`,
    }));
}

export type BalanceAccount = {
  id: string;
  name: string;
  mask: string | null;
  type: string;
  available_balance: number | null;
  current_balance: number | null;
};

/** The Monday of the week containing `isoDate` (YYYY-MM-DD), as YYYY-MM-DD. */
export function weekStart(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

/**
 * Checking/savings accounts under the threshold. The key includes the week,
 * so a balance that stays low nags at most once a week, not on every sync.
 */
export function lowBalanceAlerts(
  accounts: BalanceAccount[],
  isoDate: string,
  threshold: number,
  currency: string
): Alert[] {
  const week = weekStart(isoDate);

  return accounts
    .filter((a) => a.type === "depository")
    .flatMap((a) => {
      const balance = a.available_balance ?? a.current_balance;
      if (balance === null || balance >= threshold) return [];
      const label = `${a.name}${a.mask ? ` ••${a.mask}` : ""}`;
      return [
        {
          key: `low-balance:${a.id}:${week}`,
          kind: "low-balance" as const,
          title: `Low balance: ${label}`,
          body: `${formatCurrency(balance, currency)} available, under your ${formatCurrency(threshold, currency)} alert level.`,
        },
      ];
    });
}

/**
 * A card using 30% or more of its limit (the common guideline for credit
 * scores), and again at 50%. Once per card per month at each level, so a
 * card that stays high isn't a daily nag; paying it down and running it up
 * again next month tells you again.
 */
export function highUtilizationAlerts(cards: CardUtilization[], monthKey: string, currency: string): Alert[] {
  return cards.flatMap((c) => {
    if (c.utilization < GOOD_UTILIZATION) return [];
    const level = c.utilization >= 0.5 ? 50 : 30;
    const pct = Math.round(c.utilization * 100);
    return [
      {
        key: `high-utilization:${c.id}:${monthKey}:${level}`,
        kind: "high-utilization" as const,
        title: `${c.label} is at ${pct}% of its limit`,
        body: `${formatCurrency(c.balance, currency)} of ${formatCurrency(c.limit, currency)} used. Paying ${formatCurrency(c.payDownToGood, currency)} brings it under 30%.`,
      },
    ];
  });
}

// An unusual charge: well above what that merchant normally costs you, with
// enough history to know what "normally" is.
export const UNUSUAL_CHARGE = {
  // Charges this recent are checked (the daily run plus a little slack).
  withinDays: 3,
  // Earlier charges at the same merchant needed, over the past year.
  minHistory: 3,
  // At least this many times the usual (median) amount...
  multiple: 2.5,
  // ...and at least this many dollars over it, so $4 coffee vs $12 isn't news.
  minDollarsOver: 50,
};

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(new Date(`${iso}T00:00:00Z`).getTime() / DAY_MS);

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Recent charges far above the merchant's usual amount, and above anything
 * paid there in the past year. `spending` is the spending-only view (no
 * transfers or income). Pending charges wait until they settle: a pending
 * charge gets a new id when it posts, so keying on it would alert twice.
 */
export function unusualChargeAlerts(
  spending: (SpendingTransaction & { id: string })[],
  todayIso: string,
  currency: string
): Alert[] {
  const today = dayNumber(todayIso);
  const byMerchant = new Map<string, (SpendingTransaction & { id: string })[]>();
  for (const t of spending) {
    if (t.pending || t.amount <= 0) continue;
    const key = humanizeTransactionName(t).toLowerCase();
    const list = byMerchant.get(key) ?? [];
    list.push(t);
    byMerchant.set(key, list);
  }

  const alerts: Alert[] = [];
  for (const charges of byMerchant.values()) {
    for (const t of charges) {
      const age = today - dayNumber(t.date);
      if (age < 0 || age > UNUSUAL_CHARGE.withinDays) continue;
      const prior = charges
        .filter((p) => p.id !== t.id && p.date < t.date && dayNumber(t.date) - dayNumber(p.date) <= 365)
        .map((p) => p.amount);
      if (prior.length < UNUSUAL_CHARGE.minHistory) continue;
      const usual = medianOf(prior);
      if (t.amount < usual * UNUSUAL_CHARGE.multiple) continue;
      if (t.amount - usual < UNUSUAL_CHARGE.minDollarsOver) continue;
      if (t.amount <= Math.max(...prior)) continue;

      const merchant = humanizeTransactionName(t);
      alerts.push({
        key: `unusual-charge:${t.id}`,
        kind: "unusual-charge",
        title: `Unusual charge at ${merchant}`,
        body: `${formatCurrency(t.amount, currency)}, about ${Math.round(t.amount / usual)}x the usual ${formatCurrency(usual, currency)} there. Worth a look if you don't recognize it.`,
      });
    }
  }
  return alerts;
}

/** A bank that stopped syncing until it's signed in to again. Repeats weekly while it stays that way. */
export function bankSigninAlerts(banks: { id: string; name: string }[], isoDate: string): Alert[] {
  const week = weekStart(isoDate);
  return banks.map((b) => ({
    key: `bank-signin:${b.id}:${week}`,
    kind: "bank-signin" as const,
    title: `Sign in to ${b.name} again`,
    body: `${b.name} stopped syncing. Open Accounts in Ledger.m and tap Reconnect.`,
  }));
}
