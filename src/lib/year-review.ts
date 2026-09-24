import { incomeDeposits, type IncomeKind, type IncomeMonth } from "@/lib/income";
import {
  categoryTotalsForMonth,
  topMerchants,
  type CategoryTotal,
  type MerchantTotal,
  type SpendingTransaction,
} from "@/lib/spending-aggregation";
import { effectiveCategory, humanizeTransactionName } from "@/lib/transaction-display";

// Pure. A calendar year at a glance: what came in and went out, where it
// went, the best and hardest months, and the totals worth having at tax
// time.

export type YearReview = {
  year: number;
  inProgress: boolean; // the current year, so "so far"
  months: IncomeMonth[]; // January through the last month with history
  income: number;
  spending: number;
  kept: number;
  savingsRate: number | null;
  transactionCount: number;
  categories: (CategoryTotal & { share: number })[];
  merchants: MerchantTotal[];
  // Biggest one-off charges: merchants billed month after month are left out.
  largestPurchases: { date: string; merchant: string; amount: number; category: string | null }[];
  bestMonth: IncomeMonth | null; // most kept
  hardestMonth: IncomeMonth | null; // least kept
  highestSpendingMonth: IncomeMonth | null;
  lowestSpendingMonth: IncomeMonth | null;
  incomeSources: { source: string; kind: IncomeKind; amount: number }[];
  tax: { wages: number; interest: number; otherIncome: number; donations: number; medical: number; taxesPaid: number };
  // The year before over the same stretch, when history covers it.
  previous: { income: number; spending: number } | null;
};

/** Years with any transactions, newest first. */
export function yearsWithHistory(transactions: SpendingTransaction[]): number[] {
  return [...new Set(transactions.map((t) => Number(t.date.slice(0, 4))))].sort((a, b) => b - a);
}

function inYear(t: { date: string }, year: number): boolean {
  return t.date.startsWith(`${year}-`);
}

export function yearReview(
  all: SpendingTransaction[],
  spending: SpendingTransaction[],
  year: number,
  todayIso: string
): YearReview {
  const deposits = incomeDeposits(all).filter((d) => inYear(d, year));
  const yearSpending = spending.filter((t) => inYear(t, year));
  const firstDate = all.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null);
  const currentYear = Number(todayIso.slice(0, 4));
  const lastMonth = year === currentYear ? Number(todayIso.slice(5, 7)) : 12;
  const firstMonth = firstDate && firstDate.startsWith(`${year}-`) ? Number(firstDate.slice(5, 7)) : 1;

  const months: IncomeMonth[] = [];
  for (let m = firstMonth; m <= lastMonth; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const income = deposits.filter((d) => d.date.startsWith(key)).reduce((s, d) => s + d.amount, 0);
    const paychecks = deposits
      .filter((d) => d.date.startsWith(key) && d.kind === "paycheck")
      .reduce((s, d) => s + d.amount, 0);
    const out = yearSpending.filter((t) => t.date.startsWith(key)).reduce((s, t) => s + t.amount, 0);
    months.push({
      month: key,
      label: new Date(year, m - 1, 1).toLocaleDateString("en-US", { month: "short" }),
      income,
      paychecks,
      spending: out,
      net: income - out,
      complete: !(year === currentYear && m === lastMonth),
    });
  }

  const income = deposits.reduce((s, d) => s + d.amount, 0);
  const spent = yearSpending.reduce((s, t) => s + t.amount, 0);
  const categories = categoryTotalsForMonth(yearSpending).sort((a, b) => b.amount - a.amount);
  const categoryTotal = categories.reduce((s, c) => s + c.amount, 0);

  // Best and hardest are judged on finished months only; a month in
  // progress would always look like the hardest.
  const finished = months.filter((m) => m.complete);
  const pick = (better: (a: IncomeMonth, b: IncomeMonth) => boolean) =>
    finished.reduce<IncomeMonth | null>((best, m) => (best === null || better(m, best) ? m : best), null);

  const sources = new Map<string, { source: string; kind: IncomeKind; amount: number }>();
  for (const d of deposits) {
    const entry = sources.get(d.source) ?? { source: d.source, kind: d.kind, amount: 0 };
    entry.amount += d.amount;
    sources.set(d.source, entry);
  }

  // Merchants charged in 3+ different months (rent, insurance, a phone
  // bill) are bills, not purchases, and would crowd the biggest-purchases list.
  const monthsByMerchant = new Map<string, Set<string>>();
  for (const t of yearSpending) {
    if (t.amount <= 0) continue;
    const name = humanizeTransactionName(t);
    const set = monthsByMerchant.get(name) ?? new Set<string>();
    set.add(t.date.slice(0, 7));
    monthsByMerchant.set(name, set);
  }
  const recurring = new Set([...monthsByMerchant].filter(([, months]) => months.size >= 3).map(([name]) => name));

  const sumWhere = (pred: (t: SpendingTransaction) => boolean) =>
    all.filter((t) => inYear(t, year) && !t.pending && pred(t)).reduce((s, t) => s + t.amount, 0);

  // The year before, over the same stretch: all of it for a finished year,
  // January to today's date for the one in progress.
  const prevCutoff = year === currentYear ? `${year - 1}-${todayIso.slice(5)}` : `${year - 1}-12-31`;
  const inPrevious = (t: { date: string }) => inYear(t, year - 1) && t.date <= prevCutoff;
  const prevDeposits = incomeDeposits(all).filter(inPrevious);
  const hasPrevious = firstDate !== null && firstDate <= `${year - 1}-01-31`;

  return {
    year,
    inProgress: year === currentYear,
    months,
    income,
    spending: spent,
    kept: income - spent,
    savingsRate: income > 0 ? (income - spent) / income : null,
    transactionCount: all.filter((t) => inYear(t, year)).length,
    categories: categories.map((c) => ({ ...c, share: categoryTotal > 0 ? c.amount / categoryTotal : 0 })),
    merchants: topMerchants(yearSpending, 10),
    largestPurchases: yearSpending
      .filter((t) => t.amount > 0 && !recurring.has(humanizeTransactionName(t)))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((t) => ({ date: t.date, merchant: humanizeTransactionName(t), amount: t.amount, category: effectiveCategory(t) })),
    bestMonth: pick((a, b) => a.net > b.net),
    hardestMonth: pick((a, b) => a.net < b.net),
    highestSpendingMonth: pick((a, b) => a.spending > b.spending),
    lowestSpendingMonth: pick((a, b) => a.spending < b.spending),
    incomeSources: [...sources.values()].filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount),
    tax: {
      wages: deposits.filter((d) => d.kind === "paycheck").reduce((s, d) => s + d.amount, 0),
      interest: deposits.filter((d) => d.kind === "interest").reduce((s, d) => s + d.amount, 0),
      otherIncome: deposits.filter((d) => d.kind === "other").reduce((s, d) => s + d.amount, 0),
      donations: sumWhere((t) => t.pfc_detailed === "GOVERNMENT_AND_NON_PROFIT_DONATIONS"),
      medical: sumWhere((t) => effectiveCategory(t) === "MEDICAL"),
      taxesPaid: sumWhere((t) => t.pfc_detailed === "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT"),
    },
    previous: hasPrevious
      ? {
          income: prevDeposits.reduce((s, d) => s + d.amount, 0),
          spending: spending.filter(inPrevious).reduce((s, t) => s + t.amount, 0),
        }
      : null,
  };
}
