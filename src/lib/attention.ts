import type { BudgetProgress } from "@/lib/budgets";
import { formatCurrency } from "@/lib/format";

// Pure, dependency-free. The overview's "needs attention" list: the few
// things worth acting on today, most urgent first. Each item links to the
// page where it can be handled.

export type AttentionItem = {
  key: string;
  tone: "over" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
};

export type UpcomingLike = { key: string; label: string; amount: number; date: string };

const MAX_ITEMS = 5;
const RENEWAL_DAYS = 3;

export function attentionItems(
  budgets: BudgetProgress[],
  upcoming: UpcomingLike[],
  todayIso: string,
  currency: string
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const b of budgets.filter((b) => b.status === "over")) {
    items.push({
      key: `over-${b.category}`,
      tone: "over",
      title: `${b.label} is over budget`,
      detail: `${formatCurrency(-b.remaining, currency)} over your ${formatCurrency(b.budget, currency)} budget`,
      href: "/budgets",
    });
  }

  for (const b of budgets.filter((b) => b.status === "warning")) {
    items.push({
      key: `warn-${b.category}`,
      tone: "warning",
      title: `${b.label} budget is ${Math.round(b.percentUsed * 100)}% used`,
      detail: `${formatCurrency(b.remaining, currency)} left this month`,
      href: "/budgets",
    });
  }

  for (const u of upcoming) {
    const daysAway = Math.round(
      (new Date(`${u.date}T00:00:00Z`).getTime() - new Date(`${todayIso}T00:00:00Z`).getTime()) / 86_400_000
    );
    if (daysAway < 0 || daysAway > RENEWAL_DAYS) continue;
    const when = daysAway === 0 ? "today" : daysAway === 1 ? "tomorrow" : `in ${daysAway} days`;
    items.push({
      key: `renewal-${u.key}`,
      tone: "info",
      title: `${u.label} renews ${when}`,
      detail: `About ${formatCurrency(u.amount, currency)}`,
      href: "/subscriptions",
    });
  }

  return items.slice(0, MAX_ITEMS);
}
