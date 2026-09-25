// Pure. Reports → Income for any period and any slice of it: the total, how
// it compares with the stretch before, what kind of income it was, where it
// came from, each month, the paychecks, and every deposit behind it. The
// filters (kind, source, account) narrow everything; spending and what was
// kept only show for the whole picture, since a slice of income against all
// spending would say nothing true.

import type { IncomeKind } from "@/lib/income";
import { inRange, overTimeMonths, type DateRange } from "@/lib/spending-report";

export type IncomeEntry = {
  id: string;
  date: string;
  amount: number; // money received; a reversal is negative
  source: string;
  kind: IncomeKind;
  accountId: string | null;
};

export type IncomeFilters = { kind: IncomeKind | "all"; source: string | null; accountId: string };

export const NO_FILTERS: IncomeFilters = { kind: "all", source: null, accountId: "all" };

export type SpendingPoint = { date: string; amount: number };

const KINDS: IncomeKind[] = ["paycheck", "interest", "other"];
const round = (n: number) => Math.round(n * 100) / 100;

export function filtersOn(f: IncomeFilters): boolean {
  return f.kind !== "all" || f.source !== null || f.accountId !== "all";
}

export function matches(e: IncomeEntry, f: IncomeFilters): boolean {
  return (f.kind === "all" || e.kind === f.kind) && (f.source === null || e.source === f.source) && (f.accountId === "all" || e.accountId === f.accountId);
}

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** The same day `months` earlier, pulled back to the month's last day when it's shorter. */
function monthsBefore(iso: string, months: number): string {
  const i = monthIndex(iso) - months;
  const y = Math.floor(i / 12);
  const m = i - y * 12;
  const d = Math.min(Number(iso.slice(8, 10)), lastDay(y, m));
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * The stretch to compare a period with: just as long, right before it, and
 * cut at the same point when the period is still going ("Sep 1-24" against
 * "Aug 1-24"). None for all time.
 */
export function previousRange(range: DateRange, todayIso: string): DateRange | null {
  if (range.start === null || range.end === null) return null;
  const end = range.end < todayIso ? range.end : todayIso;
  if (end < range.start) return null;
  const months = monthIndex(range.end) - monthIndex(range.start) + 1;
  return { start: monthsBefore(range.start, months), end: monthsBefore(end, months) };
}

export type IncomeMonthRow = {
  month: string; // YYYY-MM
  paycheck: number;
  interest: number;
  other: number;
  income: number;
  // Only for the whole picture (no filters).
  spending: number | null;
  kept: number | null;
  complete: boolean;
};

export type SourceTotal = { source: string; kind: IncomeKind; amount: number; count: number; share: number };

export type IncomeReport = {
  total: number;
  count: number;
  byKind: Record<IncomeKind, number>;
  previous: { range: DateRange; total: number } | null;
  // What went out and what was left, for the whole picture only.
  spending: number | null;
  kept: number | null;
  // The months the chart and table show (the period's own, or for a single
  // month the year up to it), and the one the period ends in.
  months: IncomeMonthRow[];
  highlight: string;
  // Over the period's complete months.
  averageMonth: number | null;
  best: IncomeMonthRow | null;
  slowest: IncomeMonthRow | null;
  sources: SourceTotal[];
  paychecks: {
    count: number;
    average: number | null;
    largest: IncomeEntry | null;
    smallest: IncomeEntry | null;
    typicalGapDays: number | null;
  };
  // The period's deposits, newest first.
  entries: IncomeEntry[];
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export function incomeReport(
  all: IncomeEntry[],
  spending: SpendingPoint[],
  range: DateRange,
  filters: IncomeFilters,
  todayIso: string
): IncomeReport {
  const wanted = all.filter((e) => matches(e, filters));
  const entries = wanted.filter((e) => inRange(e.date, range) && e.date <= todayIso).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const whole = !filtersOn(filters);

  const byKind: Record<IncomeKind, number> = { paycheck: 0, interest: 0, other: 0 };
  for (const e of entries) byKind[e.kind] += e.amount;
  for (const k of KINDS) byKind[k] = round(byKind[k]);
  const total = round(entries.reduce((s, e) => s + e.amount, 0));

  const prev = previousRange(range, todayIso);
  const previous = prev ? { range: prev, total: round(wanted.filter((e) => inRange(e.date, prev)).reduce((s, e) => s + e.amount, 0)) } : null;

  const spent = whole ? round(spending.filter((t) => inRange(t.date, range) && t.date <= todayIso).reduce((s, t) => s + t.amount, 0)) : null;

  // Month by month, over the months the chart shows.
  const earliest = all.reduce<string | null>((min, e) => (min === null || e.date < min ? e.date : min), null);
  const span = overTimeMonths(range, todayIso, earliest?.slice(0, 7) ?? null);
  const thisMonth = todayIso.slice(0, 7);
  const months: IncomeMonthRow[] = span.months.map((month) => {
    const inMonth = wanted.filter((e) => e.date.startsWith(month) && e.date <= todayIso);
    const sum = (k: IncomeKind) => round(inMonth.filter((e) => e.kind === k).reduce((s, e) => s + e.amount, 0));
    const income = round(inMonth.reduce((s, e) => s + e.amount, 0));
    const monthSpending = whole ? round(spending.filter((t) => t.date.startsWith(month) && t.date <= todayIso).reduce((s, t) => s + t.amount, 0)) : null;
    return {
      month,
      paycheck: sum("paycheck"),
      interest: sum("interest"),
      other: sum("other"),
      income,
      spending: monthSpending,
      kept: monthSpending === null ? null : round(income - monthSpending),
      complete: month !== thisMonth,
    };
  });

  // Best and slowest over the period's own complete months.
  const firstMonth = range.start?.slice(0, 7) ?? "";
  const lastMonth = range.end?.slice(0, 7) ?? thisMonth;
  const periodMonths = months.filter((m) => m.complete && m.month >= firstMonth && m.month <= lastMonth);
  const best = periodMonths.reduce<IncomeMonthRow | null>((b, m) => (b === null || m.income > b.income ? m : b), null);
  const slowest = periodMonths.reduce<IncomeMonthRow | null>((b, m) => (b === null || m.income < b.income ? m : b), null);
  const averageMonth = periodMonths.length ? round(periodMonths.reduce((s, m) => s + m.income, 0) / periodMonths.length) : null;

  const sourceMap = new Map<string, SourceTotal>();
  for (const e of entries) {
    const s = sourceMap.get(e.source) ?? { source: e.source, kind: e.kind, amount: 0, count: 0, share: 0 };
    s.amount += e.amount;
    s.count += 1;
    sourceMap.set(e.source, s);
  }
  const sources = [...sourceMap.values()]
    .map((s) => ({ ...s, amount: round(s.amount), share: total > 0 ? s.amount / total : 0 }))
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const checks = entries.filter((e) => e.kind === "paycheck" && e.amount > 0);
  const gaps = checks
    .slice(0, 25)
    .map((e, i, arr) => (i + 1 < arr.length ? dayNumber(e.date) - dayNumber(arr[i + 1].date) : null))
    .filter((g): g is number => g !== null && g > 0);

  return {
    total,
    count: entries.length,
    byKind,
    previous,
    spending: spent,
    kept: spent === null ? null : round(total - spent),
    months,
    highlight: span.highlight,
    averageMonth,
    best,
    // One month is its own best and slowest; name it once.
    slowest: best && slowest && best.month !== slowest.month ? slowest : null,
    sources,
    paychecks: {
      count: checks.length,
      average: checks.length ? round(checks.reduce((s, e) => s + e.amount, 0) / checks.length) : null,
      largest: checks.reduce<IncomeEntry | null>((m, e) => (m === null || e.amount > m.amount ? e : m), null),
      smallest: checks.reduce<IncomeEntry | null>((m, e) => (m === null || e.amount < m.amount ? e : m), null),
      typicalGapDays: median(gaps),
    },
    entries,
  };
}

export type RunningMonth = { month: number; thisYear: number | null; lastYear: number | null };

/**
 * Income added up month by month through this year, beside last year's, to
 * see at a glance whether this year is ahead. Null when last year has no
 * income on record (nothing to set it against).
 */
export function runningTotals(all: IncomeEntry[], filters: IncomeFilters, todayIso: string): RunningMonth[] | null {
  const year = Number(todayIso.slice(0, 4));
  const current = Number(todayIso.slice(5, 7));
  const wanted = all.filter((e) => matches(e, filters) && e.date <= todayIso);
  const byMonth = (y: number) => {
    const out = new Array<number>(12).fill(0);
    for (const e of wanted) if (Number(e.date.slice(0, 4)) === y) out[Number(e.date.slice(5, 7)) - 1] += e.amount;
    return out;
  };
  const last = byMonth(year - 1);
  if (last.every((v) => v === 0)) return null;
  const now = byMonth(year);
  let a = 0;
  let b = 0;
  return Array.from({ length: 12 }, (_, i) => {
    a += now[i];
    b += last[i];
    return { month: i + 1, thisYear: i + 1 <= current ? round(a) : null, lastYear: round(b) };
  });
}
