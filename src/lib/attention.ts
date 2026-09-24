import type { BudgetProgress } from "@/lib/budgets";
import { formatCurrency } from "@/lib/format";
import { daysAgo, longDate, type ImportStatus } from "@/lib/import-reminders";

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

const MAX_ITEMS = 10;
const RENEWAL_DAYS = 3;

function overRow(b: BudgetProgress, currency: string): AttentionItem {
  return {
    key: `over-${b.category}`,
    tone: "over",
    title: `${b.label} is over budget`,
    detail: `${formatCurrency(-b.remaining, currency)} over your ${formatCurrency(b.budget, currency)} budget`,
    href: "/budgets",
  };
}

function warningRow(b: BudgetProgress, currency: string): AttentionItem {
  return {
    key: `warn-${b.category}`,
    tone: "warning",
    title: `${b.label} budget is ${Math.round(b.percentUsed * 100)}% used`,
    detail: `${formatCurrency(b.remaining, currency)} left this month`,
    href: "/budgets",
  };
}

export function attentionItems(
  budgets: BudgetProgress[],
  upcoming: UpcomingLike[],
  todayIso: string,
  currency: string,
  // Banks that stopped syncing until they're signed in to again: first,
  // since every other number on the page goes stale while they're out.
  disconnected: { id: string; name: string }[] = [],
  // Apple accounts whose last statement import is two weeks old or more.
  importsDue: { id: string; name: string; status: ImportStatus }[] = []
): AttentionItem[] {
  const items: AttentionItem[] = [
    ...disconnected.map((bank) => ({
      key: `reconnect-${bank.id}`,
      tone: "over" as const,
      title: `Sign in to ${bank.name} again`,
      detail: "It stopped syncing. Reconnect it on the Accounts page",
      href: "/accounts",
    })),
    ...importsDue.map((a) => ({
      key: `import-${a.id}`,
      tone: "warning" as const,
      title: `Import your ${a.name} statement`,
      detail: `Last imported ${longDate(a.status.lastImportDate)} (${daysAgo(a.status.daysSince)}). Export the CSV from Wallet and import it on the Accounts page`,
      href: "/accounts",
    })),
    // Every budget on its own line, furthest over (or closest to its limit) first.
    ...budgets
      .filter((b) => b.status === "over")
      .sort((a, b) => a.remaining - b.remaining)
      .map((b) => overRow(b, currency)),
    ...budgets
      .filter((b) => b.status === "warning")
      .sort((a, b) => b.percentUsed - a.percentUsed)
      .map((b) => warningRow(b, currency)),
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
