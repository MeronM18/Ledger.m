// Pure, dependency-free.

export type GoalStatus = "complete" | "on-track" | "behind" | "no-date";

export type GoalInput = {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  target_date: string | null; // YYYY-MM-DD
  account_id: string | null;
};

export type GoalProgress = {
  id: string;
  name: string;
  target: number;
  saved: number;
  remaining: number; // 0 once complete
  percent: number; // 0..1, capped at 1
  status: GoalStatus;
  targetDate: string | null;
  // Whole calendar months from today to the target date, at least 1; null with no date or once it has passed.
  monthsLeft: number | null;
  // What to set aside each month to finish on time.
  neededPerMonth: number | null;
  tracksAccount: boolean;
};

/** Whole months from `todayIso` to `dateIso`, counting a partial month as a month; null if the date has passed. */
export function monthsUntil(todayIso: string, dateIso: string): number | null {
  if (dateIso < todayIso) return null;
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const [dy, dm, dd] = dateIso.split("-").map(Number);
  let months = (dy - ty) * 12 + (dm - tm);
  if (dd > td) months += 1;
  return Math.max(1, months);
}

/**
 * `balances` maps account id to current balance for goals that follow an
 * account. A goal pointing at an account with no known balance falls back to
 * its manual saved_amount rather than showing $0.
 */
export function goalProgress(
  goal: GoalInput,
  todayIso: string,
  balances: Map<string, number> = new Map()
): GoalProgress {
  const linked = goal.account_id !== null && balances.has(goal.account_id);
  const saved = Math.max(0, linked ? (balances.get(goal.account_id as string) as number) : goal.saved_amount);
  const remaining = Math.max(0, goal.target_amount - saved);
  const percent = Math.min(1, saved / goal.target_amount);
  const complete = saved >= goal.target_amount;

  const monthsLeft = goal.target_date ? monthsUntil(todayIso, goal.target_date) : null;
  const neededPerMonth = !complete && monthsLeft !== null ? remaining / monthsLeft : null;

  let status: GoalStatus;
  if (complete) status = "complete";
  else if (!goal.target_date) status = "no-date";
  else if (monthsLeft === null) status = "behind"; // the date passed and it isn't done
  else status = "on-track";

  return {
    id: goal.id,
    name: goal.name,
    target: goal.target_amount,
    saved,
    remaining,
    percent,
    status,
    targetDate: goal.target_date,
    monthsLeft,
    neededPerMonth,
    tracksAccount: linked,
  };
}

export function goalsSummary(progress: GoalProgress[]): { saved: number; target: number; completed: number } {
  return {
    saved: progress.reduce((s, g) => s + Math.min(g.saved, g.target), 0),
    target: progress.reduce((s, g) => s + g.target, 0),
    completed: progress.filter((g) => g.status === "complete").length,
  };
}
