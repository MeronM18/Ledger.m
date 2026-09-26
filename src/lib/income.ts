import { incomeAmount, type SpendingTransaction } from "@/lib/spending-aggregation";
import { detectPayrollCompany, effectiveCategory, humanizeTransactionName } from "@/lib/transaction-display";

// Pure. Income for someone paid on commission: no forecast, because the
// next check can't be known. Instead a look back that answers "what can I
// count on?" (the lowest recent month), "how much does it swing?" and "how
// is this year going?".

export type IncomeKind = "paycheck" | "interest" | "other";

export type IncomeDeposit = {
  date: string;
  amount: number; // money received, positive
  source: string; // display name, e.g. "United Mortgage Paycheck"
  kind: IncomeKind;
};

export type IncomeMonth = {
  month: string; // YYYY-MM
  label: string; // "Sep 26"
  income: number;
  paychecks: number;
  spending: number;
  net: number;
  complete: boolean; // false for the month in progress
};

export type IncomeStats = {
  months: IncomeMonth[]; // oldest first; the last one is the month in progress
  // Everything below is over the complete months in `months` (up to 12).
  completeMonths: number;
  average: number | null;
  median: number | null;
  lowest: IncomeMonth | null;
  highest: IncomeMonth | null;
  // How far a typical month lands from the average, in dollars and as a share of it.
  spread: number | null;
  variability: "steady" | "uneven" | "very uneven" | null;
  averageSpending: number | null;
  // Spending over income across the complete months, 0.2 = kept 20%.
  savingsRate: number | null;
  monthsSpendingOverIncome: number;
  thisMonth: IncomeMonth;
  ytd: number;
  ytdSpending: number;
  // The same stretch of last year (Jan 1 to today's date), when history reaches back that far.
  ytdLastYear: number | null;
  sources: { source: string; kind: IncomeKind; amount: number; count: number }[];
  paychecks: {
    count: number;
    average: number | null;
    largest: IncomeDeposit | null;
    last: IncomeDeposit | null;
    daysSinceLast: number | null;
    // The usual number of days between paychecks.
    typicalGapDays: number | null;
  };
  recent: IncomeDeposit[];
};

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number {
  return Math.round(new Date(`${iso}T00:00:00Z`).getTime() / DAY_MS);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** Interest a bank or savings account paid, by its category or its name. */
export function isInterest(t: Pick<SpendingTransaction, "pfc_detailed" | "merchant_name" | "name">): boolean {
  return t.pfc_detailed === "INCOME_INTEREST_EARNED" || /\binterest\b/i.test(`${t.merchant_name ?? ""} ${t.name ?? ""}`);
}

/** Every settled deposit categorized as income, newest first. A reversal (money taken back) counts against it. */
export function incomeDeposits(transactions: SpendingTransaction[]): IncomeDeposit[] {
  return transactions
    .filter(isIncomeDeposit)
    .map((t) => ({ date: t.date, amount: incomeAmount(t), source: humanizeTransactionName(t), kind: incomeKind(t) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** A settled deposit (or its reversal) categorized as income. */
export function isIncomeDeposit(t: SpendingTransaction): boolean {
  return !t.pending && effectiveCategory(t) === "INCOME";
}

/** A paycheck (by the payroll name or Plaid's wages category), interest, or other income. */
export function incomeKind(t: SpendingTransaction): IncomeKind {
  if (detectPayrollCompany(t.name ?? "") || t.pfc_detailed === "INCOME_WAGES") return "paycheck";
  return isInterest(t) ? "interest" : "other";
}

export function variabilityOf(spread: number, average: number): IncomeStats["variability"] {
  if (average <= 0) return null;
  const ratio = spread / average;
  if (ratio < 0.15) return "steady";
  if (ratio < 0.35) return "uneven";
  return "very uneven";
}

/**
 * The income picture as of `todayIso`. `all` is every transaction (income is
 * picked out of it); `spending` is the spending-only view, for what went out
 * each month. Months before the first transaction on record aren't counted
 * as $0 months: there's just no history for them.
 */
export function incomeStats(
  all: SpendingTransaction[],
  spending: SpendingTransaction[],
  todayIso: string,
  monthsBack = 12
): IncomeStats {
  const deposits = incomeDeposits(all);
  const currentMonth = todayIso.slice(0, 7);
  const firstDate = all.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null);
  const firstMonth = firstDate?.slice(0, 7) ?? currentMonth;

  const incomeBy = new Map<string, { income: number; paychecks: number }>();
  for (const d of deposits) {
    const key = d.date.slice(0, 7);
    const entry = incomeBy.get(key) ?? { income: 0, paychecks: 0 };
    entry.income += d.amount;
    if (d.kind === "paycheck") entry.paychecks += d.amount;
    incomeBy.set(key, entry);
  }
  const spendingBy = new Map<string, number>();
  for (const t of spending) {
    const key = t.date.slice(0, 7);
    spendingBy.set(key, (spendingBy.get(key) ?? 0) + t.amount);
  }

  const months: IncomeMonth[] = [];
  for (let i = monthsBack; i >= 0; i--) {
    const month = shiftMonth(currentMonth, -i);
    // A month only counts once it's fully covered by history: the month the
    // history starts in is usually partial, so it's left out too, unless
    // it's the current month.
    if (month <= firstMonth && month !== currentMonth) continue;
    const inc = incomeBy.get(month) ?? { income: 0, paychecks: 0 };
    const out = spendingBy.get(month) ?? 0;
    months.push({
      month,
      label: monthLabel(month),
      income: inc.income,
      paychecks: inc.paychecks,
      spending: out,
      net: inc.income - out,
      complete: month !== currentMonth,
    });
  }

  const complete = months.filter((m) => m.complete);
  const incomes = complete.map((m) => m.income);
  const average = incomes.length ? incomes.reduce((a, b) => a + b, 0) / incomes.length : null;
  const spread =
    average !== null && incomes.length > 1
      ? Math.sqrt(incomes.reduce((sum, v) => sum + (v - average) ** 2, 0) / incomes.length)
      : null;
  const lowest = complete.reduce<IncomeMonth | null>((min, m) => (min === null || m.income < min.income ? m : min), null);
  const highest = complete.reduce<IncomeMonth | null>((max, m) => (max === null || m.income > max.income ? m : max), null);
  const totalIncome = complete.reduce((s, m) => s + m.income, 0);
  const totalSpending = complete.reduce((s, m) => s + m.spending, 0);

  const year = todayIso.slice(0, 4);
  const lastYear = String(Number(year) - 1);
  const sumIncome = (from: string, to: string) =>
    deposits.filter((d) => d.date >= from && d.date <= to).reduce((s, d) => s + d.amount, 0);
  const ytd = sumIncome(`${year}-01-01`, todayIso);
  const ytdSpending = spending
    .filter((t) => t.date >= `${year}-01-01` && t.date <= todayIso)
    .reduce((s, t) => s + t.amount, 0);
  const ytdLastYear =
    firstDate !== null && firstDate <= `${lastYear}-01-01`
      ? sumIncome(`${lastYear}-01-01`, `${lastYear}${todayIso.slice(4)}`)
      : null;

  const windowStart = complete[0]?.month ?? currentMonth;
  const inWindow = deposits.filter((d) => d.date.slice(0, 7) >= windowStart);
  const sourceMap = new Map<string, { source: string; kind: IncomeKind; amount: number; count: number }>();
  for (const d of inWindow) {
    const entry = sourceMap.get(d.source) ?? { source: d.source, kind: d.kind, amount: 0, count: 0 };
    entry.amount += d.amount;
    entry.count += 1;
    sourceMap.set(d.source, entry);
  }

  const paychecks = inWindow.filter((d) => d.kind === "paycheck");
  const allPaychecks = deposits.filter((d) => d.kind === "paycheck");
  const last = allPaychecks[0] ?? null;
  const gaps = allPaychecks
    .slice(0, 13)
    .map((d, i, arr) => (i + 1 < arr.length ? dayNumber(d.date) - dayNumber(arr[i + 1].date) : null))
    .filter((g): g is number => g !== null && g > 0);

  return {
    months,
    completeMonths: complete.length,
    average,
    median: median(incomes),
    lowest,
    highest,
    spread,
    variability: average !== null && spread !== null ? variabilityOf(spread, average) : null,
    averageSpending: complete.length ? totalSpending / complete.length : null,
    savingsRate: totalIncome > 0 ? (totalIncome - totalSpending) / totalIncome : null,
    monthsSpendingOverIncome: complete.filter((m) => m.spending > m.income).length,
    thisMonth: months[months.length - 1],
    ytd,
    ytdSpending,
    ytdLastYear,
    sources: [...sourceMap.values()].filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount),
    paychecks: {
      count: paychecks.length,
      average: paychecks.length ? paychecks.reduce((s, d) => s + d.amount, 0) / paychecks.length : null,
      largest: paychecks.reduce<IncomeDeposit | null>((max, d) => (max === null || d.amount > max.amount ? d : max), null),
      last,
      daysSinceLast: last ? dayNumber(todayIso) - dayNumber(last.date) : null,
      typicalGapDays: median(gaps),
    },
    recent: deposits.slice(0, 8),
  };
}
