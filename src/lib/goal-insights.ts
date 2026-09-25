// Pure. What a savings goal's own history says about it, for someone whose
// pay swings: money gets moved into savings after a paycheck, in whatever
// amount the check allows, and the savings earn interest. So instead of only
// "set aside $X a month", a goal answers:
//
// - How fast is it really growing? The accounts it follows, day by day,
//   worked back from today's balances (account-history.ts), give its pace.
// - Where did the growth come from? Money moved in, interest, money out.
// - Will it land on time? Where the pace leaves it on the date, and when
//   the pace reaches the target.
// - What should I do now? The share of pay that finishes it on time (less
//   what interest adds), what that is in a lean month, and whether the
//   latest paycheck has had its share moved over yet.

import { addDays, dailyBalances, daysBetween } from "@/lib/account-history";
import type { GoalProgress } from "@/lib/goals";
import type { IncomeStats } from "@/lib/income";

const DAYS_PER_MONTH = 365.25 / 12;
// Pace is read over the last three months, or all the history there is.
const PACE_DAYS = 90;
// Less than three weeks of history says little about a pace.
const MIN_PACE_DAYS = 21;
// A paycheck older than this isn't "the latest" in any useful sense.
const PAYCHECK_FRESH_DAYS = 45;
// Reaching the target this long before the date counts as ahead.
const AHEAD_DAYS = 30;

const round = (n: number) => Math.round(n * 100) / 100;

export type GoalAccount = {
  ref: string; // "plaid:<id>" or "manual:<id>"
  balance: number; // today
  apy: number | null; // percent, 3.1 = 3.1%
  // Posted transactions, Plaid's sign (positive is money out), with the
  // ledger's id and name when there's a row to point to.
  transactions: { date: string; amount: number; interest: boolean; id?: string; name?: string }[];
};

/** One calendar month of a goal's accounts: money moved in, interest, money taken out. */
export type GoalMonth = { month: string; added: number; interest: number; out: number };

/** A recent movement in or out of a goal's accounts. */
export type GoalActivity = { id: string | null; ref: string; date: string; amount: number; name: string; interest: boolean };

export type PaySummary = {
  // What a typical complete month brought in from paychecks (or all income
  // when no paychecks are recognized): the median, so one huge commission
  // month doesn't set the bar.
  typicalMonth: number | null;
  // The leanest complete month, the one a plan has to survive.
  leanMonth: { month: string; amount: number } | null;
  // Share of income kept over the past year (0.2 = 20%).
  savingsRate: number | null;
  lastPaycheck: { date: string; amount: number } | null;
};

export type Verdict = "reached" | "ahead" | "on-pace" | "behind" | "stalled" | "overdue" | "open" | "unknown";

export type Milestone = {
  share: number; // 0.25, 0.5, 0.75, 1
  amount: number;
  reached: boolean;
  // When it was first reached (null if before the history starts), or when
  // the pace gets there (null if it never does).
  date: string | null;
};

export type GoalInsight = {
  // The amount saved at the end of every day from `start` through today;
  // null for a goal tracked by hand.
  history: { start: string; values: number[] } | null;
  // Growth a month over the pace window, all of it: money in, interest, out.
  pace: { perMonth: number; since: string } | null;
  flows: { since: string; added: number; deposits: number; interest: number; out: number } | null;
  // Balance-weighted yield of the accounts followed, and what it earns a month at today's balance.
  apy: number | null;
  interestPerMonth: number | null;
  verdict: Verdict;
  // Where the pace leaves the goal on its date.
  atTargetDate: number | null;
  // When the pace reaches the target.
  reachDate: string | null;
  plan: {
    // What to add a month to finish on time, after interest.
    perMonth: number;
    months: number;
    shareOfPay: number | null;
    leanMonth: { month: string; amount: number } | null;
    // Whether that share is within what's actually been kept of income.
    fits: boolean | null;
  } | null;
  nextMove: {
    paycheck: { date: string; amount: number };
    suggested: number;
    // Money moved into the goal's accounts since that paycheck; null when tracked by hand.
    moved: number | null;
  } | null;
  milestones: Milestone[];
  // The last six calendar months (this one so far last), from the goal's
  // own accounts; empty for a goal tracked by hand.
  months: GoalMonth[];
  // The latest money in and out, newest first.
  recent: GoalActivity[];
};

