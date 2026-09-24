import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/account-history";
import { goalInsight, paySummary, type GoalAccount, type PaySummary } from "@/lib/goal-insights";
import { goalProgress } from "@/lib/goals";
import type { IncomeStats } from "@/lib/income";

const TODAY = "2026-09-24";
const START = "2026-05-01";

// A high-yield savings account and Apple Savings, like the business fund.
const hysa: GoalAccount = {
  ref: "plaid:hysa",
  balance: 8000,
  apy: 3,
  transactions: [
    { date: "2026-07-15", amount: -1000, interest: false }, // moved over after a paycheck
    { date: "2026-07-31", amount: -19, interest: true },
    { date: "2026-08-10", amount: 300, interest: false }, // taken out
    { date: "2026-08-31", amount: -20, interest: true },
    { date: "2026-09-20", amount: -500, interest: false },
  ],
};
const apple: GoalAccount = {
  ref: "manual:apple",
  balance: 500,
  apy: 3.5,
  transactions: [{ date: "2026-09-01", amount: -100, interest: false }],
};

const pay: PaySummary = {
  typicalMonth: 5000,
  leanMonth: { month: "2026-03", amount: 3000 },
  savingsRate: 0.25,
  lastPaycheck: { date: "2026-09-19", amount: 4000 },
};

function progress(target: number, date: string | null, refs = [hysa.ref, apple.ref], savedByHand = 0) {
  const balances = new Map([
    [hysa.ref, hysa.balance],
    [apple.ref, apple.balance],
  ]);
  return goalProgress(
    { id: "g", name: "Start a Business", target_amount: target, saved_amount: savedByHand, target_date: date, account_refs: refs },
    TODAY,
    balances
  );
}

