import type { Alert } from "@/lib/alerts-logic";
import { budgetProgress, daysInMonth, type Budget } from "@/lib/budgets";
import { formatCurrency } from "@/lib/format";
import { incomeDeposits } from "@/lib/income";
import { categoryTotalsForMonth, type SpendingTransaction } from "@/lib/spending-aggregation";

// Pure. The push sent early each month about the month that just ended:
// what came in, what went out, how net worth moved and how the budgets did.

export type NetWorthPoint = { date: string; net_worth: number };

export type MonthlySummary = {
  month: string; // YYYY-MM, the month summarized
  monthName: string; // "August"
  income: number;
  spending: number;
  kept: number;
  netWorthChange: number | null;
  netWorthEnd: number | null;
  budgetsTotal: number;
  budgetsOver: { label: string; over: number }[];
  topCategory: { label: string; amount: number } | null;
};

/** The last snapshot on or before `isoDate`. */
function snapshotAt(points: NetWorthPoint[], isoDate: string): NetWorthPoint | null {
  let best: NetWorthPoint | null = null;
  for (const p of points) if (p.date <= isoDate && (best === null || p.date > best.date)) best = p;
  return best;
}

function lastDayOf(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
}

/**
 * The month before the one `todayIso` is in, or null when there's nothing
 * to say about it (no transactions that month, i.e. before history starts).
 */
export function monthlySummary(
  all: SpendingTransaction[],
  spending: SpendingTransaction[],
  budgets: Budget[],
  snapshots: NetWorthPoint[],
  todayIso: string
): MonthlySummary | null {
  const [ty, tm] = todayIso.split("-").map(Number);
  const year = tm === 1 ? ty - 1 : ty;
  const month = tm === 1 ? 11 : tm - 2; // 0-indexed month before this one
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;

  if (!all.some((t) => t.date.startsWith(key))) return null;

  const income = incomeDeposits(all)
    .filter((d) => d.date.startsWith(key))
    .reduce((s, d) => s + d.amount, 0);
  const categories = categoryTotalsForMonth(spending, year, month);
  const spent = categories.reduce((s, c) => s + c.amount, 0);

  // The nightly snapshot runs just after midnight, so the one dated the 1st
  // is the balance at the end of the month before: measure 1st to 1st.
  const end = lastDayOf(year, month);
  const endSnap = snapshotAt(snapshots, `${todayIso.slice(0, 7)}-01`);
  const startSnap = snapshotAt(snapshots, `${key}-01`);

  // Judged at the month's last day, so the result is final, not a pace.
  const progress = budgetProgress(categories, budgets, { year, month, isoDate: end });
  const top = [...categories].sort((a, b) => b.amount - a.amount)[0] ?? null;

  return {
    month: key,
    monthName: new Date(year, month, 1).toLocaleDateString("en-US", { month: "long" }),
    income,
    spending: spent,
    kept: income - spent,
    netWorthChange: endSnap && startSnap && endSnap.date !== startSnap.date ? endSnap.net_worth - startSnap.net_worth : null,
    netWorthEnd: endSnap?.net_worth ?? null,
    budgetsTotal: progress.length,
    budgetsOver: progress
      .filter((p) => p.status === "over")
      .sort((a, b) => a.remaining - b.remaining)
      .map((p) => ({ label: p.label, over: -p.remaining })),
    topCategory: top ? { label: top.label, amount: top.amount } : null,
  };
}

function signed(n: number, currency: string): string {
  return `${n >= 0 ? "+" : "-"}${formatCurrency(Math.abs(n), currency)}`;
}

export function monthlySummaryAlert(s: MonthlySummary, currency: string): Alert {
  const lines = [
    `In ${formatCurrency(s.income, currency)} · Out ${formatCurrency(s.spending, currency)} · ${
      s.kept >= 0 ? `Kept ${formatCurrency(s.kept, currency)}` : `Spent ${formatCurrency(-s.kept, currency)} more than came in`
    }`,
  ];
  if (s.netWorthChange !== null && s.netWorthEnd !== null) {
    lines.push(`Net worth ${signed(s.netWorthChange, currency)}, now ${formatCurrency(s.netWorthEnd, currency)}`);
  }
  if (s.budgetsTotal > 0) {
    const onTrack = s.budgetsTotal - s.budgetsOver.length;
    const over = s.budgetsOver
      .slice(0, 2)
      .map((b) => `${b.label} by ${formatCurrency(b.over, currency)}`)
      .join(", ");
    lines.push(
      s.budgetsOver.length === 0
        ? `Budgets: all ${s.budgetsTotal} stayed within`
        : `Budgets: ${onTrack} of ${s.budgetsTotal} within; over: ${over}${s.budgetsOver.length > 2 ? ", and more" : ""}`
    );
  }
  if (s.topCategory) lines.push(`Most went to ${s.topCategory.label} (${formatCurrency(s.topCategory.amount, currency)})`);

  return {
    key: `monthly-summary:${s.month}`,
    kind: "monthly-summary",
    title: `${s.monthName} in review`,
    body: lines.join("\n"),
  };
}
