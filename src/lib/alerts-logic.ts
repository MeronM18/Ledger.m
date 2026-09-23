import type { BudgetProgress } from "@/lib/budgets";
import { formatCurrency } from "@/lib/format";
import { hasLapsed, hasPriceIncrease, isWithinNextDays, projectNextOccurrence } from "@/lib/subscriptions-aggregation";

// Pure, dependency-free. Each function turns current data into the alerts
// that are true right now; the dedupe key says "this exact situation", so
// the dispatcher (alerts.ts) can insert-then-push and never repeat itself.

export type AlertKind = "budget-over" | "budget-warning" | "renewal" | "price-increase" | "low-balance";

export type Alert = { key: string; kind: AlertKind; title: string; body: string };

export function budgetAlerts(progress: BudgetProgress[], monthKey: string, currency: string): Alert[] {
  const alerts: Alert[] = [];

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
