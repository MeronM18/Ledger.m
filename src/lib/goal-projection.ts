import { monthsUntil } from "@/lib/goals";

// Pure. Where a goal would stand at the end of each month if you added a set
// amount every month, counting this month as the first. Your date's column
// is counted the way the monthly amount needed is (goals.ts): Sep 25 to Dec
// 31 is four months of saving, September through December; Sep 25 to Feb 2
// is five, since February's comes after the 2nd.

export type ProjectedMonth = {
  // "YYYY-MM", or null for the first column, today.
  month: string | null;
  // What's there by then, split by where it came from, capped at the target.
  saved: number;
  added: number;
  interest: number;
  total: number;
  reached: boolean;
};

export type Projection = {
  // Today first, then each month.
  columns: ProjectedMonth[];
  // The column of the month with your date, and of the month it's reached.
  dueIndex: number | null;
  finishIndex: number | null;
  // "YYYY-MM" it's reached, even past the last column shown.
  finishMonth: string | null;
  // What's there by your date (uncapped), and how far that is from the target.
  atDue: number | null;
  shortAtDue: number | null;
  // Months after (+) or before (-) your date that it's reached.
  monthsLate: number | null;
  // It's reached after the last column shown.
  truncated: boolean;
};

export function addMonthsKey(monthKey: string, n: number): string {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7)) - 1 + n;
  return `${y + Math.floor(m / 12)}-${String((((m % 12) + 12) % 12) + 1).padStart(2, "0")}`;
}

export function projectGoal(input: {
  saved: number;
  target: number;
  // What you'd add each month, and what interest adds on top.
  perMonth: number;
  interestPerMonth: number;
  todayIso: string;
  targetDate: string | null;
  // Fewest and most months to draw.
  minMonths?: number;
  maxMonths?: number;
}): Projection {
  const { saved, target, perMonth, todayIso, targetDate } = input;
  const interest = Math.max(0, input.interestPerMonth);
  const minMonths = input.minMonths ?? 6;
  const maxMonths = input.maxMonths ?? 36;
  const thisMonth = todayIso.slice(0, 7);
  const remaining = Math.max(0, target - saved);
  const growth = Math.max(0, perMonth) + interest;

  // Month k (1-based) is this month + k - 1.
  const finishIndex = remaining === 0 ? 0 : growth > 0 ? Math.ceil(remaining / growth - 1e-9) : null;
  const dueIndex = targetDate ? monthsUntil(todayIso, targetDate) : null;
  const wanted = Math.max(finishIndex ?? 12, dueIndex ?? 0, minMonths);
  const count = Math.min(wanted, maxMonths);

  const columns: ProjectedMonth[] = Array.from({ length: count + 1 }, (_, k) => {
    const room = Math.max(0, target - saved);
    const added = Math.min(Math.max(0, perMonth) * k, room);
    const earned = Math.min(interest * k, room - added);
    const total = Math.min(target, saved + added + earned);
    return {
      month: k === 0 ? null : addMonthsKey(thisMonth, k - 1),
      saved: Math.min(saved, target),
      added,
      interest: earned,
      total,
      reached: saved + growth * k >= target - 0.005,
    };
  });

  const atDue = dueIndex !== null ? saved + growth * dueIndex : null;
  return {
    columns,
    dueIndex: dueIndex !== null && dueIndex <= count ? dueIndex : null,
    finishIndex: finishIndex !== null && finishIndex <= count ? finishIndex : null,
    finishMonth: finishIndex === null ? null : finishIndex === 0 ? thisMonth : addMonthsKey(thisMonth, finishIndex - 1),
    atDue,
    shortAtDue: atDue !== null ? Math.max(0, target - atDue) : null,
    monthsLate: finishIndex !== null && dueIndex !== null ? finishIndex - dueIndex : null,
    truncated: finishIndex === null || finishIndex > count,
  };
}