describe("goalInsight", () => {
  const insight = goalInsight(progress(15000, "2026-12-31"), [hysa, apple], pay, START, TODAY);

  it("adds the accounts up day by day, ending on what's saved today", () => {
    const values = insight.history!.values;
    expect(insight.history!.start).toBe(START);
    expect(values.at(-1)).toBe(8500);
    // Before any of it moved: 8500 - 1500 in - 39 interest + 300 out - 100 in.
    expect(values[0]).toBe(8500 - 1000 - 19 + 300 - 20 - 500 - 100);
  });

  it("splits the pace window's growth into money in, interest and money out, which add up to it", () => {
    const f = insight.flows!;
    expect(f.since).toBe(addDays(TODAY, -90));
    expect(f).toMatchObject({ added: 1600, deposits: 3, interest: 39, out: 300 });
    const values = insight.history!.values;
    const net = values.at(-1)! - values[values.length - 1 - 90];
    expect(net).toBeCloseTo(f.added + f.interest - f.out, 2);
    expect(insight.pace!.perMonth).toBeCloseTo((net / 90) * (365.25 / 12), 1);
  });

  it("weights the yield by where the money is and counts what it earns a month", () => {
    expect(insight.apy).toBeCloseTo((8000 * 3 + 500 * 3.5) / 8500, 6);
    expect(insight.interestPerMonth).toBeCloseTo((8500 * insight.apy!) / 100 / 12, 2);
  });

  it("says where the pace leaves the goal and when it would get there", () => {
    // ~$452 a month can't find $6,500 in three months.
    expect(insight.verdict).toBe("behind");
    expect(insight.atTargetDate!).toBeLessThan(15000);
    expect(insight.reachDate! > "2026-12-31").toBe(true);
  });

  it("plans what to add after interest, as a share of pay, in a lean month, and against what's been kept", () => {
    const p = progress(15000, "2026-12-31");
    const plan = insight.plan!;
    expect(plan.months).toBe(p.monthsLeft);
    expect(plan.perMonth).toBeCloseTo(p.neededPerMonth! - insight.interestPerMonth!, 2);
    expect(plan.shareOfPay).toBeCloseTo(plan.perMonth / 5000, 6);
    expect(plan.leanMonth).toEqual({ month: "2026-03", amount: Math.round(plan.shareOfPay! * 3000 * 100) / 100 });
    // Over 25% of pay is more than has actually been kept.
    expect(plan.shareOfPay!).toBeGreaterThan(0.25);
    expect(plan.fits).toBe(false);
  });

  it("asks for the latest paycheck's share and counts what's been moved since (not interest)", () => {
    const move = insight.nextMove!;
    expect(move.paycheck).toEqual({ date: "2026-09-19", amount: 4000 });
    expect(move.suggested).toBeCloseTo(insight.plan!.shareOfPay! * 4000, 1);
    expect(move.moved).toBe(500);
  });

  it("dates the quarters already reached and the ones the pace will reach", () => {
    const [q1, half, q3, full] = insight.milestones;
    // $3,750 was reached before the history starts; $7,500 when July's $1,000 landed.
    expect(q1).toMatchObject({ amount: 3750, reached: true, date: null });
    expect(half).toMatchObject({ amount: 7500, reached: true, date: "2026-07-15" });
    expect(q3.reached).toBe(false);
    expect(q3.date! < full.date!).toBe(true);
    expect(full.date).toBe(insight.reachDate);
  });

  it("is on pace when the pace gets there by the date, and ahead with a month to spare", () => {
    expect(goalInsight(progress(9000, "2027-03-01"), [hysa, apple], pay, START, TODAY).verdict).toBe("ahead");
    const close = goalInsight(progress(9000, "2026-11-10"), [hysa, apple], pay, START, TODAY);
    expect(close.reachDate! <= "2026-11-10").toBe(true);
    expect(close.verdict).toBe("on-pace");
  });

  it("calls a shrinking goal stalled and gives no date for it", () => {
    const leaking: GoalAccount = { ...hysa, transactions: [{ date: "2026-09-01", amount: 900, interest: false }] };
    const stalled = goalInsight(progress(15000, "2026-12-31", [hysa.ref]), [leaking], pay, START, TODAY);
    expect(stalled.verdict).toBe("stalled");
    expect(stalled.reachDate).toBeNull();
    expect(stalled.milestones.filter((m) => !m.reached).every((m) => m.date === null)).toBe(true);
  });

  it("still plans a goal tracked by hand, without a pace or a history", () => {
    const byHand = goalInsight(progress(5000, "2026-12-31", [], 1000), [], pay, START, TODAY);
    expect(byHand.history).toBeNull();
    expect(byHand.pace).toBeNull();
    expect(byHand.verdict).toBe("unknown");
    expect(byHand.plan!.perMonth).toBeCloseTo(4000 / progress(5000, "2026-12-31", [], 1000).monthsLeft!, 2);
    expect(byHand.nextMove!.moved).toBeNull();
  });

  it("marks a goal with no date as open-ended, with a reach date but no plan", () => {
    const open = goalInsight(progress(9000, null), [hysa, apple], pay, START, TODAY);
    expect(open.verdict).toBe("open");
    expect(open.reachDate).not.toBeNull();
    expect(open.plan).toBeNull();
    expect(open.nextMove).toBeNull();
  });

  it("skips an old paycheck", () => {
    const stale = goalInsight(progress(15000, "2026-12-31"), [hysa, apple], { ...pay, lastPaycheck: { date: "2026-07-01", amount: 4000 } }, START, TODAY);
    expect(stale.nextMove).toBeNull();
  });
});

describe("paySummary", () => {
  const month = (m: string, income: number, paychecks: number, complete = true) => ({
    month: m,
    label: m,
    income,
    paychecks,
    spending: 0,
    net: 0,
    complete,
  });
  const stats = (months: ReturnType<typeof month>[]) =>
    ({ months, savingsRate: 0.2, paychecks: { last: { date: "2026-09-19", amount: 4000, source: "Pay", kind: "paycheck" } } }) as unknown as IncomeStats;

  it("takes the median paycheck month, so one huge month doesn't set the bar, and the leanest one", () => {
    const s = paySummary(stats([month("2026-06", 5200, 5000), month("2026-07", 21000, 20000), month("2026-08", 3100, 3000), month("2026-09", 900, 800, false)]));
    expect(s.typicalMonth).toBe(5000);
    expect(s.leanMonth).toEqual({ month: "2026-08", amount: 3000 });
    expect(s.savingsRate).toBe(0.2);
    expect(s.lastPaycheck).toEqual({ date: "2026-09-19", amount: 4000 });
  });

  it("falls back to all income when no paychecks are recognized", () => {
    const s = paySummary(stats([month("2026-07", 4000, 0), month("2026-08", 6000, 0)]));
    expect(s.typicalMonth).toBe(5000);
    expect(s.leanMonth).toEqual({ month: "2026-07", amount: 4000 });
  });
});
