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

// More than this many rows of the same kind collapse into one, so a month
// where most budgets are blown reads as one line, not a wall of five.
const GROUP_ABOVE = 2;

function group(
  kind: "over" | "warning",
  rows: BudgetProgress[],
  currency: string
): AttentionItem[] {
  if (rows.length === 0) return [];

  if (rows.length <= GROUP_ABOVE) {
    return rows.map((b) =>
      kind === "over"
        ? {
            key: `over-${b.category}`,
            tone: "over" as const,
            title: `${b.label} is over budget`,
            detail: `${formatCurrency(-b.remaining, currency)} over your ${formatCurrency(b.budget, currency)} budget`,
            href: "/budgets",
          }
        : {
            key: `warn-${b.category}`,
            tone: "warning" as const,
            title: `${b.label} budget is ${Math.round(b.percentUsed * 100)}% used`,
            detail: `${formatCurrency(b.remaining, currency)} left this month`,
            href: "/budgets",
          }
    );
  }

  // Biggest problems first, named, with the rest counted.
  const ranked = [...rows].sort((a, b) =>
    kind === "over" ? a.remaining - b.remaining : b.percentUsed - a.percentUsed
  );
  const named = ranked
    .slice(0, 3)
    .map((b) => (kind === "over" ? `${b.label} (+${formatCurrency(-b.remaining, currency)})` : `${b.label} (${Math.round(b.percentUsed * 100)}%)`))
    .join(", ");
  const more = rows.length - 3;

  return [
    {
      key: `${kind}-group`,
      tone: kind,
      title: kind === "over" ? `${rows.length} budgets are over` : `${rows.length} budgets are nearly used up`,
      detail: `${named}${more > 0 ? `, and ${more} more` : ""}`,
      href: "/budgets",
    },
  ];
}

export function attentionItems(
  budgets: BudgetProgress[],
  upcoming: UpcomingLike[],
  todayIso: string,
  currency: string
): AttentionItem[] {
  const items: AttentionItem[] = [
    ...group("over", budgets.filter((b) => b.status === "over"), currency),
    ...group("warning", budgets.filter((b) => b.status === "warning"), currency),
  ];

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
