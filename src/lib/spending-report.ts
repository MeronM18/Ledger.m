// Pure. The Spending report's date ranges and its breakdown by category or
// merchant: what the donut, the legend and the list below all read, so
// they can't disagree.

import { categoryColorSlot, humanizeCategory, OTHER_CATEGORY_COLOR_SLOT } from "@/lib/plaid-categories";
import { displayCategoryKey, type SpendingTransaction } from "@/lib/spending-aggregation";
import { humanizeTransactionName } from "@/lib/transaction-display";

export type PeriodPreset = "this-month" | "last-month" | "last-3-months" | "this-year" | "last-year" | "all";

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "this-year", label: "This year" },
  { value: "last-year", label: "Last year" },
  { value: "all", label: "All time" },
];

export type DateRange = { start: string | null; end: string | null };

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/**
 * The days a period covers, inclusive: a preset relative to today, or one
 * month given as "YYYY-MM". All time has no bounds.
 */
export function periodRange(period: string, todayIso: string): DateRange {
  const y = Number(todayIso.slice(0, 4));
  const m = Number(todayIso.slice(5, 7)) - 1;
  if (/^\d{4}-\d{2}$/.test(period)) {
    const py = Number(period.slice(0, 4));
    const pm = Number(period.slice(5, 7)) - 1;
    return { start: iso(py, pm, 1), end: iso(py, pm, lastDay(py, pm)) };
  }
  switch (period as PeriodPreset) {
    case "this-month":
      return { start: iso(y, m, 1), end: iso(y, m, lastDay(y, m)) };
    case "last-month": {
      const py = m === 0 ? y - 1 : y;
      const pm = (m + 11) % 12;
      return { start: iso(py, pm, 1), end: iso(py, pm, lastDay(py, pm)) };
    }
    case "last-3-months": {
      // This month and the two before it.
      const sm = m - 2;
      const sy = sm < 0 ? y - 1 : y;
      return { start: iso(sy, (sm + 12) % 12, 1), end: iso(y, m, lastDay(y, m)) };
    }
    case "this-year":
      return { start: iso(y, 0, 1), end: iso(y, 11, 31) };
    case "last-year":
      return { start: iso(y - 1, 0, 1), end: iso(y - 1, 11, 31) };
    default:
      return { start: null, end: null };
  }
}

export function inRange(date: string, range: DateRange): boolean {
  return (range.start === null || date >= range.start) && (range.end === null || date <= range.end);
}

const shortDate = (d: string, withYear: boolean) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });

/** "Sep 1 – Sep 24, 2026": the range, ending today at the latest; "All time" without bounds. */
export function rangeLabel(range: DateRange, todayIso: string, earliest: string | null): string {
  const start = range.start ?? earliest;
  if (!start) return "All time";
  const end = range.end === null || range.end > todayIso ? todayIso : range.end;
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${shortDate(start, !sameYear)} – ${shortDate(end, true)}`;
}

function shiftMonth(month: string, by: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + by;
  return `${y + Math.floor(m / 12)}-${String(((m % 12) + 12) % 12 + 1).padStart(2, "0")}`;
}

/**
 * The months "Change over time" draws, oldest first, and the one it
 * compares (the month the period ends in, up to this one). A period of
 * several months draws those months (the last 24 at most); a single month
 * draws the year up to it, since one bar alone says nothing about change.
 * Nothing before `earliestMonth`, when the history starts.
 */
export function overTimeMonths(range: DateRange, todayIso: string, earliestMonth: string | null): { months: string[]; highlight: string } {
  const thisMonth = todayIso.slice(0, 7);
  const end = range.end !== null && range.end.slice(0, 7) < thisMonth ? range.end.slice(0, 7) : thisMonth;
  let start = range.start?.slice(0, 7) ?? earliestMonth ?? end;
  if (start >= end) start = shiftMonth(end, -11);
  if (earliestMonth && start < earliestMonth) start = earliestMonth;
  if (start > end) start = end;
  const months: string[] = [];
  for (let m = start; m <= end; m = shiftMonth(m, 1)) months.push(m);
  return { months: months.slice(-24), highlight: end };
}

/** "Sep 2026 – Aug 2026"-style span of a run of months. */
export function monthSpanLabel(months: string[]): string {
  if (months.length === 0) return "";
  const label = (m: string) =>
    new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const first = label(months[0]);
  const last = label(months[months.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}

export type BreakdownBy = "category" | "merchant";

export type BreakdownItem = {
  key: string;
  label: string;
  amount: number;
  // A category's own color slot (--viz-N); merchants take turns through them.
  colorSlot: number;
};

/** What a transaction counts toward: its category, or its merchant as shown. */
export function breakdownKey(t: SpendingTransaction, by: BreakdownBy): string {
  return by === "category" ? displayCategoryKey(t) : humanizeTransactionName(t);
}

/**
 * Spending split by category or merchant, largest first. Refunds come off
 * what they refunded; anything netting to zero or less is left out, as a
 * donut can't draw it, and counted in `credits` instead, so `total` is
 * always the net spent whichever way it's split. (By merchant, a waiver
 * is its own "merchant" with nothing to come off, where by category it
 * nets against the fee it waived.)
 */
export function breakdown(
  transactions: SpendingTransaction[],
  by: BreakdownBy
): { items: BreakdownItem[]; gross: number; credits: number; total: number } {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    const key = breakdownKey(t, by);
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }
  const all = Array.from(totals, ([key, amount]) => ({ key, amount: Math.round(amount * 100) / 100 }));
  const credits = Math.round(all.filter((i) => i.amount < 0).reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const items = all
    .filter((i) => i.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key))
    .map((i, index) => ({
      ...i,
      label: by === "category" ? (i.key === "OTHER" ? "Other" : humanizeCategory(i.key)) : i.key,
      colorSlot: by === "category" ? (categoryColorSlot(i.key) ?? OTHER_CATEGORY_COLOR_SLOT) : (index % 13) + 1,
    }));
  const gross = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  return { items, gross, credits, total: Math.round((gross + credits) * 100) / 100 };
}

export const EVERYTHING_ELSE = "__everything_else__";

/** The donut's slices: the largest `max - 1`, and the rest together as "Everything else". */
export function donutSlices(items: BreakdownItem[], max: number): BreakdownItem[] {
  if (items.length <= max) return items;
  const rest = items.slice(max - 1);
  return [
    ...items.slice(0, max - 1),
    {
      key: EVERYTHING_ELSE,
      label: "Everything else",
      amount: Math.round(rest.reduce((s, i) => s + i.amount, 0) * 100) / 100,
      colorSlot: OTHER_CATEGORY_COLOR_SLOT,
    },
  ];
}
