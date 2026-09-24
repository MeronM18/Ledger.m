// Pure. Each account's balance in the past, worked out backwards from its
// balance today and the transactions since, so the Accounts page can show a
// net worth line, a trend per account and each group's change without
// waiting for months of saved snapshots.
//
// A deposit account (an asset) was higher before money went out of it
// (Plaid's sign: positive is money out), so its balance at the end of a day
// is today's plus every amount posted after that day. A card or loan's
// balance is what's owed, which went up with each charge, so it's today's
// minus every amount posted after. Pending charges haven't reached the
// balance yet and are skipped. Things with no transactions (a car, cash
// entered by hand, metals) stay at today's value.

export type HistoryTx = { date: string; amount: number; pending?: boolean };

export type Period = "1M" | "3M" | "6M" | "1Y" | "ALL";

export const PERIODS: { value: Period; label: string; days: number | null }[] = [
  { value: "1M", label: "1 month", days: 30 },
  { value: "3M", label: "3 months", days: 91 },
  { value: "6M", label: "6 months", days: 182 },
  { value: "1Y", label: "1 year", days: 365 },
  { value: "ALL", label: "All time", days: null },
];

// How far back "All time" and the chart go at most.
export const MAX_HISTORY_DAYS = 730;

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * The balance at the end of each day from `fromIso` through `todayIso`,
 * oldest first (one value per day), ending on today's balance.
 */
export function dailyBalances(
  current: number,
  kind: "asset" | "liability",
  transactions: HistoryTx[],
  fromIso: string,
  todayIso: string
): number[] {
  const days = Math.max(0, daysBetween(fromIso, todayIso));
  // Net amount posted on each day after `fromIso`.
  const byDay = new Map<string, number>();
  for (const t of transactions) {
    if (t.pending || t.date <= fromIso || t.date > todayIso) continue;
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount);
  }
  const sign = kind === "asset" ? 1 : -1;
  const out = new Array<number>(days + 1);
  let balance = current;
  out[days] = round(balance);
  // Walk back a day at a time, undoing what posted on the later day.
  for (let i = days - 1; i >= 0; i--) {
    balance += sign * (byDay.get(addDays(fromIso, i + 1)) ?? 0);
    out[i] = round(balance);
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The first day of a period ending today: `days` back, or `allStart` for All time. */
export function periodStart(period: Period, todayIso: string, allStart: string): string {
  const days = PERIODS.find((p) => p.value === period)!.days;
  const start = days === null ? allStart : addDays(todayIso, -days);
  // Never before the history kept, never after today.
  const floor = addDays(todayIso, -MAX_HISTORY_DAYS);
  return start < floor ? floor : start > todayIso ? todayIso : start;
}

/** Change from the start of a daily series to its end; the series is oldest first. */
export function changeOver(series: number[], daysBack: number): number {
  if (series.length === 0) return 0;
  const end = series[series.length - 1];
  const start = series[Math.max(0, series.length - 1 - daysBack)];
  return round(end - start);
}

/** Every `step`th value, always keeping the last, for a light sparkline. */
export function thin(values: number[], maxPoints: number): number[] {
  if (values.length <= maxPoints) return values;
  const step = (values.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => values[Math.round(i * step)]);
}