const MONTHS_SHOWN = 6;
const RECENT_SHOWN = 5;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The pay picture a plan is measured against, from the income page's numbers. */
export function paySummary(stats: IncomeStats): PaySummary {
  const complete = stats.months.filter((m) => m.complete);
  const usePaychecks = complete.some((m) => m.paychecks > 0);
  const amountOf = (m: (typeof complete)[number]) => (usePaychecks ? m.paychecks : m.income);
  const lean = complete.reduce<(typeof complete)[number] | null>((min, m) => (min === null || amountOf(m) < amountOf(min) ? m : min), null);
  const typical = median(complete.map(amountOf));
  const last = stats.paychecks.last;
  return {
    typicalMonth: typical !== null && typical > 0 ? typical : null,
    leanMonth: lean && amountOf(lean) > 0 ? { month: lean.month, amount: amountOf(lean) } : null,
    savingsRate: stats.savingsRate,
    lastPaycheck: last ? { date: last.date, amount: last.amount } : null,
  };
}

/** `days` from `iso`, as a date. */
function daysAfter(iso: string, days: number): string {
  return addDays(iso, Math.ceil(days));
}

export function goalInsight(
  goal: GoalProgress,
  accounts: GoalAccount[],
  pay: PaySummary,
  historyStart: string,
  todayIso: string
): GoalInsight {
  const tracked = goal.tracksAccount && accounts.length > 0;

  // The goal's balance, day by day: its accounts' balances added up.
  let history: GoalInsight["history"] = null;
  if (tracked) {
    const length = Math.max(1, daysBetween(historyStart, todayIso) + 1);
    const values = new Array<number>(length).fill(0);
    for (const a of accounts) {
      const series = dailyBalances(a.balance, "asset", a.transactions, historyStart, todayIso);
      for (let i = 0; i < length; i++) values[i] += series[i] ?? a.balance;
    }
    history = { start: historyStart, values: values.map(round) };
  }

  // Pace and where it came from, over the same window.
  let pace: GoalInsight["pace"] = null;
  let flows: GoalInsight["flows"] = null;
  if (history && history.values.length - 1 >= MIN_PACE_DAYS) {
    const days = Math.min(PACE_DAYS, history.values.length - 1);
    const since = addDays(todayIso, -days);
    const end = history.values[history.values.length - 1];
    const start = history.values[history.values.length - 1 - days];
    pace = { perMonth: round(((end - start) / days) * DAYS_PER_MONTH), since };

    const f = { since, added: 0, deposits: 0, interest: 0, out: 0 };
    for (const a of accounts) {
      for (const t of a.transactions) {
        if (t.date <= since || t.date > todayIso) continue;
        if (t.amount < 0 && t.interest) f.interest -= t.amount;
        else if (t.amount < 0) {
          f.added -= t.amount;
          f.deposits += 1;
        } else f.out += t.amount;
      }
    }
    flows = { ...f, added: round(f.added), interest: round(f.interest), out: round(f.out) };
  }

  // Interest at today's balances, weighted by where the money sits.
  const withApy = tracked ? accounts.filter((a) => a.apy !== null && a.balance > 0) : [];
  const apyBase = withApy.reduce((s, a) => s + a.balance, 0);
  const apy = apyBase > 0 ? withApy.reduce((s, a) => s + a.balance * (a.apy as number), 0) / apyBase : null;
  const interestPerMonth = apy !== null ? round((goal.saved * apy) / 100 / 12) : null;

  // Where the pace leads.
  const remaining = goal.remaining;
  // Growth so slow it would take more than 50 years isn't a pace to plan on.
  const growing = pace !== null && pace.perMonth > 0 && remaining / pace.perMonth <= 600;
  const reachDate = goal.status === "complete" ? null : growing ? daysAfter(todayIso, (remaining / pace!.perMonth) * DAYS_PER_MONTH) : null;
  const daysToDate = goal.targetDate ? daysBetween(todayIso, goal.targetDate) : null;
  const atTargetDate =
    pace !== null && daysToDate !== null && daysToDate >= 0 ? round(goal.saved + (pace.perMonth * daysToDate) / DAYS_PER_MONTH) : null;

  let verdict: Verdict;
  if (goal.status === "complete") verdict = "reached";
  else if (goal.targetDate && goal.targetDate < todayIso) verdict = "overdue";
  else if (pace === null) verdict = "unknown";
  else if (!growing) verdict = "stalled";
  else if (!goal.targetDate) verdict = "open";
  else if (reachDate! <= goal.targetDate) verdict = daysBetween(reachDate!, goal.targetDate) >= AHEAD_DAYS ? "ahead" : "on-pace";
  else verdict = "behind";

  // The plan: what finishes it on time, in dollars and as a share of pay.
  let plan: GoalInsight["plan"] = null;
  if (goal.neededPerMonth !== null && goal.monthsLeft !== null) {
    const perMonth = round(Math.max(0, goal.neededPerMonth - (interestPerMonth ?? 0)));
    const share = pay.typicalMonth ? perMonth / pay.typicalMonth : null;
    plan = {
      perMonth,
      months: goal.monthsLeft,
      shareOfPay: share,
      leanMonth: share !== null && pay.leanMonth ? { month: pay.leanMonth.month, amount: round(share * pay.leanMonth.amount) } : null,
      fits: share !== null && pay.savingsRate !== null ? share <= pay.savingsRate : null,
    };
  }

  // The latest paycheck's share, and whether it's been moved over.
  let nextMove: GoalInsight["nextMove"] = null;
  const check = pay.lastPaycheck;
  if (plan?.shareOfPay != null && plan.perMonth > 0 && check && daysBetween(check.date, todayIso) <= PAYCHECK_FRESH_DAYS) {
    const moved = tracked
      ? round(
          accounts.reduce(
            (s, a) => s + a.transactions.filter((t) => t.date >= check.date && t.date <= todayIso && t.amount < 0 && !t.interest).reduce((x, t) => x - t.amount, 0),
            0
          )
        )
      : null;
    nextMove = { paycheck: check, suggested: round(plan.shareOfPay * check.amount), moved };
  }

  // A quarter at a time: when each was first reached, or when the pace gets there.
  const milestones: Milestone[] = [0.25, 0.5, 0.75, 1].map((share) => {
    const amount = round(goal.target * share);
    if (goal.saved >= amount) {
      const first = history ? history.values.findIndex((v) => v >= amount) : -1;
      return { share, amount, reached: true, date: first > 0 && history ? addDays(history.start, first) : null };
    }
    return {
      share,
      amount,
      reached: false,
      date: growing ? daysAfter(todayIso, ((amount - goal.saved) / pace!.perMonth) * DAYS_PER_MONTH) : null,
    };
  });

  // Month by month, from the month history starts in (a month before that
  // would read as nothing saved, which isn't known).
  const months: GoalMonth[] = [];
  if (tracked) {
    const [ty, tm] = todayIso.split("-").map(Number);
    for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(ty, tm - 1 - i, 1));
      const key = d.toISOString().slice(0, 7);
      if (key < historyStart.slice(0, 7)) continue;
      const m = { month: key, added: 0, interest: 0, out: 0 };
      for (const a of accounts) {
        for (const t of a.transactions) {
          if (t.date.slice(0, 7) !== key || t.date > todayIso) continue;
          if (t.amount < 0 && t.interest) m.interest -= t.amount;
          else if (t.amount < 0) m.added -= t.amount;
          else m.out += t.amount;
        }
      }
      months.push({ month: key, added: round(m.added), interest: round(m.interest), out: round(m.out) });
    }
  }

  const recent: GoalActivity[] = tracked
    ? accounts
        .flatMap((a) =>
          a.transactions
            .filter((t) => t.date <= todayIso)
            .map((t) => ({ id: t.id ?? null, ref: a.ref, date: t.date, amount: round(-t.amount), name: t.name ?? (t.interest ? "Interest" : "Transfer"), interest: t.interest }))
        )
        .sort((x, y) => y.date.localeCompare(x.date))
        .slice(0, RECENT_SHOWN)
    : [];

  return { history, pace, flows, apy, interestPerMonth, verdict, atTargetDate, reachDate, plan, nextMove, milestones, months, recent };
}
